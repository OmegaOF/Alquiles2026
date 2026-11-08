"""Proyecciones vivas de las fuentes autorizadas. Consultar no inserta avisos."""

from datetime import date
from decimal import Decimal
from sqlalchemy import select, or_
from app.models import reminders as m, finances as fm
from app.models.entities import Person, Unit, Property
from app.models.tenancy import Contract, ContractOwner
from app.models.utilities import ServiceAccount, UtilityReceipt
from app.services import finances as f, utilities as u, anticreticos as capital
from app.services import reminder_store as store, reported_payments as reports
from app.services.reminder_content import KINDS
from app.services.tenancy import lock_property, today, contract_dict

ZERO = Decimal("0.00")


def notice_key(obj):
    for prefix, field in [
        ("debt", "obligation_id"),
        ("receipt", "receipt_id"),
        ("expense", "expense_id"),
        ("contract", "contract_id"),
        ("report", "report_id"),
    ]:
        if getattr(obj, field) is not None:
            return f"{prefix}:{getattr(obj,field)}"
    return f"capital:{obj.capital_contract_id}:{obj.holder_id}:{obj.responsible_id}"


def anchor(key):
    parts = key.split(":")
    f.require(
        len(key) <= 80
        and len(parts) in [2, 4]
        and all(
            v.isascii() and v.isdigit() and len(v) <= 10 and 0 < int(v) <= 2147483647
            for v in parts[1:]
        ),
        "No se encontró el aviso.",
        404,
    )
    fields = {
        "debt": "obligation_id",
        "receipt": "receipt_id",
        "expense": "expense_id",
        "contract": "contract_id",
        "report": "report_id",
    }
    if parts[0] == "capital" and len(parts) == 4:
        return {
            "capital_contract_id": int(parts[1]),
            "holder_id": int(parts[2]),
            "responsible_id": int(parts[3]),
        }
    f.require(parts[0] in fields and len(parts) == 2, "No se encontró el aviso.", 404)
    return {fields[parts[0]]: int(parts[1])}


def stored_notice(db, key):
    found = f.rows(db, m.ReminderNotice, **anchor(key))
    return found[0] if found else None


def allowed_internal(db, user, property_id, prefs):
    if user.role in ["general_admin", "property_admin", "owner"]:
        return True
    return not prefs["recipient_user_ids"] or user.id in prefs["recipient_user_ids"]


