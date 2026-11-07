"""Dinero una sola vez, aplicaciones explícitas y saldos derivados.

Todas las escrituras bloquean primero la propiedad. Las lecturas críticas
son actuales para funcionar también con MySQL REPEATABLE READ.
"""

import hashlib
import json
from datetime import date
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from app.models import finances as m
from app.models.entities import Unit
from app.models.tenancy import Contract
from app.models.utilities import (
    UtilityReceipt,
    UtilityReceiptRevision,
    UtilityDistribution,
    UtilityAllocation,
    UtilityResponsibility,
    ServiceAccount,
)
from app.services import utilities as u
from app.services.tenancy import (
    manage,
    lock_property,
    read_property,
    target_property,
    validate_people,
    retain_contacts,
    today,
    check_version,
)
from app.services.finance_periods import cents, rent_preview

ZERO = Decimal("0.00")


def rows(db, model, **filters):
    return u.rows(
        db,
        select(model)
        .filter_by(**filters)
        .order_by(list(model.__table__.primary_key)[0]),
        True,
    )


def require(condition, message, status=422):
    if not condition:
        raise HTTPException(status, message)


def account(db, property_id, person_id, currency, user):
    validate_people(db, user, property_id, [person_id])
    found = rows(
        db,
        m.FinanceAccount,
        property_id=property_id,
        person_id=person_id,
        currency=currency,
    )
    if found:
        return found[0]
    obj = m.FinanceAccount(
        property_id=property_id, person_id=person_id, currency=currency
    )
    db.add(obj)
    db.flush()
    retain_contacts(db, property_id, [person_id])
    return obj


def scoped(db, model, id, property_id):
    obj = u.fresh(db, model, id)
    require(obj is not None, "No se encontró el registro o no tiene acceso.", 404)
    if model == m.FinanceMovement:
        a = movement_account(db, obj.id)
    else:
        a = u.fresh(db, m.FinanceAccount, obj.account_id)
    require(
        a.property_id == property_id,
        "No se encontró el registro o no tiene acceso.",
        404,
    )
    return obj


def operation(db, user, property_id, action, data, fn, admin=False):
    manage(user, active=admin)
    lock_property(db, user, property_id)
    payload = data.model_dump(mode="json")
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    previous = rows(db, m.FinanceOperation, request_key=data.request_key)
    if previous:
        op = previous[0]
        require(
            op.property_id == property_id
            and op.action == action
            and op.payload_hash == digest,
            "El identificador de operación ya se utilizó con otros datos.",
            409,
        )
        return json.loads(op.result)
    op = m.FinanceOperation(
        property_id=property_id,
        request_key=data.request_key,
        action=action,
        payload_hash=digest,
        result="{}",
        created_by=user.id,
    )
    db.add(op)
    db.flush()
    result = fn(op)
    op.result = json.dumps(
        {**result, "operation_id": op.id, "reason": data.reason},
        default=str,
        ensure_ascii=False,
    )
    u.audit(
        db,
        user,
        op,
        action,
        extra={"request": payload, "result": json.loads(op.result)},
    )
    db.commit()
    return json.loads(op.result)


def applications(db, **filters):
    return [
        a
        for a in rows(db, m.FinanceApplication, **filters)
        if a.void_operation_id is None
        and u.fresh(db, m.FinanceMovement, a.source_movement_id).void_operation_id
        is None
    ]


def obligation_values(db, obj):
    adjustments = rows(db, m.FinanceAdjustment, obligation_id=obj.id)
    total = obj.original_amount + sum((a.delta for a in adjustments), ZERO)
    applied = applications(db, obligation_id=obj.id)
    paid = sum((a.amount for a in applied), ZERO)
    due = next(
        (a.new_due_on for a in reversed(adjustments) if a.new_due_on), obj.due_on
    )
    end = next(
        (a.new_period_end for a in reversed(adjustments) if a.new_period_end),
        obj.period_end,
    )
    return total, paid, total - paid, due, end


def expense_values(db, obj):
    total = (
        ZERO
        if obj.void_operation_id
        else obj.original_amount
        + sum(
            (a.delta for a in rows(db, m.FinanceExpenseAdjustment, expense_id=obj.id)),
            ZERO,
        )
    )
    payments = [
        u.fresh(db, m.FinanceMovement, p.movement_id)
        for p in rows(db, m.FinanceDisbursement, expense_id=obj.id)
    ]
    paid = sum((p.amount for p in payments if p.void_operation_id is None), ZERO)
    return total, paid, max(total - paid, ZERO)


def movement_account(db, id):
    incoming = db.get(m.FinanceIncoming, id)
    guarantee = db.get(m.FinanceGuarantee, id)
    if incoming or guarantee:
        return u.fresh(db, m.FinanceAccount, (incoming or guarantee).account_id)
    disb = db.get(m.FinanceDisbursement, id)
    if disb:
        return u.fresh(
            db,
            m.FinanceAccount,
            u.fresh(db, m.FinanceExpense, disb.expense_id).account_id,
        )
    refund = db.get(m.FinanceRefund, id)
    require(refund is not None, "El movimiento no tiene un origen válido.", 409)
    return movement_account(db, refund.source_movement_id)


