"""Cálculo en dos niveles, revisión y confirmación trazable de gastos."""

import json
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import delete, select
from app.core.clock import utc_now
from app.models.entities import AuditEvent, Unit
from app.models.tenancy import Contract, ContractOccupant, ContractOwner
from app.models.utilities import (
    UtilityConfiguration,
    UtilityConfigurationUnit,
    UtilityReceipt,
    UtilityReceiptRevision,
    UtilityDistribution,
    UtilityAllocation,
    UtilityResponsibility,
    UtilityCurrentDistribution,
    UtilityMeter,
    MeterReading,
)
from app.services import utilities as registry
from app.services.tenancy import (
    manage,
    check_version,
    target_filter,
    validate_people,
    retain_contacts,
)
from app.services.utility_math import CENT, apportion, occupied_days, occupant_theory


def evidence(obj):
    return json.loads(obj.evidence)


def source_contracts(db, account, revision):
    contracts = registry.rows(
        db,
        select(Contract).where(
            target_filter(Contract, account.property_id, None),
            Contract.status.in_(["active", "finished"]),
            Contract.start_date <= revision.period_end,
        ),
        True,
    )
    result = []
    for c in contracts:
        end = c.actual_end_date or c.end_date
        days = occupied_days(
            c.start_date, end, revision.period_start, revision.period_end
        )
        if not days:
            continue
        occupants = registry.rows(
            db,
            select(ContractOccupant).where(ContractOccupant.contract_id == c.id),
            True,
        )
        owners = registry.rows(
            db, select(ContractOwner).where(ContractOwner.contract_id == c.id), True
        )
        history = registry.rows(
            db,
            select(AuditEvent).where(
                AuditEvent.entity_type == "contracts",
                AuditEvent.entity_id == c.id,
                AuditEvent.action == "update",
            ),
            True,
        )
        people = {c.responsible_person_id, *[p.person_id for p in occupants]}
        historical_change = False
        exempt = c.mode == "daily" or c.services_included
        for event in history:
            document = json.loads(event.details)
            before = document.get("before") or {}
            after = document.get("after") or {}
            fields = [
                "responsible_person_id",
                "occupant_ids",
                "mode",
                "services_included",
                "start_date",
                "end_date",
                "unit_id",
                "property_id",
            ]
            if any(before.get(k) != after.get(k) for k in fields):
                historical_change = True
                for snapshot in [before, after]:
                    people.update(snapshot.get("occupant_ids", []))
                    if snapshot.get("responsible_person_id"):
                        people.add(snapshot["responsible_person_id"])
                    exempt = (
                        exempt
                        or snapshot.get("mode") == "daily"
                        or snapshot.get("services_included", False)
                    )
        result.append(
            {
                "id": c.id,
                "version": c.version,
                "unit_id": c.unit_id,
                "property_id": c.property_id,
                "responsible_person_id": c.responsible_person_id,
                "people": sorted(people),
                "current_people": sorted(
                    {c.responsible_person_id, *[p.person_id for p in occupants]}
                ),
                "owner_ids": [p.person_id for p in owners],
                "mode": c.mode,
                "services_included": c.services_included,
                "exempt": bool(exempt),
                "historical_change": historical_change,
                "occupied_days": days,
                "start_date": max(c.start_date, revision.period_start).isoformat(),
                "end_date": min(end, revision.period_end).isoformat(),
            }
        )
    return result


