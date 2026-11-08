"""Capital separado de renta, con presupuestos explícitos e historia intacta."""

import json
from collections import defaultdict
from decimal import Decimal
from types import SimpleNamespace
from sqlalchemy import select, or_
from app.models import anticreticos as m
from app.models.finances import (
    FinanceMovement,
    FinanceOperation,
    FinanceObligation,
    FinanceAccount,
)
from app.models.tenancy import Contract
from app.models.entities import Unit
from app.services import finances as f
from app.services import utilities as u
from app.services.tenancy import (
    lock_property,
    target_property,
    validate_people,
    retain_contacts,
    check_version,
    today,
    contract_dict,
)

ZERO = Decimal("0.00")


def context(db, user, property_id, id, data=None):
    c = u.fresh(db, Contract, id)
    f.require(
        c
        and c.mode == "anticretico"
        and target_property(db, c.property_id, c.unit_id) == property_id,
        "No se encontró el anticrético o no tiene acceso.",
        404,
    )
    if data:
        check_version(c, data.expected_contract_version)
    terms = f.rows(db, m.AnticreticoTerms, contract_id=id)
    terms = terms[0] if terms else None
    revisions = f.rows(db, m.AnticreticoRevision, contract_id=id)
    revision = max(revisions, key=lambda r: r.revision) if revisions else None
    if data:
        f.require(
            data.expected_version == (terms.version if terms else 0),
            "El capital cambió mientras lo revisaba. Recargue y compruebe los importes.",
            409,
        )
    return c, terms, revision


def source_rows(db, contract_id):
    revision_ids = select(m.AnticreticoRevision.id).where(
        m.AnticreticoRevision.contract_id == contract_id
    )
    movements = u.rows(
        db,
        select(m.AnticreticoMovement)
        .where(m.AnticreticoMovement.revision_id.in_(revision_ids))
        .order_by(m.AnticreticoMovement.movement_id),
        True,
    )
    adjustments = u.rows(
        db,
        select(m.AnticreticoAdjustment)
        .where(m.AnticreticoAdjustment.revision_id.in_(revision_ids))
        .order_by(m.AnticreticoAdjustment.id),
        True,
    )
    return movements, adjustments


def books(db, contract_id, exclude_movement=None, exclude_adjustment=None):
    cells = defaultdict(
        lambda: {
            "received": ZERO,
            "returned": ZERO,
            "adjustments": ZERO,
            "pending": ZERO,
            "principal_reassigned": ZERO,
        }
    )
    days = defaultdict(lambda: defaultdict(lambda: ZERO))
    movements, adjustments = source_rows(db, contract_id)
    for link in movements:
        cash = u.fresh(db, FinanceMovement, link.movement_id)
        if cash.void_operation_id or cash.id == exclude_movement:
            continue
        for line in f.rows(db, m.AnticreticoAllocation, movement_id=cash.id):
            key = (line.holder_id, line.responsible_id)
            field = "received" if link.kind == "delivery" else "returned"
            cells[key][field] += line.amount
            days[cash.occurred_on][key] += (
                line.amount if link.kind == "delivery" else -line.amount
            )
    for adj in adjustments:
        if adj.void_operation_id or adj.id == exclude_adjustment:
            continue
        for line in f.rows(db, m.AnticreticoAdjustmentLine, adjustment_id=adj.id):
            key = (line.holder_id, line.responsible_id)
            cells[key]["adjustments"] += line.delta
            days[adj.effective_on][key] += line.delta
            if adj.kind == "reassignment":
                cells[key]["principal_reassigned"] += line.delta
    for key, value in cells.items():
        value["pending"] = value["received"] + value["adjustments"] - value["returned"]
    totals = {
        key: sum((cell[key] for cell in cells.values()), ZERO)
        for key in ["received", "returned", "adjustments", "pending"]
    }
    totals["cells"] = cells
    totals["days"] = days
    return totals


def parties(db, revision):
    if revision is None:
        return [], []
    return f.rows(db, m.AnticreticoHolder, revision_id=revision.id), f.rows(
        db, m.AnticreticoResponsible, revision_id=revision.id
    )