def available(db, obj):
    if obj.void_operation_id:
        return ZERO
    used = sum((a.amount for a in applications(db, source_movement_id=obj.id)), ZERO)
    refunds = [
        u.fresh(db, m.FinanceMovement, r.movement_id)
        for r in rows(db, m.FinanceRefund, source_movement_id=obj.id)
    ]
    return (
        obj.amount
        - used
        - sum((r.amount for r in refunds if not r.void_operation_id), ZERO)
    )


def cash(db, user, property_id, data, op):
    method = u.fresh(db, m.FinanceMethod, data.method_id)
    require(
        method is not None and method.is_active,
        "Seleccione un método de pago habilitado.",
    )
    ids = [data.payer_id] + (
        [data.beneficiary_person_id] if data.beneficiary_person_id else []
    )
    validate_people(db, user, property_id, ids)
    retain_contacts(db, property_id, ids)
    ref = (
        data.reference.strip().upper()
        if data.reference and data.reference.strip()
        else None
    )
    if ref:
        for old in u.rows(
            db,
            select(m.FinanceMovement)
            .join(
                m.FinanceOperation,
                m.FinanceMovement.operation_id == m.FinanceOperation.id,
            )
            .where(
                m.FinanceOperation.property_id == property_id,
                m.FinanceMovement.method_id == data.method_id,
                m.FinanceMovement.reference == ref,
            ),
            True,
        ):
            if not old.void_operation_id:
                raise HTTPException(
                    409,
                    "Ya existe un movimiento válido con ese método y referencia. Revíselo antes de repetirlo.",
                )
    obj = m.FinanceMovement(
        amount=data.amount,
        occurred_on=data.occurred_on,
        method_id=data.method_id,
        payer_id=data.payer_id,
        beneficiary_person_id=data.beneficiary_person_id,
        beneficiary_label=data.beneficiary_label,
        reference=ref,
        document_reference=data.document_reference,
        notes=data.notes,
        operation_id=op.id,
    )
    db.add(obj)
    db.flush()
    return obj


def apply_parts(db, user, property_id, parts, op, authorize_guarantee=False):
    seen = set()
    for part in parts:
        pair = (part.source_movement_id, part.obligation_id)
        require(pair not in seen, "No repita la misma aplicación en una operación.")
        seen.add(pair)
        source = scoped(db, m.FinanceMovement, part.source_movement_id, property_id)
        obligation = scoped(db, m.FinanceObligation, part.obligation_id, property_id)
        require(not source.void_operation_id, "El pago de origen fue anulado.", 409)
        a = movement_account(db, source.id)
        b = u.fresh(db, m.FinanceAccount, obligation.account_id)
        guarantee = db.get(m.FinanceGuarantee, source.id)
        direct = db.get(m.FinanceDisbursement, source.id)
        require(
            db.get(m.FinanceIncoming, source.id) is not None
            or guarantee is not None
            or (direct and direct.is_direct),
            "Este movimiento no es un saldo que pueda aplicarse.",
        )
        if guarantee:
            manage(user, active=True)
            require(authorize_guarantee, "Autorice expresamente el uso de la garantía.")
            contract = origin_contract(db, obligation)
            require(
                contract == guarantee.contract_id,
                "La garantía solo puede aplicarse al mismo contrato.",
            )
        if direct:
            expense = u.fresh(db, m.FinanceExpense, direct.expense_id)
            require(
                expense.receipt_id is not None
                and origin_receipt(db, obligation) == expense.receipt_id
                and source.payer_id == b.person_id,
                "El pago directo debe corresponder al mismo recibo y responsable.",
            )
            require(
                a.currency == b.currency,
                "Las monedas de la aplicación deben coincidir.",
            )
        else:
            require(
                a.id == b.id,
                "El saldo y la obligación deben corresponder a la misma persona, casa y moneda.",
            )
        require(
            part.amount <= available(db, source),
            "El importe supera el saldo disponible del pago, anticipo o garantía.",
            409,
        )
        require(
            part.amount <= obligation_values(db, obligation)[2],
            "El importe supera el saldo pendiente de la obligación.",
            409,
        )
        db.add(
            m.FinanceApplication(
                source_movement_id=source.id,
                obligation_id=obligation.id,
                amount=part.amount,
                operation_id=op.id,
            )
        )
        db.flush()


def origin_contract(db, obj):
    if obj.rent_contract_id:
        return obj.rent_contract_id
    return db.get(UtilityResponsibility, obj.service_origin_id).contract_id


def origin_receipt(db, obj):
    if not obj.service_origin_id:
        return None
    r = db.get(UtilityResponsibility, obj.service_origin_id)
    a = db.get(UtilityAllocation, r.allocation_id)
    d = db.get(UtilityDistribution, a.distribution_id)
    return db.get(UtilityReceiptRevision, d.receipt_revision_id).receipt_id