def reading_consumption(db, account_id, unit_id, start, end):
    meters = registry.rows(
        db,
        select(UtilityMeter)
        .where(
            UtilityMeter.account_id == account_id,
            UtilityMeter.unit_id == unit_id,
            UtilityMeter.installed_on <= end,
        )
        .order_by(UtilityMeter.installed_on, UtilityMeter.id),
        True,
    )
    meters = [m for m in meters if m.retired_on is None or m.retired_on >= start]
    issues = []
    proof = []
    total = Decimal(0)
    coverage = []
    for meter in meters:
        first, last = max(start, meter.installed_on), min(end, meter.retired_on or end)
        readings = registry.rows(
            db, select(MeterReading).where(MeterReading.meter_id == meter.id), True
        )
        initial = next((r for r in readings if r.recorded_on == first), None)
        final = next((r for r in readings if r.recorded_on == last), None)
        if initial is None or final is None or first == last:
            issues.append(
                f"Faltan lecturas de apertura/cierre del medidor {meter.serial} entre {first} y {last}."
            )
        else:
            total += final.value - initial.value
            proof.extend(
                [
                    {
                        "id": initial.id,
                        "version": initial.version,
                        "meter_id": meter.id,
                        "meter_version": meter.version,
                        "value": str(initial.value),
                        "date": first.isoformat(),
                    },
                    {
                        "id": final.id,
                        "version": final.version,
                        "meter_id": meter.id,
                        "meter_version": meter.version,
                        "value": str(final.value),
                        "date": last.isoformat(),
                    },
                ]
            )
        coverage.append((first, last))
    cursor = start - timedelta(days=1)
    for first, last in coverage:
        if first > cursor + timedelta(days=1):
            issues.append(
                "Hay días del periodo sin un medidor documentado; revise los consumos."
            )
        cursor = max(cursor, last)
    if not meters or cursor < end:
        issues.append("No hay lecturas completas para este espacio y periodo.")
    return total, proof, issues


def dist_context(db, user, id, write=False):
    obj = db.get(UtilityDistribution, id)
    if obj is None:
        raise HTTPException(404, "No se encontró la distribución o no tiene acceso.")
    rev = db.get(UtilityReceiptRevision, obj.receipt_revision_id)
    receipt, account = registry.receipt_context(db, user, rev.receipt_id, write)
    if write:
        obj = registry.fresh(db, UtilityDistribution, id)
    return obj, receipt, account


def distribution_dict(db, obj):
    revision = db.get(UtilityReceiptRevision, obj.receipt_revision_id)
    receipt = db.get(UtilityReceipt, revision.receipt_id)
    current = db.get(UtilityCurrentDistribution, receipt.id)
    allocations = registry.rows(
        db,
        select(UtilityAllocation)
        .where(UtilityAllocation.distribution_id == obj.id)
        .order_by(UtilityAllocation.id),
    )
    values = []
    for a in allocations:
        responsibilities = registry.rows(
            db,
            select(UtilityResponsibility)
            .where(UtilityResponsibility.allocation_id == a.id)
            .order_by(UtilityResponsibility.id),
        )
        basis = next(s for s in evidence(obj)["spaces"] if s["unit_id"] == a.unit_id)

        def responsibility(r):
            source = next(
                (c for c in basis["contracts"] if c["id"] == r.contract_id), None
            )
            return {
                **registry.scalar_dict(r),
                "kind": "occupant" if r.contract_id is not None else "owner",
                "occupied_days": source["occupied_days"] if source else None,
                "theoretical_amount": source["theoretical_amount"] if source else None,
            }

        values.append(
            {
                **registry.scalar_dict(a),
                "unit_label": registry.unit_label(db, a.unit_id),
                "responsibilities": [responsibility(r) for r in responsibilities],
            }
        )
    config = db.get(UtilityConfiguration, obj.configuration_id)
    return {
        **registry.scalar_dict(obj),
        "evidence": evidence(obj),
        "allocations": values,
        "receipt_id": receipt.id,
        "receipt_version": receipt.version,
        "receipt": registry.scalar_dict(revision),
        "configuration": registry.config_dict(db, config),
        "is_current": bool(current and current.distribution_id == obj.id),
        "assigned_total": str(sum((a.amount for a in allocations), Decimal(0))),
        "responsibility_total": str(
            sum(
                (Decimal(r["amount"]) for a in values for r in a["responsibilities"]),
                Decimal(0),
            )
        ),
        "payment_recorded": False,
    }