def review_issues(db, revision):
    if revision is None:
        return ["Complete el capital acordado y las personas responsables."]
    holders, responsibles = parties(db, revision)
    issues = []
    if not holders:
        issues.append(
            "Seleccione titulares y sus importes; no se supone que sean los ocupantes."
        )
    if not responsibles:
        issues.append(
            "Seleccione responsables de restitución y sus importes; no se usan participaciones de propiedad."
        )
    if any(h.beneficiary_person_id is None for h in holders):
        issues.append("Indique quién está autorizado a recibir por cada titular.")
    if not revision.expected_delivery_on or not revision.restitution_on:
        issues.append("Complete las fechas pactadas de entrega y restitución.")
    return issues


def verify_balances(
    db, contract_id, revision, exclude_movement=None, exclude_adjustment=None
):
    book = books(db, contract_id, exclude_movement, exclude_adjustment)
    accumulated = defaultdict(lambda: ZERO)
    for day in sorted(book["days"]):
        for key, delta in book["days"][day].items():
            accumulated[key] += delta
        f.require(
            all(value >= 0 for value in accumulated.values()),
            "La operación dejaría capital negativo por titular/responsable o una devolución anterior al capital disponible. Corrija primero las operaciones relacionadas.",
            409,
        )
    holders, responsibles = parties(db, revision)
    hs = {h.person_id for h in holders}
    rs = {r.person_id for r in responsibles}
    f.require(
        all(
            value["pending"] == 0 or (h in hs and r in rs)
            for (h, r), value in book["cells"].items()
        ),
        "Conserve los titulares y responsables con capital pendiente. Documente una reasignación antes de retirarlos.",
        409,
    )
    return book


def revision_dict(db, obj):
    holders, responsibles = parties(db, obj)
    op = u.fresh(db, FinanceOperation, obj.operation_id)
    return {
        **u.scalar_dict(obj),
        "holders": [u.scalar_dict(h) for h in holders],
        "responsibles": [u.scalar_dict(r) for r in responsibles],
        "created_by": op.created_by,
        "created_at": op.created_at.isoformat(),
        "reason": json.loads(op.result).get("reason"),
    }


def save_conditions(db, user, property_id, id, data):
    def run(op):
        c, terms, previous = context(db, user, property_id, id, data)
        book = books(db, id)
        if previous:
            f.require(
                bool(data.reason)
                and bool(data.document_reference and data.document_reference.strip()),
                "Una modificación requiere motivo y referencia del acuerdo autorizado.",
            )
        if data.agreed_capital < book["received"]:
            f.require(
                data.acknowledge_received_excess
                and bool(data.reason)
                and bool(data.document_reference),
                "El capital recibido supera el nuevo acuerdo. Confirme expresamente esa diferencia; no se modificará el dinero registrado.",
            )
        ids = [p.person_id for p in data.holders + data.responsibles] + [
            h.beneficiary_person_id for h in data.holders if h.beneficiary_person_id
        ]
        validate_people(db, user, property_id, ids)
        retain_contacts(db, property_id, ids)
        if not terms:
            terms = m.AnticreticoTerms(contract_id=id, version=0)
            db.add(terms)
            db.flush()
        obj = m.AnticreticoRevision(
            contract_id=id,
            revision=previous.revision + 1 if previous else 1,
            agreed_capital=data.agreed_capital,
            expected_delivery_on=data.expected_delivery_on,
            restitution_on=data.restitution_on,
            allow_early_return=data.allow_early_return,
            conditions=data.conditions,
            document_reference=data.document_reference,
            notes=data.notes,
            operation_id=op.id,
        )
        db.add(obj)
        db.flush()
        db.add_all(
            m.AnticreticoHolder(revision_id=obj.id, **h.model_dump())
            for h in data.holders
        )
        db.add_all(
            m.AnticreticoResponsible(revision_id=obj.id, **r.model_dump())
            for r in data.responsibles
        )
        db.flush()
        verify_balances(db, id, obj)
        terms.version += 1
        return {
            "contract_id": id,
            "revision_id": obj.id,
            "version": terms.version,
            "review_issues": review_issues(db, obj),
            "capital_received": str(book["received"]),
        }

    return f.operation(
        db, user, property_id, f"anti-conditions:{id}", data, run, admin=True
    )


def validate_parts(db, user, property_id, revision, parts):
    holders, responsibles = parties(db, revision)
    hs = {h.person_id: h for h in holders}
    rs = {r.person_id: r for r in responsibles}
    seen = set()
    for part in parts:
        key = (part.holder_id, part.responsible_id)
        f.require(
            key not in seen,
            "No repita la misma pareja titular/responsable en una operación.",
        )
        seen.add(key)
        f.require(
            part.holder_id in hs and part.responsible_id in rs,
            "Seleccione titulares y responsables del acuerdo vigente.",
        )
    return hs, rs