def adjust_obligation(db, obj, new_total, op, due=None, end=None):
    require(new_total >= 0, "El importe exigible no puede ser negativo.")
    old, paid, _, old_due, old_end = obligation_values(db, obj)
    if old == new_total and (not due or due == old_due) and (not end or end == old_end):
        return
    db.add(
        m.FinanceAdjustment(
            obligation_id=obj.id,
            delta=new_total - old,
            new_due_on=due,
            new_period_end=end,
            operation_id=op.id,
        )
    )
    db.flush()
    # Liberar lo sobrante hacia la misma fuente, sin alterar el dinero original.
    excess = max(paid - new_total, ZERO)
    for application in reversed(applications(db, obligation_id=obj.id)):
        if excess <= 0:
            break
        removed = min(excess, application.amount)
        application.void_operation_id = op.id
        if application.amount > removed:
            db.add(
                m.FinanceApplication(
                    source_movement_id=application.source_movement_id,
                    obligation_id=obj.id,
                    amount=application.amount - removed,
                    operation_id=op.id,
                    replaces_id=application.id,
                )
            )
        excess -= removed
    db.flush()


def receive(db, user, property_id, data):
    def run(op):
        a = account(db, property_id, data.person_id, data.currency, user)
        total = sum((p.amount for p in data.applications), ZERO)
        require(
            total <= data.amount,
            "Las aplicaciones no pueden superar el dinero recibido.",
        )
        require(
            total == data.amount or data.surplus in {"credit", "advance"},
            "Indique expresamente si el sobrante es anticipo o saldo a favor.",
        )
        obj = cash(db, user, property_id, data, op)
        db.add(
            m.FinanceIncoming(
                movement_id=obj.id,
                account_id=a.id,
                category="advance" if data.surplus == "advance" else "collection",
            )
        )
        db.flush()
        from types import SimpleNamespace

        apply_parts(
            db,
            user,
            property_id,
            [
                SimpleNamespace(source_movement_id=obj.id, **p.model_dump())
                for p in data.applications
            ],
            op,
        )
        return {
            "movement_id": obj.id,
            "received": str(obj.amount),
            "available": str(available(db, obj)),
        }

    return operation(db, user, property_id, "receive", data, run)


def apply(db, user, property_id, data):
    def run(op):
        if data.authorize_guarantee:
            require(bool(data.reason), "Indique el motivo para aplicar una garantía.")
        apply_parts(
            db, user, property_id, data.applications, op, data.authorize_guarantee
        )
        return {"applied": str(sum((p.amount for p in data.applications), ZERO))}

    return operation(
        db, user, property_id, "apply", data, run, admin=data.authorize_guarantee
    )


def guarantee(db, user, property_id, data):
    def run(op):
        contract = u.fresh(db, Contract, data.contract_id)
        require(
            contract
            and target_property(db, contract.property_id, contract.unit_id)
            == property_id,
            "No se encontró el contrato o no tiene acceso.",
            404,
        )
        require(
            contract.currency == data.currency,
            "La garantía debe respetar la moneda contractual.",
        )
        a = account(db, property_id, data.person_id, data.currency, user)
        obj = cash(db, user, property_id, data, op)
        db.add(
            m.FinanceGuarantee(
                movement_id=obj.id,
                account_id=a.id,
                contract_id=contract.id,
                conditions=data.conditions,
            )
        )
        db.flush()
        return {"movement_id": obj.id, "guarantee": str(obj.amount)}

    return operation(db, user, property_id, "guarantee", data, run)


def create_expense(db, user, property_id, data):
    def run(op):
        category = u.fresh(db, m.FinanceCategory, data.category_id)
        require(
            category and category.is_active,
            "Seleccione una categoría de gasto habilitada.",
        )
        if data.unit_id:
            unit = u.fresh(db, Unit, data.unit_id)
            require(
                unit and unit.property_id == property_id,
                "El cuarto no pertenece a esta casa.",
            )
        a = account(db, property_id, data.person_id, data.currency, user)
        obj = m.FinanceExpense(
            account_id=a.id,
            unit_id=data.unit_id,
            category_id=data.category_id,
            description=data.description,
            recorded_on=data.recorded_on,
            original_amount=data.amount,
            due_on=data.due_on,
            document_reference=data.document_reference,
            notes=data.notes,
            operation_id=op.id,
        )
        db.add(obj)
        db.flush()
        return {
            "expense_id": obj.id,
            "registered": str(obj.original_amount),
            "paid": "0.00",
        }

    return operation(db, user, property_id, "expense", data, run)


