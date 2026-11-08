"""Reportes de personas; confirmar un reporte nunca fabrica un movimiento."""

from decimal import Decimal
from sqlalchemy import select, or_
from app.models import reminders as m, finances as fm
from app.services import finances as f, utilities as u
from app.services import reminder_store as store
from app.services.tenancy import read_property, lock_property, today


def report_account(db, obj):
    obligation = (
        u.fresh(db, fm.FinanceObligation, obj.obligation_id)
        if obj.obligation_id
        else None
    )
    return u.fresh(
        db, fm.FinanceAccount, obligation.account_id if obligation else obj.account_id
    )


def scoped(db, property_id, id):
    obj = u.fresh(db, m.ReportedPayment, id)
    f.require(
        obj is not None and report_account(db, obj).property_id == property_id,
        "No se encontró el reporte de esta casa.",
        404,
    )
    return obj


def link_valid(db, obj, movement_id):
    move = u.fresh(db, fm.FinanceMovement, movement_id)
    incoming = db.get(fm.FinanceIncoming, movement_id)
    account = report_account(db, obj)
    if (
        not move
        or move.void_operation_id
        or not incoming
        or incoming.account_id != account.id
        or move.amount != obj.amount
        or move.method_id != obj.method_id
    ):
        return False
    if obj.obligation_id:
        applied = sum(
            (
                v.amount
                for v in f.applications(
                    db, source_movement_id=movement_id, obligation_id=obj.obligation_id
                )
            ),
            Decimal(0),
        )
        if applied < obj.amount:
            return False
    return True


def report_dict(db, obj):
    account = report_account(db, obj)
    decisions = f.rows(db, m.PaymentReportDecision, report_id=obj.id)
    last = decisions[-1] if decisions else None
    state = last.kind if last else "reported"
    if state == "verified" and not link_valid(db, obj, last.movement_id):
        state = "verification_invalid"
    op = u.fresh(db, m.ReminderOperation, obj.operation_id)
    return {
        **u.scalar_dict(obj),
        "property_id": account.property_id,
        "person_id": account.person_id,
        "currency": account.currency,
        "state": state,
        "movement_id": last.movement_id if last else None,
        "recorded_by": op.created_by,
        "recorded_at": op.created_at.isoformat(),
        "decisions": [
            {
                **u.scalar_dict(d),
                "created_by": u.fresh(
                    db, m.ReminderOperation, d.operation_id
                ).created_by,
                "created_at": u.fresh(
                    db, m.ReminderOperation, d.operation_id
                ).created_at.isoformat(),
            }
            for d in decisions
        ],
    }


def listing(db, user, property_id):
    lock_property(db, user, property_id)
    # Ambas alternativas de origen se resuelven sin duplicar persona/moneda/casa.
    items = []
    accounts = select(fm.FinanceAccount.id).where(
        fm.FinanceAccount.property_id == property_id
    )
    obligations = select(fm.FinanceObligation.id).where(
        fm.FinanceObligation.account_id.in_(accounts)
    )
    for obj in u.rows(
        db,
        select(m.ReportedPayment)
        .where(
            or_(
                m.ReportedPayment.account_id.in_(accounts),
                m.ReportedPayment.obligation_id.in_(obligations),
            )
        )
        .order_by(m.ReportedPayment.id),
        True,
    ):
        items.append(report_dict(db, obj))
    return items


def create(db, user, property_id, data):
    def run(op):
        store.scoped_person(db, property_id, data.reporting_person_id)
        f.require(
            data.reported_on <= today(),
            "Un pago informado debe tener una fecha comunicada que no sea futura.",
        )
        method = u.fresh(db, fm.FinanceMethod, data.method_id)
        f.require(method is not None, "Seleccione un método de pago existente.")
        account = None
        if data.obligation_id:
            obligation = f.scoped(
                db, fm.FinanceObligation, data.obligation_id, property_id
            )
            f.require(
                f.obligation_values(db, obligation)[2] > 0,
                "La obligación ya no tiene saldo pendiente. Revise si el pago ya está registrado.",
                409,
            )
        else:
            store.scoped_person(db, property_id, data.person_id)
            account = f.account(db, property_id, data.person_id, data.currency, user)
        obj = m.ReportedPayment(
            obligation_id=data.obligation_id,
            account_id=account.id if account else None,
            reporting_person_id=data.reporting_person_id,
            concept=data.concept,
            amount=data.amount,
            reported_on=data.reported_on,
            method_id=data.method_id,
            document_reference=data.document_reference,
            notes=data.notes,
            version=1,
            operation_id=op.id,
        )
        db.add(obj)
        db.flush()
        return {"report_id": obj.id, "version": obj.version, "confirmed_money": False}

    return store.operation(db, user, property_id, "payment-report", data, run)


def decide(db, user, property_id, id, data):
    def run(op):
        obj = scoped(db, property_id, id)
        f.require(
            obj.version == data.expected_version,
            "El reporte cambió. Actualice la pantalla.",
            409,
        )
        current = report_dict(db, obj)
        f.require(
            current["state"] not in ["verified", "rejected"],
            "Este reporte ya tiene una decisión vigente.",
            409,
        )
        if data.action == "pending":
            f.require(
                current["state"] == "reported",
                "El reporte ya está pendiente de verificación.",
                409,
            )
        if data.action == "verified":
            f.require(
                link_valid(db, obj, data.movement_id),
                "Seleccione un ingreso real válido del mismo titular, moneda, importe y método; si hay obligación debe cubrirla con una aplicación vigente. Regístrelo primero en Pagos y gastos si todavía no existe.",
                409,
            )
            f.require(
                not f.rows(db, m.PaymentReportDecision, movement_id=data.movement_id),
                "Este movimiento ya está vinculado a un reporte. No vuelva a confirmar el mismo pago.",
                409,
            )
        decision = m.PaymentReportDecision(
            report_id=id,
            kind=data.action,
            movement_id=data.movement_id,
            reason=data.reason,
            operation_id=op.id,
        )
        db.add(decision)
        obj.version += 1
        db.flush()
        return {
            "report_id": id,
            "decision_id": decision.id,
            "version": obj.version,
            "state": data.action,
            "movement_id": data.movement_id,
            "money_created": False,
        }

    return store.operation(
        db,
        user,
        property_id,
        "payment-report-decision",
        data,
        run,
        target=id,
        admin=data.action != "pending",
    )