def register_cash(db, user, property_id, id, data, kind):
    def run(op):
        c, terms, revision = context(db, user, property_id, id, data)
        f.require(
            revision is not None, "Complete primero las condiciones económicas.", 409
        )
        issues = review_issues(db, revision)
        f.require(not issues, " ".join(issues))
        f.require(
            c.currency == data.currency,
            "La moneda debe coincidir con el contrato y el capital; no se convierten monedas.",
        )
        f.require(
            sum((p.amount for p in data.allocations), ZERO) == data.amount,
            "Los importes asignados deben sumar exactamente el movimiento real.",
        )
        hs, rs = validate_parts(db, user, property_id, revision, data.allocations)
        before = books(db, id)
        if kind == "delivery":
            f.require(
                c.status in {"active", "finished"},
                "Registre la entrega en un contrato vigente o finalizado, no en un borrador o cancelado.",
            )
            f.require(
                before["received"] + data.amount <= revision.agreed_capital,
                "La entrega supera el capital acordado. Registre primero una modificación autorizada.",
                409,
            )
            for holder in hs.values():
                prior = sum(
                    (
                        cell["received"] + cell["principal_reassigned"]
                        for (h, r), cell in before["cells"].items()
                        if h == holder.person_id
                    ),
                    ZERO,
                )
                new = sum(
                    (
                        p.amount
                        for p in data.allocations
                        if p.holder_id == holder.person_id
                    ),
                    ZERO,
                )
                f.require(
                    prior + new <= holder.assigned_amount,
                    "La entrega supera la parte acordada de un titular; revise el acuerdo.",
                    409,
                )
            for responsible in rs.values():
                prior = sum(
                    (
                        cell["received"] + cell["principal_reassigned"]
                        for (h, r), cell in before["cells"].items()
                        if r == responsible.person_id
                    ),
                    ZERO,
                )
                new = sum(
                    (
                        p.amount
                        for p in data.allocations
                        if p.responsible_id == responsible.person_id
                    ),
                    ZERO,
                )
                f.require(
                    prior + new <= responsible.assigned_amount,
                    "La entrega supera la parte asignada a un responsable; revise el acuerdo.",
                    409,
                )
        else:
            f.require(
                revision.allow_early_return
                or data.occurred_on >= revision.restitution_on,
                "El acuerdo no permite devolución anticipada. Registre la condición autorizada antes de devolver.",
            )
            for part in data.allocations:
                f.require(
                    hs[part.holder_id].beneficiary_person_id
                    == data.beneficiary_person_id,
                    "La persona que recibe debe estar autorizada por cada titular de esta devolución.",
                )
                available = (
                    before["cells"]
                    .get((part.holder_id, part.responsible_id), {})
                    .get("pending", ZERO)
                )
                f.require(
                    part.amount <= available,
                    "La devolución supera el capital pendiente de esa pareja titular/responsable.",
                    409,
                )
        cash = f.cash(db, user, property_id, data, op)
        db.add(
            m.AnticreticoMovement(
                movement_id=cash.id, revision_id=revision.id, kind=kind
            )
        )
        db.flush()
        db.add_all(
            m.AnticreticoAllocation(movement_id=cash.id, **p.model_dump())
            for p in data.allocations
        )
        db.flush()
        after = verify_balances(db, id, revision)
        terms.version += 1
        return {
            "contract_id": id,
            "movement_id": cash.id,
            "version": terms.version,
            "capital_received": str(after["received"]),
            "capital_returned": str(after["returned"]),
            "capital_pending": str(after["pending"]),
            "kind": kind,
        }

    return f.operation(
        db, user, property_id, f"anti-{kind}:{id}", data, run, admin=kind == "return"
    )