def disburse(db, user, property_id, id, data):
    def run(op):
        expense = scoped(db, m.FinanceExpense, id, property_id)
        a = u.fresh(db, m.FinanceAccount, expense.account_id)
        require(
            a.currency == data.currency, "El pago debe respetar la moneda del gasto."
        )
        require(not expense.void_operation_id, "El gasto está anulado.", 409)
        require(
            data.amount <= expense_values(db, expense)[2],
            "El pago supera el saldo pendiente del gasto.",
            409,
        )
        if data.is_direct:
            require(
                expense.receipt_id is not None and bool(data.document_reference),
                "El pago directo requiere un recibo de servicio y comprobante externo.",
            )
            require(
                sum((p.amount for p in data.applications), ZERO) == data.amount,
                "El pago directo debe identificar las obligaciones satisfechas por su importe exacto.",
            )
        else:
            require(
                not data.applications,
                "Las aplicaciones de este formulario corresponden solo a pagos directos al proveedor.",
            )
        obj = cash(db, user, property_id, data, op)
        db.add(
            m.FinanceDisbursement(
                movement_id=obj.id, expense_id=id, is_direct=data.is_direct
            )
        )
        db.flush()
        if data.is_direct:
            from types import SimpleNamespace

            apply_parts(
                db,
                user,
                property_id,
                [
                    SimpleNamespace(source_movement_id=obj.id, **p.model_dump())
                    for p in data.applications
                ],
                op,
            )
        return {
            "movement_id": obj.id,
            "paid": str(obj.amount),
            "owner_cash_out": not data.is_direct,
        }

    return operation(db, user, property_id, f"disburse:{id}", data, run)


def refund(db, user, property_id, id, data):
    def run(op):
        source = scoped(db, m.FinanceMovement, id, property_id)
        require(
            db.get(m.FinanceIncoming, id) or db.get(m.FinanceGuarantee, id),
            "Solo se devuelve dinero recibido disponible; los pagos directos requieren devolución documentada del proveedor.",
        )
        a = movement_account(db, id)
        require(
            data.currency == a.currency and data.beneficiary_person_id == a.person_id,
            "La devolución debe respetar titular y moneda del saldo.",
        )
        require(
            data.amount <= available(db, source),
            "La devolución supera el saldo disponible.",
            409,
        )
        obj = cash(db, user, property_id, data, op)
        db.add(m.FinanceRefund(movement_id=obj.id, source_movement_id=id))
        db.flush()
        return {
            "movement_id": obj.id,
            "refunded": str(obj.amount),
            "remaining": str(available(db, source)),
        }

    return operation(db, user, property_id, f"refund:{id}", data, run, admin=True)


def void_movement(db, user, property_id, id, data):
    def run(op):
        obj = scoped(db, m.FinanceMovement, id, property_id)
        require(not obj.void_operation_id, "El movimiento ya está anulado.", 409)
        returned = [
            u.fresh(db, m.FinanceMovement, r.movement_id)
            for r in rows(db, m.FinanceRefund, source_movement_id=id)
        ]
        require(
            not any(not r.void_operation_id for r in returned),
            "Anule primero las devoluciones relacionadas; no se puede borrar dinero ya devuelto.",
            409,
        )
        obj.void_operation_id = op.id
        for app in applications(db, source_movement_id=id):
            app.void_operation_id = op.id
        # Leer aplicaciones antes/después del cambio de estado conserva su historia.
        for app in rows(db, m.FinanceApplication, source_movement_id=id):
            if not app.void_operation_id:
                app.void_operation_id = op.id
        return {"movement_id": id, "voided": True}

    return operation(db, user, property_id, f"void:{id}", data, run, admin=True)


def adjust(db, user, property_id, id, data):
    def run(op):
        obj = scoped(db, m.FinanceObligation, id, property_id)
        adjust_obligation(db, obj, data.new_total, op, data.new_due_on)
        return {
            "obligation_id": id,
            "total": str(obligation_values(db, obj)[0]),
            "pending": str(obligation_values(db, obj)[2]),
        }

    return operation(db, user, property_id, f"adjust:{id}", data, run, admin=True)


def expense_adjust(db, user, property_id, id, data):
    def run(op):
        obj = scoped(db, m.FinanceExpense, id, property_id)
        require(not obj.void_operation_id, "El gasto está anulado.", 409)
        old, paid, _ = expense_values(db, obj)
        # Un proveedor puede deber devolver un exceso ya pagado; no se inventa salida/entrada.
        db.add(
            m.FinanceExpenseAdjustment(
                expense_id=id, delta=data.new_total - old, operation_id=op.id
            )
        )
        db.flush()
        return {
            "expense_id": id,
            "total": str(data.new_total),
            "provider_refund_pending": str(max(paid - data.new_total, ZERO)),
        }

    return operation(
        db, user, property_id, f"expense-adjust:{id}", data, run, admin=True
    )


def expense_void(db, user, property_id, id, data):
    def run(op):
        obj = scoped(db, m.FinanceExpense, id, property_id)
        require(not obj.void_operation_id, "El gasto ya está anulado.", 409)
        require(
            expense_values(db, obj)[1] == 0,
            "Anule primero los pagos relacionados con este gasto.",
            409,
        )
        obj.void_operation_id = op.id
        return {"expense_id": id, "voided": True}

    return operation(db, user, property_id, f"expense-void:{id}", data, run, admin=True)