def calculate(db, user, receipt_id, data):
    receipt, account = registry.receipt_context(db, user, receipt_id, True)
    existing = (
        db.scalar(
            select(UtilityDistribution)
            .where(UtilityDistribution.request_key == data.request_key)
            .with_for_update()
        )
        if data.request_key
        else None
    )
    if existing:
        origin = db.get(UtilityReceiptRevision, existing.receipt_revision_id)
        if origin.receipt_id != receipt_id:
            raise HTTPException(409, "Esta solicitud ya corresponde a otro recibo.")
        return existing
    check_version(receipt, data.expected_version)
    current = registry.current_distribution(db, receipt_id, True)
    if current and (
        not data.adjustment or not data.reason or len(data.reason.strip()) < 3
    ):
        raise HTTPException(
            409,
            "Existe un reparto confirmado. Para proponer una corrección indique el motivo; el anterior se conservará.",
        )
    revision = registry.latest_revision(db, receipt_id, True)
    config = (
        registry.fresh(db, UtilityConfiguration, data.configuration_id)
        if data.configuration_id
        else registry.latest_configuration(db, account.id, True)
    )
    if config is None or config.account_id != account.id:
        raise HTTPException(422, "Seleccione una configuración de este servicio.")
    participants = registry.rows(
        db,
        select(UtilityConfigurationUnit)
        .where(UtilityConfigurationUnit.configuration_id == config.id)
        .order_by(UtilityConfigurationUnit.unit_id),
        True,
    )
    selected_ids = [p.unit_id for p in participants]
    contracts = source_contracts(db, account, revision)
    contracts = [
        c
        for c in contracts
        if c["property_id"] is not None
        or not selected_ids
        or c["unit_id"] in selected_ids
    ]
    whole = [c for c in contracts if c["property_id"] is not None]
    issues = []
    spaces = selected_ids or [None]
    if whole:
        spaces = [None]
        if any(c["unit_id"] is not None for c in contracts):
            issues.append(
                "El periodo combina casa completa y cuartos en fechas diferentes. Revise las responsabilidades antes de confirmar."
            )
    elif spaces == [None] and contracts:
        issues.append(
            "El servicio corresponde a la casa completa pero existen contratos de cuartos. Revise los importes o configure los cuartos participantes."
        )
    weights = []
    readings = []
    by_space = {}
    denominator = (revision.period_end - revision.period_start).days + 1
    for unit_id in spaces:
        selected = [
            c
            for c in contracts
            if unit_id is None
            or c["property_id"] is not None
            or c["unit_id"] == unit_id
        ]
        by_space[str(unit_id)] = selected
        if any(c["historical_change"] for c in selected):
            issues.append(
                f"{registry.unit_label(db,unit_id)} tiene cambios contractuales sin fechas individuales de vigencia. Revise las personas y condiciones históricas."
            )
        if config.method == "percentage":
            weight = next(
                (p.percentage for p in participants if p.unit_id == unit_id),
                Decimal(100) if unit_id is None else Decimal(0),
            )
        elif config.method == "occupants":
            weight = sum(
                (
                    Decimal(c["occupied_days"] * len(c["current_people"]))
                    for c in selected
                ),
                Decimal(0),
            )
        elif config.method == "readings" and len(spaces) > 1:
            weight, proof, missing = reading_consumption(
                db, account.id, unit_id, revision.period_start, revision.period_end
            )
            readings.extend(proof)
            issues.extend(missing)
        else:
            weight = Decimal(1)
        weights.append(weight)
    if config.method == "occupants" and sum(weights) == 0:
        weights = [Decimal(1)] * len(spaces)
        # Sin ocupantes, el reparto por igual corresponde enteramente al responsable del propietario.
    if config.method == "readings" and len(spaces) > 1 and sum(weights) == 0:
        issues.append(
            "No hay consumo medido para repartir la parte variable. Indique un reparto manual con motivo."
        )
    if (
        config.method == "readings"
        and revision.consumption is not None
        and sum(weights) > revision.consumption
    ):
        issues.append(
            "Los consumos de los cuartos superan el consumo registrado por el proveedor. Revise lecturas y componente común."
        )
    if config.method == "manual":
        if not data.reason or len(data.reason.strip()) < 3:
            issues.append("Justifique el reparto manual antes de confirmarlo.")
        manual = {p.unit_id: p.amount for p in data.manual_amounts}
        if (
            len(manual) != len(data.manual_amounts)
            or set(manual) != set(spaces)
            or sum(manual.values(), Decimal(0)) != revision.amount
        ):
            issues.append(
                "Indique un importe manual por espacio cuya suma coincida exactamente con el recibo."
            )
            assigned, residues = apportion(revision.amount, [Decimal(1)] * len(spaces))
        else:
            assigned = [manual[id] for id in spaces]
            residues = []
    elif config.method == "readings" and revision.fixed_amount > 0:
        fixed, fixed_residues = apportion(
            revision.fixed_amount, [Decimal(1)] * len(spaces)
        )
        variable, residues = apportion(revision.amount - revision.fixed_amount, weights)
        assigned = [a + b for a, b in zip(fixed, variable)]
    else:
        assigned, residues = apportion(revision.amount, weights)
    obj = UtilityDistribution(
        receipt_revision_id=revision.id,
        configuration_id=config.id,
        request_key=data.request_key or uuid4().hex,
        status="calculated",
        version=1,
        evidence="{}",
        reason=data.reason,
        supersedes_id=current.distribution_id if current else None,
        created_by=user.id,
    )
    db.add(obj)
    db.flush()
    space_evidence = []
    for unit_id, amount, weight in zip(spaces, assigned, weights):
        allocation = UtilityAllocation(
            distribution_id=obj.id, unit_id=unit_id, amount=amount, weight=weight
        )
        db.add(allocation)
        db.flush()
        sources = by_space[str(unit_id)]
        theory = [
            occupant_theory(
                amount,
                c["occupied_days"],
                denominator,
                not c["exempt"] and config.economic_policy == "occupant",
            )
            for c in sources
        ]
        excess = sum(theory, Decimal(0)) > amount
        if excess:
            issues.append(
                f"{registry.unit_label(db,unit_id)}: los importes teóricos de contratos sucesivos superan los {amount} asignados. No se aplicaron automáticamente; indique importes con justificación."
            )
        owner_exact = amount - sum(theory, Decimal(0)) if not excess else amount
        rounded, cent_residues = (
            apportion(amount, [*theory, owner_exact])
            if not excess
            else ([Decimal(0)] * len(sources) + [amount], [])
        )
        for c, raw, part in zip(sources, theory, rounded[:-1]):
            c["eligible"] = not c["exempt"] and config.economic_policy == "occupant"
            if raw > 0:
                db.add(
                    UtilityResponsibility(
                        allocation_id=allocation.id,
                        person_id=c["responsible_person_id"],
                        contract_id=c["id"],
                        amount=part,
                    )
                )
        owner_amount = rounded[-1]
        if owner_amount > 0:
            if config.owner_person_id is None:
                issues.append(
                    f"{registry.unit_label(db,unit_id)}: indique explícitamente quién asume la parte del propietario; no se usan porcentajes de copropiedad."
                )
            db.add(
                UtilityResponsibility(
                    allocation_id=allocation.id,
                    person_id=config.owner_person_id,
                    amount=owner_amount,
                )
            )
        space_evidence.append(
            {
                "unit_id": unit_id,
                "label": registry.unit_label(db, unit_id),
                "assigned_amount": str(amount),
                "contracts": [
                    {**c, "theoretical_amount": str(t)} for c, t in zip(sources, theory)
                ],
                "theoretical_total": str(sum(theory, Decimal(0))),
                "over_available": excess,
                "cent_residue_recipients": cent_residues,
            }
        )
    proof = {
        "rule": "inclusive_15_days",
        "period_days": denominator,
        "account_version": account.version,
        "method": config.method,
        "occupant_basis": "person_days",
        "rounding": "largest_remainders_stable_space_and_contract_order",
        "space_cent_residue_recipients": residues,
        "spaces": space_evidence,
        "readings": readings,
        "issues": list(dict.fromkeys(issues)),
        "source_contract_versions": {str(c["id"]): c["version"] for c in contracts},
        "no_effective_payment": True,
    }
    obj.status = "needs_review" if issues else "calculated"
    obj.evidence = json.dumps(proof, ensure_ascii=False)
    receipt.version += 1
    registry.audit(db, user, obj, "calculate", extra={"receipt_id": receipt.id})
    db.commit()
    return obj