def project(db, user, property_id):
    prop = lock_property(db, user, property_id)
    prefs = store.preference(db, user, property_id)
    f.require(
        allowed_internal(db, user, property_id, prefs),
        "No está asignado como destinatario interno de los avisos de esta casa.",
        403,
    )
    now = today()
    result = []
    names = {}

    def name(id):
        if id is None:
            return "Persona pendiente de definir"
        if id not in names:
            p = u.fresh(db, Person, id)
            names[id] = p.full_name if p else "Persona pendiente de definir"
        return names[id]

    def target(unit_id):
        unit = u.fresh(db, Unit, unit_id) if unit_id else None
        return f"{unit.code} · {unit.name}" if unit else "Casa completa"

    settings = {v["kind"]: v for v in prefs["types"]}

    def add(
        key,
        kind,
        *,
        person_id=None,
        recipients=None,
        due=None,
        amount=None,
        currency=None,
        unit_id=None,
        concept=None,
        period=None,
        active=True,
        internal_review=False,
        reason=None,
        extra=None,
        origin=None,
    ):
        recipients = sorted(
            {id for id in (recipients if recipients is not None else [person_id]) if id}
        )
        days = (due - now).days if due else None
        financial_active = bool(active)
        in_window = internal_review or days is None or days <= max(prefs["lead_days"])
        requires_attention = (
            financial_active and in_window and settings[kind]["is_enabled"]
        )
        priority = (
            "resolved"
            if not financial_active
            else (
                "date_missing"
                if days is None or (internal_review and days > max(prefs["lead_days"]))
                else (
                    "overdue"
                    if days < 0
                    else (
                        "today"
                        if days == 0
                        else "upcoming" if in_window else "scheduled"
                    )
                )
            )
        )
        event = {
            "key": key,
            "kind": kind,
            "kind_label": KINDS[kind][0],
            "purpose": KINDS[kind][1],
            "property_id": property_id,
            "property_name": prop.name,
            "unit_id": unit_id,
            "target_label": target(unit_id),
            "person_id": person_id,
            "responsible_name": name(person_id),
            "recipient_ids": recipients,
            "recipients": [{"id": id, "full_name": name(id)} for id in recipients],
            "due_on": due.isoformat() if due else None,
            "days_remaining": days,
            "days_overdue": max(-days, 0) if days is not None else None,
            "amount": str(amount) if amount is not None else None,
            "currency": currency,
            "concept": concept or KINDS[kind][0],
            "period": period,
            "priority": priority,
            "requires_attention": requires_attention,
            "resolved": not financial_active,
            "resolution_reason": reason if not financial_active else None,
            "allow_whatsapp": settings[kind]["allow_whatsapp"],
            "origin": origin or {},
            **(extra or {}),
        }
        semantic = {
            k: v
            for k, v in event.items()
            if k
            not in [
                "days_remaining",
                "days_overdue",
                "requires_attention",
                "allow_whatsapp",
            ]
        }
        event["source_fingerprint"] = store.fingerprint(semantic)
        if days is None:
            band = "review"
        elif days < 0:
            band = now.isoformat()
        else:
            band = next(
                (d for d in sorted(set(prefs["lead_days"] + [0])) if days <= d),
                "future",
            )
        event["attention_fingerprint"] = store.fingerprint(
            [event["source_fingerprint"], band, prefs["version"]]
        )
        obj = stored_notice(db, key)
        event["notice_id"] = obj.id if obj else None
        event["version"] = obj.version if obj else 0
        state = (
            "resolved"
            if not financial_active
            else "scheduled" if not requires_attention else "pending"
        )
        attention = []
        if obj:
            for action in f.rows(db, m.ReminderAttentionEvent, notice_id=obj.id):
                op = u.fresh(db, m.ReminderOperation, action.operation_id)
                if op.created_by == user.id:
                    attention.append((action, op))
        event["until_on"] = None
        if requires_attention and attention:
            last, op = attention[-1]
            if last.fingerprint == event["attention_fingerprint"]:
                if last.kind == "reviewed":
                    state = "reviewed"
                elif last.kind == "snoozed" and now < last.until_on:
                    state = "snoozed"
                    event["until_on"] = last.until_on.isoformat()
        event["attention_state"] = state
        event["attention_history"] = [
            {
                **u.scalar_dict(a),
                "created_by": op.created_by,
                "created_at": op.created_at.isoformat(),
            }
            for a, op in attention
        ]
        result.append(event)

    financial = f.state(db, user, property_id)
    expenses = {e["receipt_id"]: e for e in financial["expenses"] if e["receipt_id"]}
    for o in financial["obligations"]:
        recovery = False
        expense = expenses.get(o["receipt_id"])
        if expense:
            for disb in f.rows(db, fm.FinanceDisbursement, expense_id=expense["id"]):
                move = u.fresh(db, fm.FinanceMovement, disb.movement_id)
                if (
                    not disb.is_direct
                    and not move.void_operation_id
                    and not expense["void_operation_id"]
                    and move.payer_id == expense["person_id"]
                ):
                    recovery = True
        kind = (
            "rent" if o["rent_contract_id"] else "recovery" if recovery else "service"
        )
        add(
            f"debt:{o['id']}",
            kind,
            person_id=o["person_id"],
            due=date.fromisoformat(o["effective_due_on"]),
            amount=o["pending"],
            currency=o["currency"],
            unit_id=o["unit_id"],
            concept=o["concept"],
            period=f"{o['period_start']} al {o['effective_period_end']}",
            active=Decimal(o["pending"]) > 0,
            reason="Saldo pagado o ajustado a cero.",
            extra={
                "total": o["total"],
                "applied": o["applied"],
                "contract_id": o["contract_id"],
                "receipt_id": o["receipt_id"],
                "recorded_amount": o["original_amount"],
            },
            origin={
                "module": "finances",
                "obligation_id": o["id"],
                "contract_id": o["contract_id"],
            },
        )
    accounts = u.rows(
        db,
        select(ServiceAccount)
        .where(ServiceAccount.property_id == property_id)
        .order_by(ServiceAccount.id),
        True,
    )
    account_ids = [a.id for a in accounts]
    for receipt in u.rows(
        db,
        select(UtilityReceipt)
        .where(UtilityReceipt.account_id.in_(account_ids))
        .order_by(UtilityReceipt.id),
        True,
    ):
        revision = u.latest_revision(db, receipt.id, True)
        account = next(a for a in accounts if a.id == receipt.account_id)
        expense = expenses.get(receipt.id)
        if expense:
            person_id = expense["person_id"]
            amount = expense["pending"]
            paid = expense["paid"]
            total = expense["total"]
            currency = expense["currency"]
            due = date.fromisoformat(expense["due_on"]) if expense["due_on"] else None
            active = not expense["void_operation_id"] and Decimal(amount) > 0
        else:
            config = u.latest_configuration(db, account.id, True)
            person_id = config.provider_payer_id or config.owner_person_id
            amount = str(revision.amount)
            paid = "0.00"
            total = str(revision.amount)
            currency = revision.currency
            due = revision.due_on
            active = True
        add(
            f"receipt:{receipt.id}",
            "provider",
            person_id=person_id,
            due=due,
            amount=amount,
            currency=currency,
            concept=account.label,
            period=f"{revision.period_start.isoformat()} al {revision.period_end.isoformat()}",
            active=active,
            reason="Gasto anulado o pago al proveedor completado.",
            extra={
                "recorded_amount": total,
                "paid": paid,
                "expense_id": expense["id"] if expense else None,
                "expense_recorded": bool(expense),
                "provider": account.provider,
                "receipt_id": receipt.id,
                "review_issues": (
                    []
                    if person_id
                    else ["Defina quién debe efectuar el pago al proveedor."]
                ),
            },
            origin={
                "module": "finances" if expense else "utilities",
                "receipt_id": receipt.id,
            },
        )
    for e in financial["expenses"]:
        if e["receipt_id"]:
            continue
        add(
            f"expense:{e['id']}",
            "expense",
            person_id=e["person_id"],
            due=date.fromisoformat(e["due_on"]) if e["due_on"] else None,
            amount=e["pending"],
            currency=e["currency"],
            unit_id=e["unit_id"],
            concept=e["description"],
            active=not e["void_operation_id"] and Decimal(e["pending"]) > 0,
            reason="Gasto anulado o pagado.",
            extra={
                "recorded_amount": e["total"],
                "paid": e["paid"],
                "expense_id": e["id"],
            },
            origin={"module": "finances", "expense_id": e["id"]},
        )
    units = select(Unit.id).where(Unit.property_id == property_id)
    contracts = u.rows(
        db,
        select(Contract)
        .where(or_(Contract.property_id == property_id, Contract.unit_id.in_(units)))
        .order_by(Contract.id),
        True,
    )
    for c in contracts:
        owners = [p.person_id for p in f.rows(db, ContractOwner, contract_id=c.id)]
        add(
            f"contract:{c.id}",
            "contract",
            person_id=c.responsible_person_id,
            recipients=[c.responsible_person_id, *owners],
            due=c.end_date,
            unit_id=c.unit_id,
            concept="Contrato "
            + {
                "daily": "diario",
                "weekly": "semanal",
                "monthly": "mensual",
                "anticretico": "anticrético",
                "mixed": "mixto",
            }[c.mode],
            active=c.status == "active",
            reason="Contrato finalizado, cancelado o todavía en borrador.",
            extra={
                "contract_id": c.id,
                "mode": c.mode,
                "contract_status": c.status,
                "contract_version": c.version,
            },
            origin={"module": "contracts", "contract_id": c.id},
        )
        if c.mode == "anticretico":
            book = capital.detail(db, user, property_id, c.id)
            holders = {h["person_id"]: h for h in book["holders"]}
            for balance in book["balances"]:
                holder = balance["holder_id"]
                responsible = balance["responsible_id"]
                beneficiary = holders.get(holder, {}).get("beneficiary_person_id")
                due = (
                    book["conditions"]["restitution_on"] if book["conditions"] else None
                )
                add(
                    f"capital:{c.id}:{holder}:{responsible}",
                    "capital",
                    person_id=responsible,
                    recipients=[holder, responsible, beneficiary],
                    due=date.fromisoformat(due) if due else None,
                    amount=balance["pending"],
                    currency=c.currency,
                    unit_id=c.unit_id,
                    concept="Restitución de capital anticrético",
                    active=Decimal(balance["pending"]) > 0,
                    internal_review=c.status == "finished",
                    reason="Asignación de capital liquidada.",
                    extra={
                        "holder_id": holder,
                        "holder_name": name(holder),
                        "beneficiary_name": name(beneficiary) if beneficiary else None,
                        "beneficiary_person_id": beneficiary,
                        "capital_received": balance["received"],
                        "capital_returned": balance["returned"],
                        "capital_adjustments": balance["adjustments"],
                        "contract_id": c.id,
                        "contract_status": c.status,
                        "review_issues": (
                            [
                                "La ocupación terminó; revise el capital pendiente sin adelantar su fecha pactada de restitución."
                            ]
                            if c.status == "finished"
                            and Decimal(balance["pending"]) > 0
                            else []
                        ),
                        "conditions_revision": (
                            book["conditions"]["revision"]
                            if book["conditions"]
                            else None
                        ),
                    },
                    origin={"module": "anticreticos", "contract_id": c.id},
                )
    for report in reports.listing(db, user, property_id):
        add(
            f"report:{report['id']}",
            "report",
            person_id=report["person_id"],
            recipients=[report["person_id"], report["reporting_person_id"]],
            amount=report["amount"],
            currency=report["currency"],
            concept=report["concept"],
            active=report["state"] in ["reported", "pending", "verification_invalid"],
            reason="Reporte verificado o rechazado.",
            extra={
                "report_id": report["id"],
                "report_state": report["state"],
                "report_version": report["version"],
                "reported_on": report["reported_on"],
                "reported_amount": report["amount"],
                "confirmed_money": report["state"] == "verified",
            },
            origin={"module": "reports", "report_id": report["id"]},
        )
    return result, prefs, now


def listing(db, user, property_id, kind=None):
    items, prefs, now = project(db, user, property_id)
    items = [
        e
        for e in items
        if (e["requires_attention"] or e["notice_id"])
        and (kind is None or e["kind"] == kind)
    ]
    ranks = {
        "overdue": 0,
        "today": 1,
        "date_missing": 2,
        "upcoming": 3,
        "scheduled": 4,
        "resolved": 5,
    }
    items.sort(key=lambda e: (ranks[e["priority"]], e["due_on"] or "", e["key"]))
    return {
        "items": items,
        "today": now.isoformat(),
        "preferences": prefs,
        "summary": {
            k: sum(e["attention_state"] == k for e in items)
            for k in ["pending", "reviewed", "snoozed", "resolved", "scheduled"]
        },
    }


def detail(db, user, property_id, key):
    anchor(key)
    items, _, _ = project(db, user, property_id)
    found = next((e for e in items if e["key"] == key), None)
    f.require(
        found is not None, "No se encontró el aviso o no pertenece a esta casa.", 404
    )
    return found