def application_void(db, user, property_id, id, data):
    def run(op):
        app = u.fresh(db, m.FinanceApplication, id)
        require(app is not None, "No se encontró la aplicación.", 404)
        scoped(db, m.FinanceObligation, app.obligation_id, property_id)
        require(not app.void_operation_id, "La aplicación ya está anulada.", 409)
        app.void_operation_id = op.id
        return {"application_id": id, "voided": True}

    return operation(
        db, user, property_id, f"application-void:{id}", data, run, admin=True
    )


def rent_context(db, user, property_id, id, data):
    contract = u.fresh(db, Contract, id)
    require(
        contract is not None
        and target_property(db, contract.property_id, contract.unit_id) == property_id,
        "No se encontró el contrato o no tiene acceso.",
        404,
    )
    check_version(contract, data.expected_version)
    return contract


def preview(db, user, property_id, id, data):
    read_property(db, user, property_id)
    return rent_preview(rent_context(db, user, property_id, id, data), data)


def generate_rent(db, user, property_id, id, data):
    def run(op):
        c = rent_context(db, user, property_id, id, data)
        result = rent_preview(c, data)
        require(not result["issues"], " ".join(result["issues"]))
        a = account(db, property_id, c.responsible_person_id, c.currency, user)
        existing = rows(db, m.FinanceObligation, rent_contract_id=id)
        output = []
        touched = set()
        for p in result["periods"]:
            start = date.fromisoformat(p["start"])
            end = date.fromisoformat(p["end"])
            due = date.fromisoformat(p["due_on"])
            value = Decimal(p["amount"])
            candidates = [o for o in existing if o.period_start == start]
            for other in candidates:
                if other.account_id != a.id and obligation_values(db, other)[0] > 0:
                    require(
                        data.accept_context_change and bool(data.reason),
                        "Cambió el responsable o la moneda: revise y autorice expresamente sustituir el contexto, conservando el saldo anterior.",
                        409,
                    )
                    manage(user, active=True)
                    adjust_obligation(db, other, ZERO, op)
            obj = next((o for o in candidates if o.account_id == a.id), None)
            if obj:
                old, _, _, old_due, old_end = obligation_values(db, obj)
                if (old, old_due, old_end) != (value, due, end):
                    manage(user, active=True)
                    require(
                        bool(data.reason),
                        "Justifique el ajuste de los importes o fechas ya registrados.",
                        409,
                    )
                    adjust_obligation(db, obj, value, op, due, end)
            else:
                obj = m.FinanceObligation(
                    account_id=a.id,
                    unit_id=c.unit_id,
                    rent_contract_id=id,
                    period_start=start,
                    period_end=end,
                    original_amount=value,
                    due_on=due,
                    operation_id=op.id,
                )
                db.add(obj)
                db.flush()
            touched.add(obj.id)
            output.append(obj.id)
        for old in existing:
            if (
                old.id not in touched
                and old.period_start <= data.through
                and old.period_start > (c.actual_end_date or c.end_date)
                and obligation_values(db, old)[0] > 0
            ):
                manage(user, active=True)
                require(
                    bool(data.reason),
                    "Justifique los ajustes por finalización anticipada.",
                    409,
                )
                adjust_obligation(db, old, ZERO, op)
        return {"obligation_ids": output, "preview": result}

    return operation(db, user, property_id, f"rent:{id}", data, run)