def assert_sources(db, obj, receipt, account):
    rev = registry.latest_revision(db, receipt.id, True)
    if rev.id != obj.receipt_revision_id:
        raise HTTPException(
            409,
            "El recibo se corrigió después de este cálculo. Calcule su revisión actual.",
        )
    proof = evidence(obj)
    if account.version != proof["account_version"]:
        raise HTTPException(
            409,
            "Cambió la configuración o información del servicio. Vuelva a calcular antes de confirmar.",
        )
    config = db.get(UtilityConfiguration, obj.configuration_id)
    units = registry.rows(
        db,
        select(UtilityConfigurationUnit).where(
            UtilityConfigurationUnit.configuration_id == config.id
        ),
        True,
    )
    selected_ids = {u.unit_id for u in units}
    current_sources = source_contracts(db, account, rev)
    current_sources = [
        c
        for c in current_sources
        if c["property_id"] is not None
        or not selected_ids
        or c["unit_id"] in selected_ids
    ]
    if {str(c["id"]): c["version"] for c in current_sources} != proof[
        "source_contract_versions"
    ]:
        raise HTTPException(
            409,
            "Cambió la ocupación del periodo después del cálculo. Vuelva a calcular antes de confirmar.",
        )
    for id, version in proof["source_contract_versions"].items():
        c = registry.fresh(db, Contract, int(id))
        if c is None or c.version != version:
            raise HTTPException(
                409,
                "Un contrato cambió después del cálculo. Vuelva a calcular con los datos actuales.",
            )
    for source in proof["readings"]:
        reading = registry.fresh(db, MeterReading, source["id"])
        meter = registry.fresh(db, UtilityMeter, source["meter_id"])
        if (
            reading is None
            or meter is None
            or reading.version != source["version"]
            or meter.version != source["meter_version"]
        ):
            raise HTTPException(
                409,
                "Las lecturas o medidores cambiaron después del cálculo. Vuelva a calcular.",
            )