def adjust(db, user, property_id, id, data):
    def run(op):
        c, terms, revision = context(db, user, property_id, id, data)
        f.require(revision is not None, "Complete las condiciones económicas.", 409)
        f.require(
            books(db, id)["received"] > 0,
            "Un ajuste de restitución requiere capital efectivamente recibido.",
        )
        validate_parts(db, user, property_id, revision, data.allocations)
        f.require(
            all(p.delta != 0 for p in data.allocations),
            "Cada ajuste debe tener un importe distinto de cero.",
        )
        total = sum((p.delta for p in data.allocations), ZERO)
        f.require(
            (data.kind == "reassignment" and total == 0)
            or (data.kind == "settlement" and total < 0)
            or (data.kind == "additional" and total > 0),
            "El total no coincide con el tipo de acuerdo: reasignación cero, reducción negativa u obligación adicional positiva.",
        )
        obj = m.AnticreticoAdjustment(
            revision_id=revision.id,
            kind=data.kind,
            effective_on=data.effective_on,
            document_reference=data.document_reference,
            operation_id=op.id,
        )
        db.add(obj)
        db.flush()
        db.add_all(
            m.AnticreticoAdjustmentLine(adjustment_id=obj.id, **p.model_dump())
            for p in data.allocations
        )
        db.flush()
        result = verify_balances(db, id, revision)
        terms.version += 1
        return {
            "contract_id": id,
            "adjustment_id": obj.id,
            "version": terms.version,
            "capital_pending": str(result["pending"]),
            "non_cash_adjustment": str(total),
        }

    return f.operation(
        db, user, property_id, f"anti-adjust:{id}", data, run, admin=True
    )


def void_cash(db, user, property_id, id, movement_id, data):
    def run(op):
        c, terms, revision = context(db, user, property_id, id, data)
        link = db.get(m.AnticreticoMovement, movement_id)
        f.require(
            link is not None
            and db.get(m.AnticreticoRevision, link.revision_id).contract_id == id,
            "No se encontró el movimiento de este anticrético.",
            404,
        )
        cash = u.fresh(db, FinanceMovement, movement_id)
        f.require(not cash.void_operation_id, "El movimiento ya está anulado.", 409)
        result = verify_balances(db, id, revision, exclude_movement=movement_id)
        cash.void_operation_id = op.id
        terms.version += 1
        return {
            "contract_id": id,
            "movement_id": movement_id,
            "voided": True,
            "version": terms.version,
            "capital_pending": str(result["pending"]),
        }

    return f.operation(
        db, user, property_id, f"anti-void:{movement_id}", data, run, admin=True
    )


def void_adjustment(db, user, property_id, id, adjustment_id, data):
    def run(op):
        c, terms, revision = context(db, user, property_id, id, data)
        obj = u.fresh(db, m.AnticreticoAdjustment, adjustment_id)
        f.require(
            obj is not None
            and db.get(m.AnticreticoRevision, obj.revision_id).contract_id == id,
            "No se encontró el acuerdo de este anticrético.",
            404,
        )
        f.require(not obj.void_operation_id, "El acuerdo ya está anulado.", 409)
        result = verify_balances(db, id, revision, exclude_adjustment=adjustment_id)
        obj.void_operation_id = op.id
        terms.version += 1
        return {
            "contract_id": id,
            "adjustment_id": adjustment_id,
            "voided": True,
            "version": terms.version,
            "capital_pending": str(result["pending"]),
        }

    return f.operation(
        db,
        user,
        property_id,
        f"anti-void-adjust:{adjustment_id}",
        data,
        run,
        admin=True,
    )


def finance_context(db, link):
    revision = db.get(m.AnticreticoRevision, link.revision_id)
    c = db.get(Contract, revision.contract_id)
    holders = {
        line.holder_id
        for line in f.rows(db, m.AnticreticoAllocation, movement_id=link.movement_id)
    }
    return SimpleNamespace(
        id=None,
        property_id=target_property(db, c.property_id, c.unit_id),
        person_id=next(iter(holders)) if len(holders) == 1 else None,
        currency=c.currency,
        anticretico_contract_id=c.id,
    )