def import_utility(db, user, property_id, id, data):
    def run(op):
        receipt, account_ = u.receipt_context(db, user, id, True)
        require(
            account_.property_id == property_id,
            "No se encontró el recibo o no tiene acceso.",
            404,
        )
        current = u.current_distribution(db, id, True)
        require(
            current and current.distribution_id == data.expected_distribution_id,
            "Seleccione la distribución confirmada vigente; no se importan borradores.",
            409,
        )
        d = u.fresh(db, UtilityDistribution, current.distribution_id)
        require(d.status == "confirmed", "La distribución no está confirmada.", 409)
        prior = rows(db, m.FinanceUtilityImport, distribution_id=d.id)
        if prior:
            previous = u.fresh(db, m.FinanceOperation, prior[0].operation_id)
            return {**json.loads(previous.result), "already_imported": True}
        revision = u.fresh(db, UtilityReceiptRevision, d.receipt_revision_id)
        previous_expenses = rows(db, m.FinanceExpense, receipt_id=id)
        if previous_expenses:
            expense = previous_expenses[0]
            require(
                not expense.void_operation_id,
                "El gasto del proveedor está anulado. Revise su historial antes de importar.",
                409,
            )
            require(
                u.fresh(db, m.FinanceAccount, expense.account_id).currency
                == revision.currency,
                "El cambio de moneda del proveedor requiere revisión separada; no se convierten importes.",
                409,
            )
            old = expense_values(db, expense)[0]
            had_imports = u.rows(
                db,
                select(m.FinanceUtilityImport)
                .join(
                    UtilityDistribution,
                    m.FinanceUtilityImport.distribution_id == UtilityDistribution.id,
                )
                .join(
                    UtilityReceiptRevision,
                    UtilityDistribution.receipt_revision_id
                    == UtilityReceiptRevision.id,
                )
                .where(UtilityReceiptRevision.receipt_id == id),
                True,
            )
            if had_imports or old != revision.amount:
                manage(user, active=True)
                require(
                    bool(data.reason),
                    "Justifique la importación de una distribución sustituta o el ajuste del gasto.",
                )
            if old != revision.amount:
                db.add(
                    m.FinanceExpenseAdjustment(
                        expense_id=expense.id,
                        delta=revision.amount - old,
                        operation_id=op.id,
                    )
                )
        else:
            a = account(db, property_id, data.owner_person_id, revision.currency, user)
            category = rows(db, m.FinanceCategory, name="Servicios básicos")
            require(
                bool(category),
                "Registre la categoría Servicios básicos antes de importar.",
                409,
            )
            expense = m.FinanceExpense(
                account_id=a.id,
                category_id=category[0].id,
                receipt_id=id,
                description=f"Recibo externo: {account_.label}",
                recorded_on=revision.issued_on,
                original_amount=revision.amount,
                due_on=revision.due_on,
                document_reference=revision.document_reference,
                operation_id=op.id,
            )
            db.add(expense)
            db.flush()
        home_accounts = select(m.FinanceAccount.id).where(
            m.FinanceAccount.property_id == property_id
        )
        old_obligations = [
            o
            for o in u.rows(
                db,
                select(m.FinanceObligation)
                .where(
                    m.FinanceObligation.account_id.in_(home_accounts),
                    m.FinanceObligation.service_origin_id.is_not(None),
                )
                .order_by(m.FinanceObligation.id),
                True,
            )
            if origin_receipt(db, o) == id
        ]
        keys = {}
        for old in old_obligations:
            origin = db.get(UtilityResponsibility, old.service_origin_id)
            keys[(old.account_id, old.unit_id, origin.contract_id)] = old
        totals = {}
        first_source = {}
        newlinks = []
        frozen = json.loads(d.evidence)
        for allocation in rows(db, UtilityAllocation, distribution_id=d.id):
            for r in rows(db, UtilityResponsibility, allocation_id=allocation.id):
                if not r.contract_id or r.amount == 0:
                    continue
                source = next(
                    (
                        c
                        for s in frozen["spaces"]
                        for c in s["contracts"]
                        if c["id"] == r.contract_id
                    ),
                    None,
                )
                require(
                    source is not None
                    and not source["exempt"]
                    and source.get("eligible", False),
                    "La distribución no permite gastos adicionales a este ocupante.",
                    409,
                )
                a = account(db, property_id, r.person_id, revision.currency, user)
                key = (a.id, allocation.unit_id, r.contract_id)
                totals[key] = totals.get(key, ZERO) + r.amount
                first_source.setdefault(key, r.id)
                newlinks.append((r.id, key))
        output = []
        for key, value in totals.items():
            obj = keys.get(key)
            if obj:
                adjust_obligation(
                    db, obj, value, op, revision.due_on, revision.period_end
                )
            else:
                obj = m.FinanceObligation(
                    account_id=key[0],
                    unit_id=key[1],
                    service_origin_id=first_source[key],
                    period_start=revision.period_start,
                    period_end=revision.period_end,
                    original_amount=value,
                    due_on=revision.due_on,
                    operation_id=op.id,
                )
                db.add(obj)
                db.flush()
                keys[key] = obj
            output.append(obj.id)
        for key, obj in keys.items():
            if key not in totals:
                adjust_obligation(db, obj, ZERO, op)
        for responsibility_id, key in newlinks:
            db.add(
                m.FinanceUtilityLink(
                    responsibility_id=responsibility_id, obligation_id=keys[key].id
                )
            )
        db.add(m.FinanceUtilityImport(distribution_id=d.id, operation_id=op.id))
        db.flush()
        return {
            "obligation_ids": output,
            "expense_id": expense.id,
            "distribution_id": d.id,
            "provider_receipt_amount": str(revision.amount),
        }

    return operation(db, user, property_id, f"utility:{id}", data, run)


def receipt_expense(db, user, property_id, id, data):
    def run(op):
        receipt, supply = u.receipt_context(db, user, id, True)
        require(
            supply.property_id == property_id,
            "No se encontró el recibo o no tiene acceso.",
            404,
        )
        previous = rows(db, m.FinanceExpense, receipt_id=id)
        if previous:
            return {"expense_id": previous[0].id, "already_registered": True}
        check_version(receipt, data.expected_version)
        revision = u.latest_revision(db, id, True)
        a = account(db, property_id, data.owner_person_id, revision.currency, user)
        category = rows(db, m.FinanceCategory, name="Servicios básicos")
        require(
            bool(category),
            "Registre la categoría Servicios básicos antes de continuar.",
            409,
        )
        expense = m.FinanceExpense(
            account_id=a.id,
            category_id=category[0].id,
            receipt_id=id,
            description=f"Recibo externo: {supply.label}",
            recorded_on=revision.issued_on,
            original_amount=revision.amount,
            due_on=revision.due_on,
            document_reference=revision.document_reference,
            operation_id=op.id,
        )
        db.add(expense)
        db.flush()
        return {
            "expense_id": expense.id,
            "registered": str(expense.original_amount),
            "paid": "0.00",
            "obligations_created": False,
        }

    return operation(db, user, property_id, f"receipt-expense:{id}", data, run)