def resolve(db, user, id, data):
    obj, receipt, account = dist_context(db, user, id, True)
    manage(user, active=True)
    check_version(obj, data.expected_version)
    check_version(receipt, data.expected_receipt_version)
    if obj.status not in ["calculated", "needs_review"]:
        raise HTTPException(
            409,
            "Un reparto aprobado conserva su historial. Cree una propuesta de corrección.",
        )
    assert_sources(db, obj, receipt, account)
    allocations = registry.rows(
        db,
        select(UtilityAllocation).where(UtilityAllocation.distribution_id == id),
        True,
    )
    by_id = {a.id: a for a in allocations}
    proof = evidence(obj)
    before = distribution_dict(db, obj)
    if data.allocation_amounts:
        if {a.allocation_id for a in data.allocation_amounts} != set(by_id) or len(
            data.allocation_amounts
        ) != len(by_id):
            raise HTTPException(
                422, "Indique una sola asignación por cada espacio del reparto."
            )
        for item in data.allocation_amounts:
            by_id[item.allocation_id].amount = item.amount
    revision = db.get(UtilityReceiptRevision, obj.receipt_revision_id)
    if sum((a.amount for a in allocations), Decimal(0)) != revision.amount:
        raise HTTPException(
            422,
            "Los importes de los espacios deben sumar exactamente el importe del recibo.",
        )
    validate_people(
        db, user, account.property_id, [r.person_id for r in data.responsibilities]
    )
    sums = {key: Decimal(0) for key in by_id}
    contract_sums = {}
    duplicates = set()
    for r in data.responsibilities:
        if r.allocation_id not in by_id:
            raise HTTPException(422, "Seleccione espacios de esta distribución.")
        key = (r.allocation_id, r.kind, r.contract_id, r.person_id)
        if key in duplicates:
            raise HTTPException(
                422, "No repita una misma responsabilidad en el espacio."
            )
        duplicates.add(key)
        space = next(
            p for p in proof["spaces"] if p["unit_id"] == by_id[r.allocation_id].unit_id
        )
        source = next((c for c in space["contracts"] if c["id"] == r.contract_id), None)
        if r.kind == "occupant":
            if (
                source is None
                or not source["eligible"]
                or r.person_id not in source["people"]
            ):
                raise HTTPException(
                    422,
                    "El ocupante debe pertenecer al contrato de este periodo. Los diarios y servicios incluidos o a cargo del propietario nunca reciben gastos adicionales.",
                )
            group = (r.allocation_id, r.contract_id)
            contract_sums[group] = contract_sums.get(group, Decimal(0)) + r.amount
        elif r.contract_id is not None:
            raise HTTPException(
                422,
                "La parte del propietario se registra separada de un gasto del inquilino.",
            )
        sums[r.allocation_id] += r.amount
    for (allocation_id, contract_id), total in contract_sums.items():
        allocation = by_id[allocation_id]
        space = next(p for p in proof["spaces"] if p["unit_id"] == allocation.unit_id)
        source = next(c for c in space["contracts"] if c["id"] == contract_id)
        maximum = occupant_theory(
            allocation.amount,
            source["occupied_days"],
            proof["period_days"],
            source["eligible"],
        ).quantize(CENT, rounding=ROUND_HALF_UP)
        if total > maximum:
            raise HTTPException(
                422,
                "El total del contrato supera la parte permitida por sus días y condiciones. La revisión manual no puede aumentar ese límite ni agregar servicios a un alquiler diario o incluido.",
            )
    if any(sums[a.id] != a.amount for a in allocations):
        raise HTTPException(
            422,
            "Las responsabilidades de cada espacio deben coincidir exactamente con su importe asignado.",
        )
    db.execute(
        delete(UtilityResponsibility).where(
            UtilityResponsibility.allocation_id.in_(by_id)
        )
    )
    for r in data.responsibilities:
        if r.amount == 0:
            continue
        space = next(
            p for p in proof["spaces"] if p["unit_id"] == by_id[r.allocation_id].unit_id
        )
        source = next((c for c in space["contracts"] if c["id"] == r.contract_id), None)
        db.add(UtilityResponsibility(**r.model_dump(exclude={"kind"})))
    retain_contacts(
        db, account.property_id, [r.person_id for r in data.responsibilities]
    )
    proof["manual_resolution"] = {
        "actor_id": user.id,
        "reason": data.reason,
        "at": utc_now().isoformat(),
        "previous": before["allocations"],
    }
    obj.evidence = json.dumps(proof, ensure_ascii=False)
    obj.status = "calculated"
    obj.version += 1
    obj.reason = data.reason
    receipt.version += 1
    registry.audit(db, user, obj, "resolve", extra={"reason": data.reason})
    db.commit()
    return obj


