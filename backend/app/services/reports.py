"""Coordinación de reportes: un resultado para API, dashboard, gráficos y PDF."""

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select, or_
from app.models.entities import PropertyOwner, Unit, Person
from app.models.tenancy import (
    Contract,
    ContractOwner,
    ContractOccupant,
    PropertyContact,
)
from app.models import utilities as u, finances as f
from app.services import tenancy
from app.services.report_facts import Facts, scope_properties, locked_read_cache
from app.services.report_projection import (
    Projection,
    MONEY_KEYS,
    ZERO,
    decimal_text,
    period,
)

TITLES = {
    "economic": "Reporte económico general",
    "properties": "Reporte por propiedad",
    "owners": "Reporte por propietario",
    "units": "Reporte por unidad",
    "contracts": "Reporte por contrato",
    "collections": "Cobranzas y deudas",
    "services": "Servicios básicos",
    "expenses": "Gastos",
    "capital": "Capital de anticréticos",
    "comparison": "Comparar propiedades y periodos",
}


def plain(value):
    if isinstance(value, Decimal):
        return decimal_text(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


def options(db, user, filters):
    # Los selectores necesitan identidades, no bloquear ni reconstruir todo el libro.
    properties, owners = scope_properties(db, user, filters)
    ids = {p.id for p in properties}
    units = list(
        db.scalars(select(Unit).where(Unit.property_id.in_(ids)).order_by(Unit.id))
    )
    unit_map = {x.id: x for x in units}
    contracts = list(
        db.scalars(
            select(Contract)
            .where(or_(Contract.property_id.in_(ids), Contract.unit_id.in_(unit_map)))
            .order_by(Contract.id)
        )
    )
    cids = {c.id for c in contracts}
    owner_ids = {o.person_id for o in owners}
    people_ids = owner_ids | {c.responsible_person_id for c in contracts}
    for query in [
        select(ContractOwner.person_id).where(ContractOwner.contract_id.in_(cids)),
        select(ContractOccupant.person_id).where(
            ContractOccupant.contract_id.in_(cids)
        ),
        select(PropertyContact.person_id).where(PropertyContact.property_id.in_(ids)),
        select(f.FinanceAccount.person_id).where(f.FinanceAccount.property_id.in_(ids)),
    ]:
        people_ids.update(db.scalars(query))
    people = list(
        db.execute(
            select(Person.id, Person.full_name)
            .where(Person.id.in_(people_ids))
            .order_by(Person.id)
        )
    )
    return dict(
        properties=[dict(id=p.id, name=p.name) for p in properties],
        units=[
            dict(id=x.id, name=f"{x.code} · {x.name}", property_id=x.property_id)
            for x in units
        ],
        contracts=[
            dict(
                id=x.id,
                property_id=x.property_id or unit_map[x.unit_id].property_id,
                unit_id=x.unit_id,
                mode=x.mode,
                name=f"Contrato {x.id}",
            )
            for x in contracts
        ],
        owners=[dict(id=x.id, name=x.full_name) for x in people if x.id in owner_ids],
        people=[dict(id=x.id, name=x.full_name) for x in people],
        services=[
            dict(id=x.id, name=x.name)
            for x in db.scalars(select(u.UtilityType).order_by(u.UtilityType.id))
        ],
        categories=[
            dict(id=x.id, name=x.name)
            for x in db.scalars(
                select(f.FinanceCategory).order_by(f.FinanceCategory.id)
            )
        ],
        today=tenancy.today().isoformat(),
    )


def counts(facts, cutoff, filters):
    current = cutoff == tenancy.today()
    units = [
        u for u in facts.all(Unit) if not filters.unit_id or u.id == filters.unit_id
    ]
    valid = [
        c
        for c in facts.all(Contract)
        if c.status in {"active", "finished"}
        and c.start_date <= cutoff <= (c.actual_end_date or c.end_date)
    ]
    occupied = {
        x.id
        for x in units
        if any(c.unit_id == x.id or c.property_id == x.property_id for c in valid)
    }
    # Reservas vigentes se excluyen de disponibilidad aunque no sean ocupaciones.
    from app.models.tenancy import Reservation

    reserved = {
        x.id
        for x in units
        if any(
            (r.unit_id == x.id or r.property_id == x.property_id)
            and r.status in {"pending", "confirmed"}
            and r.start_date <= cutoff <= r.end_date
            and (
                r.expires_at is None
                or r.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)
            )
            for r in facts.all(Reservation)
        )
    }
    active = [
        c for c in facts.all(Contract) if c.status == "active" and c.end_date >= cutoff
    ]
    if filters.contract_id:
        active = [c for c in active if c.id == filters.contract_id]
    if filters.unit_id:
        active = [c for c in active if c.unit_id == filters.unit_id]
    until = (
        datetime.combine(
            cutoff + timedelta(days=1), datetime.min.time(), ZoneInfo("America/La_Paz")
        )
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    return dict(
        properties_registered=sum(p.created_at < until for p in facts.properties),
        properties_active=(
            sum(p.is_active for p in facts.properties) if current else None
        ),
        units_available=(
            sum(
                x.is_enabled
                and not x.maintenance
                and x.id not in occupied | reserved
                and next(p for p in facts.properties if p.id == x.property_id).is_active
                for x in units
            )
            if current
            else None
        ),
        units_occupied=len(occupied) if current else None,
        contracts_active=len(active) if current else None,
        contracts_ending=(
            sum(c.end_date <= cutoff + timedelta(days=30) for c in active)
            if current
            else None
        ),
    )


def occupancy(facts, first, last, filters):
    """Estancias por sus fechas según versiones actuales, rotuladas como tales."""
    units = [
        u for u in facts.all(Unit) if not filters.unit_id or u.id == filters.unit_id
    ]
    contracts = [
        c
        for c in facts.all(Contract)
        if c.status in {"active", "finished"}
        and (not filters.contract_id or c.id == filters.contract_id)
        and (not filters.mode or c.mode == filters.mode)
        and (not filters.person_id or c.responsible_person_id == filters.person_id)
    ]
    occupied = 0
    occupied_properties = 0
    for prop in facts.properties:
        own = [u for u in units if u.property_id == prop.id]
        for i in range((last - first).days + 1):
            day = first + timedelta(days=i)
            valid = [
                c
                for c in contracts
                if c.start_date <= day <= (c.actual_end_date or c.end_date)
            ]
            for unit in own:
                if any(c.property_id == prop.id or c.unit_id == unit.id for c in valid):
                    occupied += 1
            if any(
                c.property_id == prop.id or any(c.unit_id == u.id for u in own)
                for c in valid
            ):
                occupied_properties += 1
    days = (last - first).days + 1
    capacity = len(units) * days
    return dict(
        occupied_unit_days=occupied,
        unit_days=capacity,
        occupied_property_days=occupied_properties,
        property_days=len(facts.properties) * days,
        occupancy_percent=(
            (Decimal(occupied) * 100 / Decimal(capacity)).quantize(Decimal(".01"))
            if capacity
            else None
        ),
    )


def series(facts, filters, start, end, cut):
    points = []
    first = start.replace(day=1)
    while first <= end:
        following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
        a, b = max(first, start), min(following - timedelta(days=1), end)
        flow = Projection(facts, filters, a, b, cut)
        # Flujos con el conocimiento del corte final; estado con el cierre propio.
        state = flow if cut <= b else Projection(facts, filters, a, b, b)
        groups = {v["currency"]: v for v in flow.summaries()}
        states = {v["currency"]: v for v in state.summaries()}
        for currency in sorted(set(groups) | set(states)):
            data = {k: groups.get(currency, {}).get(k, ZERO) for k in MONEY_KEYS}
            for key in [
                "pending",
                "rent_pending",
                "service_pending",
                "obligations_total",
                "obligations_applied",
                "payable_pending",
                "provider_refund_pending",
                "expense_total",
                "expense_applied",
                "capital_received",
                "capital_returned",
                "capital_pending",
                "capital_adjustments",
                "capital_agreed",
            ]:
                data[key] = states.get(currency, {}).get(key, ZERO)
            points.append(
                dict(
                    month=first.strftime("%Y-%m"),
                    currency=currency,
                    **data,
                    has_data=bool(
                        flow.movements
                        or flow.obligations
                        or flow.expenses
                        or flow.capital
                    ),
                )
            )
        first = following
    # Ocupación usa una dimensión física independiente de las monedas.
    occupation = []
    first = start.replace(day=1)
    while first <= end:
        following = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
        occupation.append(
            dict(
                month=first.strftime("%Y-%m"),
                **occupancy(
                    facts,
                    max(first, start),
                    min(following - timedelta(days=1), end),
                    filters,
                ),
            )
        )
        first = following
    return points, occupation


def partition_rows(facts, p, kind):
    properties = {x.id: x.name for x in facts.properties}
    if kind in {"properties", "comparison"}:
        return [
            dict(
                property_id=prop.id,
                property=prop.name,
                units_registered=sum(u.property_id == prop.id for u in facts.all(Unit)),
                currency=currency,
                **{
                    **values,
                    **(
                        {"recoveries_pending": None}
                        if (prop.id, currency) in p.unknown_recovery_properties
                        else {}
                    ),
                },
            )
            for prop in facts.properties
            for currency, values in (
                sorted(p.by_property[prop.id].items()) or [(None, {})]
            )
        ]
    if kind == "owners":
        result = []
        for owner in sorted({o.person_id for o in facts.all(PropertyOwner)}):
            if p.filters.owner_id and p.filters.owner_id != owner:
                continue
            ids = {
                o.property_id for o in facts.all(PropertyOwner) if o.person_id == owner
            }
            person = facts.get(Person, owner)
            for pid in sorted(ids):
                for currency, values in sorted(p.by_property[pid].items()):
                    result.append(
                        dict(
                            owner_id=owner,
                            owner=person.full_name,
                            property_id=pid,
                            property=properties[pid],
                            currency=currency,
                            scope="Total asociado a la propiedad; sin atribución personal",
                            **{
                                **values,
                                **(
                                    {"recoveries_pending": None}
                                    if (pid, currency) in p.unknown_recovery_properties
                                    else {}
                                ),
                            },
                        )
                    )
        return result
    if kind == "units":
        result = []
        for unit in facts.all(Unit):
            if p.filters.unit_id and p.filters.unit_id != unit.id:
                continue
            sub = Projection(
                facts,
                p.filters.model_copy(update={"unit_id": unit.id}),
                p.start,
                p.end,
                p.cut,
            )
            contracts = [c for c in facts.all(Contract) if c.unit_id == unit.id]
            for summary in sub.summaries() or [{"currency": None}]:
                result.append(
                    dict(
                        unit_id=unit.id,
                        unit=p.space(unit.id),
                        property_id=unit.property_id,
                        property=properties[unit.property_id],
                        contracts=[
                            dict(
                                id=c.id,
                                mode=c.mode,
                                start_date=c.start_date,
                                end_date=c.actual_end_date or c.end_date,
                                state=c.status,
                            )
                            for c in contracts
                        ],
                        **summary,
                    )
                )
        return result
    if kind == "contracts":
        result = []
        financial_contracts = {o["contract_id"] for o in p.obligations} | {
            c["contract_id"] for c in p.capital
        }
        for movement in p.movements:
            guarantee = facts.get(f.FinanceGuarantee, movement["id"])
            refund = facts.get(f.FinanceRefund, movement["id"])
            if refund:
                guarantee = facts.get(f.FinanceGuarantee, refund.source_movement_id)
            if guarantee:
                financial_contracts.add(guarantee.contract_id)
        for c in facts.all(Contract):
            if c.id not in financial_contracts and not p.matches(
                c.currency,
                c.responsible_person_id,
                c.unit_id,
                c.id,
                state=p.filters.state,
            ):
                continue
            if (
                (c.start_date > p.end or (c.actual_end_date or c.end_date) < p.start)
                and c.id not in financial_contracts
                and p.filters.contract_id != c.id
            ):
                continue
            sub = Projection(
                facts,
                p.filters.model_copy(update={"contract_id": c.id}),
                p.start,
                p.end,
                p.cut,
            )
            if (
                p.filters.state
                and p.filters.state not in {"active", "finished", "draft", "cancelled"}
                and not sub.summaries()
            ):
                continue
            result.append(
                dict(
                    contract_id=c.id,
                    property_id=p.prop(c.id),
                    unit_id=c.unit_id,
                    unit=p.space(c.unit_id),
                    mode=c.mode,
                    start_date=c.start_date,
                    end_date=c.actual_end_date or c.end_date,
                    state=c.status,
                    person=p.person(c.responsible_person_id),
                    currency=c.currency,
                    price=c.price,
                    conditions=c.conditions,
                    occupants=[
                        p.person(x.person_id)
                        for x in facts.by(ContractOccupant, "contract_id", c.id)
                    ],
                    owners=[
                        p.person(x.person_id)
                        for x in facts.by(ContractOwner, "contract_id", c.id)
                    ],
                    obligations=sub.obligations,
                    movements=sub.movements,
                    capital=sub.capital,
                    summary=sub.summaries(),
                )
            )
        return result
    return {
        "economic": [{**o, "record_type": "Cargo"} for o in p.obligations]
        + [{**o, "record_type": "Movimiento de dinero"} for o in p.movements]
        + [{**o, "record_type": "Gasto"} for o in p.expenses]
        + [{**o, "record_type": "Capital de anticrético"} for o in p.capital],
        "collections": p.obligations,
        "services": p.services,
        "expenses": p.expenses,
        "capital": p.capital,
    }[kind]


def build(db, user, filters, kind="economic", export=False):
    facts = Facts(db, user, filters)
    if filters.person_id and not facts.get(Person, filters.person_id):
        raise HTTPException(
            404, "No se encontró la persona en sus propiedades autorizadas."
        )
    for field, model in [
        (filters.service_type_id, u.UtilityType),
        (filters.category_id, f.FinanceCategory),
    ]:
        if field and not facts.get(model, field):
            raise HTTPException(422, "Seleccione un tipo existente del catálogo.")
    p = Projection(facts, filters)
    rows = partition_rows(facts, p, kind)
    for row in rows:
        if "property_id" in row:
            row["property"] = next(
                x.name for x in facts.properties if x.id == row["property_id"]
            )
    amounts = p.summaries()
    timeline, occupation = series(facts, filters, p.start, p.end, p.cut)
    limits = [
        "Flujos: fechas de negocio del periodo. Saldos: hechos registrados y conocidos a la fecha de corte, incluyendo anulaciones y ajustes conocidos entonces.",
        "Los cargos se registran en la fecha boliviana de su operación; el periodo de alquiler/consumo se muestra por separado.",
        "Propietarios: totales de propiedades vinculadas actualmente. No se distribuyen por porcentajes ni se suman filas de copropietarios para obtener el total general.",
        "Unidad/contrato: el dinero sin atribución explícita permanece fuera del desglose. Los cargos de casa completa no se reparten entre cuartos.",
        "La recuperación de servicios es aplicación de fondos existentes, no otro ingreso. El pago directo al proveedor se distingue del desembolso propio.",
        "Si el proveedor está parcialmente pagado, no se inventa una atribución del pago a las partes: el recuperable aparece sin información cuando no puede determinarse con certeza; la deuda de servicios sigue visible.",
        "La ocupación por periodo usa fechas de los contratos válidos en su versión actual; no certifica cambios históricos de inventario, titularidad, modalidad o estado. Los filtros de estas dimensiones son actuales.",
        "Las cifras no incluyen operaciones aún desconocidas al corte, aunque tengan una fecha de negocio anterior. No se reconstruyen hechos que nunca fueron registrados.",
        "Servicios: se seleccionan recibos por la fecha de cierre de su periodo real; cada recibo aparece una vez. Su importe y pago al proveedor son del documento completo; las partes y cargos respetan los filtros. Consultar no importa repartos pendientes a Pagos y gastos.",
        "La ficha de contrato muestra precio y condiciones actuales, sin certificarlos como históricos. Los cargos, aplicaciones y acuerdos versionados de capital se reconstruyen a la fecha de corte.",
        "El capital acordado identifica el acuerdo del contrato completo; no suma cuotas de titular y responsable de una misma persona ni inventa una atribución personal del acuerdo.",
    ]
    if p.cut != tenancy.today():
        limits.append(
            "No se puede reconstruir con certeza la disponibilidad ni los estados administrativos al corte histórico. Esos indicadores no se muestran; nombres y vínculos de propietarios son actuales."
        )
    attention = None
    if p.cut == tenancy.today() and kind == "economic":
        from app.services import reminder_sources

        attention = 0
        for prop in facts.properties:
            try:
                with locked_read_cache(db, facts):
                    notices, _, _ = reminder_sources.project(db, user, prop.id)
                attention += sum(x["requires_attention"] for x in notices)
            except HTTPException as e:
                if e.status_code != 403:
                    raise
                attention = None
                limits.append(
                    "No tiene acceso a todos los recordatorios internos del ámbito; no se presenta un conteo parcial como total."
                )
                break
    selected_filters = filters.model_dump(
        exclude={"page", "page_size", "expected_fingerprint", "paper"}
    )
    full = dict(
        kind=kind,
        title=TITLES[kind],
        filters=selected_filters,
        period=dict(start=p.start, end=p.end, as_of=p.cut, timezone="America/La_Paz"),
        properties=[dict(id=x.id, name=x.name) for x in facts.properties],
        summary=amounts,
        counts={**counts(facts, p.cut, filters), "reminders_attention": attention},
        series=timeline,
        occupancy=occupation,
        rows=rows,
        movements=p.movements,
        limitations=limits,
        total_rows=len(rows),
        has_data=bool(amounts or rows),
    )
    clean = plain(full)
    fingerprint = hashlib.sha256(
        json.dumps(clean, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if filters.expected_fingerprint and filters.expected_fingerprint != fingerprint:
        raise HTTPException(
            409,
            "Los datos cambiaron después de la consulta. Actualice el reporte antes de descargar el PDF.",
        )
    export_rows = sum(
        (
            (
                len(r.get("summary", [])) * len(MONEY_KEYS)
                + len(r.get("obligations", []))
                + len(r.get("capital", []))
                + 1
            )
            if kind == "contracts"
            else (
                len(MONEY_KEYS) + 1
                if kind in {"owners", "units", "properties", "comparison"}
                else 1
            )
        )
        for r in rows
    )
    if export and export_rows > 5000:
        raise HTTPException(
            422,
            "El reporte supera 5000 filas. Seleccione una propiedad o un periodo más corto para exportar.",
        )
    if not export:
        offset = (filters.page - 1) * filters.page_size
        clean["rows"] = clean["rows"][offset : offset + filters.page_size]
    clean.update(
        fingerprint=fingerprint,
        page=filters.page,
        page_size=filters.page_size,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    return clean