def retain_guarantee(db, user, property_id, id, data):
    def run(op):
        scoped(db, m.FinanceMovement, id, property_id)
        obj = db.get(m.FinanceGuarantee, id)
        require(obj is not None, "El movimiento no es una garantía.")
        obj.retained_operation_id = op.id
        return {"movement_id": id, "retained": True}

    return operation(db, user, property_id, f"retain:{id}", data, run, admin=True)


def obligation_dict(db, obj):
    a = u.fresh(db, m.FinanceAccount, obj.account_id)
    total, paid, pending, due, end = obligation_values(db, obj)
    state = (
        "adjusted"
        if total == 0
        else (
            "paid"
            if pending == 0
            else "overdue" if due < today() else "partial" if paid > 0 else "pending"
        )
    )
    apps = applications(db, obligation_id=obj.id)
    from_credit = ZERO
    for p in apps:
        source = u.fresh(db, m.FinanceMovement, p.source_movement_id)
        original = p
        while original.replaces_id:
            original = u.fresh(db, m.FinanceApplication, original.replaces_id)
        source_operation = u.fresh(db, m.FinanceOperation, original.operation_id)
        if source_operation.action == "apply" and db.get(m.FinanceIncoming, source.id):
            from_credit += p.amount
    receipt_id = origin_receipt(db, obj)
    supply = (
        db.get(ServiceAccount, db.get(UtilityReceipt, receipt_id).account_id)
        if receipt_id
        else None
    )
    return {
        **u.scalar_dict(obj),
        "property_id": a.property_id,
        "person_id": a.person_id,
        "currency": a.currency,
        "contract_id": origin_contract(db, obj),
        "receipt_id": receipt_id,
        "concept": "Alquiler" if obj.rent_contract_id else supply.label,
        "adjustments": str(total - obj.original_amount),
        "total": str(total),
        "applied": str(paid),
        "credit_applied": str(from_credit),
        "pending": str(pending),
        "effective_due_on": due.isoformat(),
        "effective_period_end": end.isoformat(),
        "state": state,
        "applications": [u.scalar_dict(p) for p in apps],
    }


def movement_dict(db, obj):
    a = movement_account(db, obj.id)
    incoming = db.get(m.FinanceIncoming, obj.id)
    guarantee = db.get(m.FinanceGuarantee, obj.id)
    disb = db.get(m.FinanceDisbursement, obj.id)
    refund_ = db.get(m.FinanceRefund, obj.id)
    kind = (
        "advance"
        if incoming and incoming.category == "advance"
        else (
            "received"
            if incoming
            else (
                "guarantee"
                if guarantee
                else (
                    "provider_direct"
                    if disb and disb.is_direct
                    else "disbursed" if disb else "refund"
                )
            )
        )
    )
    value = (
        available(db, obj)
        if incoming or guarantee or (disb and disb.is_direct)
        else ZERO
    )
    active_apps = applications(db, source_movement_id=obj.id)
    returned = sum(
        (
            u.fresh(db, m.FinanceMovement, r.movement_id).amount
            for r in rows(db, m.FinanceRefund, source_movement_id=obj.id)
            if not u.fresh(db, m.FinanceMovement, r.movement_id).void_operation_id
        ),
        ZERO,
    )
    status = (
        "voided"
        if obj.void_operation_id
        else (
            "refunded"
            if guarantee and returned == obj.amount
            else (
                "partially_refunded"
                if returned > 0
                else (
                    "partially_applied"
                    if guarantee and value < obj.amount
                    else (
                        "held"
                        if guarantee and guarantee.retained_operation_id
                        else "received" if guarantee else "registered"
                    )
                )
            )
        )
    )
    return {
        **u.scalar_dict(obj),
        "property_id": a.property_id,
        "person_id": a.person_id,
        "currency": a.currency,
        "kind": kind,
        "state": status,
        "available": str(value),
        "refunded": str(returned),
        "applied": str(sum((p.amount for p in active_apps), ZERO)),
        "contract_id": guarantee.contract_id if guarantee else None,
        "conditions": guarantee.conditions if guarantee else None,
        "expense_id": disb.expense_id if disb else None,
        "source_movement_id": refund_.source_movement_id if refund_ else None,
        "applications": [
            u.scalar_dict(p)
            for p in rows(db, m.FinanceApplication, source_movement_id=obj.id)
        ],
    }