def detail(db, user, property_id, id):
    lock_property(db, user, property_id)
    c, terms, revision = context(db, user, property_id, id)
    book = books(db, id)
    issues = review_issues(db, revision)
    holders, responsibles = parties(db, revision)
    agreed = revision.agreed_capital if revision else ZERO
    pending_receive = max(agreed - book["received"], ZERO)
    if not terms or issues:
        state = "preparation"
    elif book["received"] == 0 and book["adjustments"] == 0:
        state = "pending_receipt"
    elif book["pending"] == 0:
        state = (
            "settled_by_agreement"
            if book["returned"] < book["received"]
            else "returned"
        )
    elif revision.restitution_on and revision.restitution_on < today():
        state = "overdue"
    elif book["returned"] > 0:
        state = "partial_return"
    elif pending_receive > 0:
        state = "partial_receipt"
    else:
        state = "received"
    movements, adjustments = source_rows(db, id)
    cash_rows = []
    for link in movements:
        cash = u.fresh(db, FinanceMovement, link.movement_id)
        op = u.fresh(db, FinanceOperation, cash.operation_id)
        cash_rows.append(
            {
                **u.scalar_dict(cash),
                "kind": link.kind,
                "revision_id": link.revision_id,
                "currency": c.currency,
                "created_by": op.created_by,
                "created_at": op.created_at.isoformat(),
                "allocations": [
                    u.scalar_dict(a)
                    for a in f.rows(db, m.AnticreticoAllocation, movement_id=cash.id)
                ],
            }
        )

    def party_dict(p, axis):
        values = {
            k: sum(
                (
                    v[k]
                    for pair, v in book["cells"].items()
                    if pair[axis] == p.person_id
                ),
                ZERO,
            )
            for k in ["received", "returned", "adjustments", "pending"]
        }
        return {**u.scalar_dict(p), **{k: str(v) for k, v in values.items()}}

    obligations = []
    accounts = select(FinanceAccount.id).where(
        FinanceAccount.property_id == property_id
    )
    for obj in u.rows(
        db,
        select(FinanceObligation).where(
            FinanceObligation.service_origin_id.is_not(None),
            FinanceObligation.account_id.in_(accounts),
        ),
        True,
    ):
        if f.origin_contract(db, obj) == id:
            obligations.append(f.obligation_dict(db, obj))
    adjustment_rows = []
    for adj in adjustments:
        op = u.fresh(db, FinanceOperation, adj.operation_id)
        adjustment_rows.append(
            {
                **u.scalar_dict(adj),
                "reason": json.loads(op.result).get("reason"),
                "created_by": op.created_by,
                "created_at": op.created_at.isoformat(),
                "allocations": [
                    u.scalar_dict(a)
                    for a in f.rows(
                        db, m.AnticreticoAdjustmentLine, adjustment_id=adj.id
                    )
                ],
            }
        )
    return {
        "contract": contract_dict(db, c),
        "version": terms.version if terms else 0,
        "conditions": revision_dict(db, revision) if revision else None,
        "review_issues": issues,
        "state": state,
        "currency": c.currency,
        "capital_agreed": str(agreed),
        "capital_received": str(book["received"]),
        "capital_to_receive": str(pending_receive),
        "received_above_agreed": str(max(book["received"] - agreed, ZERO)),
        "capital_returned": str(book["returned"]),
        "capital_adjustments": str(book["adjustments"]),
        "capital_pending": str(book["pending"]),
        "holders": [party_dict(h, 0) for h in holders],
        "responsibles": [party_dict(r, 1) for r in responsibles],
        "balances": [
            {
                "holder_id": h,
                "responsible_id": r,
                **{k: str(v) for k, v in values.items()},
            }
            for (h, r), values in sorted(book["cells"].items())
        ],
        "movements": cash_rows,
        "adjustments": adjustment_rows,
        "history": [
            revision_dict(db, r)
            for r in f.rows(db, m.AnticreticoRevision, contract_id=id)
        ],
        "service_obligations": obligations,
    }


def contracts(db, property_id):
    units = select(Unit.id).where(Unit.property_id == property_id)
    return u.rows(
        db,
        select(Contract)
        .where(
            Contract.mode == "anticretico",
            or_(Contract.property_id == property_id, Contract.unit_id.in_(units)),
        )
        .order_by(Contract.id),
        True,
    )


def summary(db, user, property_id, details=None):
    lock_property(db, user, property_id)
    details = (
        details
        if details is not None
        else [detail(db, user, property_id, c.id) for c in contracts(db, property_id)]
    )
    groups = []
    for currency in sorted({d["currency"] for d in details}):
        items = [d for d in details if d["currency"] == currency]
        amounts = {
            k: str(sum((Decimal(d[k]) for d in items), ZERO))
            for k in [
                "capital_agreed",
                "capital_received",
                "capital_to_receive",
                "capital_returned",
                "capital_adjustments",
                "capital_pending",
            ]
        }
        groups.append(
            {
                "currency": currency,
                "count": len(items),
                "pending_conditions": sum(d["conditions"] is None for d in items),
                **amounts,
            }
        )
    return groups


def listing(db, user, property_id):
    lock_property(db, user, property_id)
    items = [detail(db, user, property_id, c.id) for c in contracts(db, property_id)]
    return {
        "items": items,
        "summary": summary(db, user, property_id, items),
        "today": today().isoformat(),
    }