def confirm(db, user, id, data):
    obj, receipt, account = dist_context(db, user, id, True)
    manage(user, active=True)
    check_version(obj, data.expected_version)
    check_version(receipt, data.expected_receipt_version)
    if obj.status != "calculated":
        raise HTTPException(
            409,
            "Solo puede confirmar un reparto calculado y revisado. Resuelva primero los avisos pendientes.",
        )
    assert_sources(db, obj, receipt, account)
    allocations = registry.rows(
        db,
        select(UtilityAllocation).where(UtilityAllocation.distribution_id == id),
        True,
    )
    if (
        sum((a.amount for a in allocations), Decimal(0))
        != db.get(UtilityReceiptRevision, obj.receipt_revision_id).amount
    ):
        raise HTTPException(
            409, "El total asignado no coincide con el recibo; vuelva a calcular."
        )
    for allocation in allocations:
        responsibilities = registry.rows(
            db,
            select(UtilityResponsibility).where(
                UtilityResponsibility.allocation_id == allocation.id
            ),
            True,
        )
        if (
            any(r.person_id is None for r in responsibilities)
            or sum((r.amount for r in responsibilities), Decimal(0))
            != allocation.amount
        ):
            raise HTTPException(
                409,
                "Complete las personas responsables y sus importes antes de confirmar.",
            )
    current = registry.current_distribution(db, receipt.id, True)
    if current:
        if obj.supersedes_id != current.distribution_id:
            raise HTTPException(
                409,
                "Existe otra confirmación vigente. Cree una corrección desde ese reparto.",
            )
        previous = registry.fresh(db, UtilityDistribution, current.distribution_id)
        previous.status = "superseded"
        previous.version += 1
        current.distribution_id = obj.id
    else:
        if obj.supersedes_id is not None:
            raise HTTPException(
                409, "La confirmación anterior cambió; vuelva a revisar el recibo."
            )
        db.add(UtilityCurrentDistribution(receipt_id=receipt.id, distribution_id=id))
    obj.status = "confirmed"
    obj.confirmed_by = user.id
    obj.confirmed_at = utc_now()
    obj.version += 1
    receipt.version += 1
    registry.audit(
        db,
        user,
        obj,
        "confirm",
        extra={"supersedes_id": obj.supersedes_id, "reason": data.reason},
    )
    db.commit()
    return obj