def state(db, user, property_id):
    read_property(db, user, property_id)
    accounts = rows(db, m.FinanceAccount, property_id=property_id)
    ids = {a.id for a in accounts}
    obligations = [
        obligation_dict(db, o)
        for o in u.rows(
            db,
            select(m.FinanceObligation)
            .where(m.FinanceObligation.account_id.in_(ids))
            .order_by(m.FinanceObligation.id),
            True,
        )
    ]
    expenses = []
    for e in u.rows(
        db,
        select(m.FinanceExpense)
        .where(m.FinanceExpense.account_id.in_(ids))
        .order_by(m.FinanceExpense.id),
        True,
    ):
        a = next(a for a in accounts if a.id == e.account_id)
        total, paid, pending = expense_values(db, e)
        owner_share = ZERO
        imported_id = None
        if e.receipt_id:
            candidates = u.rows(
                db,
                select(m.FinanceUtilityImport)
                .join(
                    UtilityDistribution,
                    m.FinanceUtilityImport.distribution_id == UtilityDistribution.id,
                )
                .join(
                    UtilityReceiptRevision,
                    UtilityDistribution.receipt_revision_id
                    == UtilityReceiptRevision.id,
                )
                .where(UtilityReceiptRevision.receipt_id == e.receipt_id)
                .order_by(m.FinanceUtilityImport.operation_id),
                True,
            )
            if candidates:
                imported_id = candidates[-1].distribution_id
                owner_share = sum(
                    (
                        r.amount
                        for allocation in rows(
                            db, UtilityAllocation, distribution_id=imported_id
                        )
                        for r in rows(
                            db, UtilityResponsibility, allocation_id=allocation.id
                        )
                        if r.contract_id is None
                    ),
                    ZERO,
                )
        current = u.current_distribution(db, e.receipt_id) if e.receipt_id else None
        expenses.append(
            {
                **u.scalar_dict(e),
                "person_id": a.person_id,
                "currency": a.currency,
                "total": str(total),
                "paid": str(paid),
                "pending": str(pending),
                "owner_service_amount": str(owner_share),
                "imported_distribution_id": imported_id,
                "pending_distribution_change": bool(
                    current and current.distribution_id != imported_id
                ),
                "provider_refund_pending": str(max(paid - total, ZERO)),
                "state": (
                    "voided"
                    if e.void_operation_id
                    else (
                        "paid" if pending == 0 else "partial" if paid > 0 else "pending"
                    )
                ),
            }
        )
    operations = rows(db, m.FinanceOperation, property_id=property_id)
    movement_rows = u.rows(
        db,
        select(m.FinanceMovement)
        .where(m.FinanceMovement.operation_id.in_([o.id for o in operations]))
        .order_by(m.FinanceMovement.id),
        True,
    )
    movements = [movement_dict(db, obj) for obj in movement_rows]
    summaries = []
    for currency in sorted({a.currency for a in accounts}):
        obs = [o for o in obligations if o["currency"] == currency]
        exps = [e for e in expenses if e["currency"] == currency]
        moves = [
            p
            for p in movements
            if p["currency"] == currency and not p["void_operation_id"]
        ]

        def money_sum(items, key):
            return str(sum((Decimal(i[key]) for i in items), ZERO))

        recovered = ZERO
        direct_paid = ZERO
        for o in obs:
            if not o["service_origin_id"]:
                continue
            for application in o["applications"]:
                move = next(
                    p for p in moves if p["id"] == application["source_movement_id"]
                )
                if move["kind"] == "provider_direct":
                    direct_paid += Decimal(application["amount"])
                else:
                    recovered += Decimal(application["amount"])
        summaries.append(
            {
                "currency": currency,
                "receivable": money_sum(obs, "total"),
                "pending": money_sum(obs, "pending"),
                "received": money_sum(
                    [p for p in moves if p["kind"] in {"received", "advance"}], "amount"
                ),
                "guarantees_received": money_sum(
                    [p for p in moves if p["kind"] == "guarantee"], "amount"
                ),
                "guarantees_available": money_sum(
                    [p for p in moves if p["kind"] == "guarantee"], "available"
                ),
                "credit_available": money_sum(
                    [p for p in moves if p["kind"] in {"received", "advance"}],
                    "available",
                ),
                "expenses_registered": money_sum(exps, "total"),
                "disbursed": money_sum(
                    [p for p in moves if p["kind"] == "disbursed"], "amount"
                ),
                "refunded": money_sum(
                    [p for p in moves if p["kind"] == "refund"], "amount"
                ),
                "services_recovered": str(recovered),
                "services_direct": str(direct_paid),
                "owner_services": money_sum(
                    [e for e in exps if e["receipt_id"]], "owner_service_amount"
                ),
                "provider_direct": money_sum(
                    [p for p in moves if p["kind"] == "provider_direct"], "amount"
                ),
            }
        )
    return {
        "accounts": [u.scalar_dict(a) for a in accounts],
        "obligations": obligations,
        "movements": movements,
        "expenses": expenses,
        "summary": summaries,
        "history": [u.scalar_dict(o) for o in operations],
    }
