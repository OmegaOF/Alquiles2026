"""Proyección única de hechos financieros; filtros, moneda y corte compartidos.

No persiste resultados. La creación/anulación se reconstruye por operaciones
UTC; las fechas económicas son fechas de negocio. No se usa JSON de auditoría
como libro ni se sustituye el estado histórico por el estado actual.
"""

import calendar
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from app.models import finances as f, anticreticos as a, utilities as u
from app.models.entities import Person, Unit, PropertyOwner
from app.models.tenancy import Contract, ContractOwner, ContractOccupant, Reservation
from app.services import tenancy
from app.services.money_rules import (
    ZERO,
    obligation_measure,
    expense_measure,
    capital_pending,
)

ZONE = ZoneInfo("America/La_Paz")
MONEY_KEYS = (
    "charges_recorded",
    "obligations_total",
    "obligations_applied",
    "pending",
    "rent_pending",
    "service_pending",
    "ordinary_received",
    "cash_received",
    "expenses_recorded",
    "expense_total",
    "expense_applied",
    "payable_pending",
    "provider_refund_pending",
    "disbursed",
    "cash_out",
    "provider_direct",
    "refunded",
    "services_recovered",
    "services_direct",
    "owner_service_responsibility",
    "occupant_service_responsibility",
    "recoveries_pending",
    "guarantees_received",
    "guarantees_available",
    "advances_received",
    "credit_available",
    "capital_agreed",
    "capital_received",
    "capital_returned",
    "capital_pending",
    "capital_adjustments",
    "capital_received_period",
    "capital_returned_period",
    "noncash_adjustments",
)


def decimal_text(value):
    return format(value, ".2f")


def period(filters):
    now = tenancy.today()
    if filters.year:
        first = date(filters.year, filters.month or 1, 1)
        last_month = filters.month or 12
        last = date(
            filters.year, last_month, calendar.monthrange(filters.year, last_month)[1]
        )
    else:
        first = filters.start_date or now.replace(day=1)
        last = filters.end_date or now
    if last < first or (last - first).days > 3660:
        raise HTTPException(422, "Seleccione un periodo válido de hasta diez años.")
    cut = filters.as_of or min(last, now)
    if cut > now:
        raise HTTPException(422, "La fecha de corte no puede ser posterior a hoy.")
    return first, last, cut


class Projection:
    def __init__(self, facts, filters, start=None, end=None, cutoff=None):
        self.facts, self.filters = facts, filters
        default = period(filters)
        self.start, self.end, self.cut = (
            start or default[0],
            end or default[1],
            cutoff or default[2],
        )
        self.until = (
            datetime.combine(self.cut + timedelta(days=1), time.min, ZONE)
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        self.groups = defaultdict(lambda: {k: ZERO for k in MONEY_KEYS})
        self.by_property = defaultdict(
            lambda: defaultdict(lambda: {k: ZERO for k in MONEY_KEYS})
        )
        self.obligations, self.expenses, self.movements, self.capital, self.services = (
            [],
            [],
            [],
            [],
            [],
        )
        self.limits = []
        self.unknown_recoveries = set()
        self.unknown_recovery_properties = set()
        self.accounts = {x.id: x for x in facts.all(f.FinanceAccount)}
        self.ops = {x.id: x for x in facts.all(f.FinanceOperation)}
        self.moves = {x.id: x for x in facts.all(f.FinanceMovement)}
        self.contracts = {x.id: x for x in facts.all(Contract)}
        self.apps = [
            x
            for x in facts.all(f.FinanceApplication)
            if self.active(x) and self.move_active(self.moves.get(x.source_movement_id))
        ]
        self.apps_by_debt = defaultdict(list)
        self.apps_by_move = defaultdict(list)
        for app in self.apps:
            self.apps_by_debt[app.obligation_id].append(app)
            self.apps_by_move[app.source_movement_id].append(app)
        self.debts()
        self.costs()
        self.cash()
        self.principal()
        self.service_rows()

    def known(self, operation_id):
        op = self.ops.get(operation_id)
        return bool(op and op.created_at < self.until)

    def active(self, obj):
        return self.known(obj.operation_id) and not self.known(
            getattr(obj, "void_operation_id", None)
        )

    def move_active(self, obj):
        return obj is not None and self.active(obj) and obj.occurred_on <= self.cut

    def day(self, operation_id):
        op = self.ops[operation_id]
        return op.created_at.replace(tzinfo=timezone.utc).astimezone(ZONE).date()

    def in_period(self, day):
        return self.start <= day <= self.end and day <= self.cut

    def person(self, id):
        obj = self.facts.get(Person, id)
        return obj.full_name if obj else "Sin persona identificada"

    def space(self, id):
        obj = self.facts.get(Unit, id)
        return (
            f"{obj.code} · {obj.name}"
            if obj
            else "Casa completa / sin atribución a cuarto"
        )

    def prop(self, cid):
        c = self.contracts[cid]
        unit = self.facts.get(Unit, c.unit_id)
        return c.property_id or unit.property_id

    def origin(self, obj):
        if obj.rent_contract_id:
            return obj.rent_contract_id, None, None
        responsibility = self.facts.get(u.UtilityResponsibility, obj.service_origin_id)
        allocation = self.facts.get(u.UtilityAllocation, responsibility.allocation_id)
        dist = self.facts.get(u.UtilityDistribution, allocation.distribution_id)
        rev = self.facts.get(u.UtilityReceiptRevision, dist.receipt_revision_id)
        receipt = self.facts.get(u.UtilityReceipt, rev.receipt_id)
        supply = self.facts.get(u.ServiceAccount, receipt.account_id)
        return responsibility.contract_id, receipt.id, supply.type_id

    def matches(
        self,
        currency,
        person=None,
        unit=None,
        contract=None,
        service=None,
        category=None,
        state=None,
    ):
        q = self.filters
        c = self.contracts.get(contract)
        if q.currency and q.currency != currency:
            return False
        if q.person_id and q.person_id != person:
            return False
        if q.unit_id and q.unit_id != unit:
            return False
        if q.contract_id and q.contract_id != contract:
            return False
        if q.mode and (not c or c.mode != q.mode):
            return False
        if q.service_type_id and q.service_type_id != service:
            return False
        if q.category_id and q.category_id != category:
            return False
        if q.state:
            if q.state in {"active", "finished", "draft", "cancelled"}:
                if not c or c.status != q.state:
                    return False
            elif q.state != state:
                return False
        return True

    def add(self, pid, currency, key, amount):
        self.groups[currency][key] += amount
        self.by_property[pid][currency][key] += amount

    def debts(self):
        for obj in self.facts.all(f.FinanceObligation):
            if not self.known(obj.operation_id):
                continue
            acc = self.accounts[obj.account_id]
            adjustments = sorted(
                [
                    x
                    for x in self.facts.by(f.FinanceAdjustment, "obligation_id", obj.id)
                    if self.known(x.operation_id)
                ],
                key=lambda x: x.id,
            )
            applications = self.apps_by_debt[obj.id]
            total, paid, pending, due, end = obligation_measure(
                obj.original_amount,
                adjustments,
                applications,
                obj.due_on,
                obj.period_end,
            )
            status = (
                "adjusted"
                if total == 0
                else (
                    "paid"
                    if pending == 0
                    else (
                        "overdue"
                        if due < self.cut
                        else ("partial" if paid else "pending")
                    )
                )
            )
            cid, rid, tid = self.origin(obj)
            if not self.matches(
                acc.currency, acc.person_id, obj.unit_id, cid, tid, state=status
            ):
                continue
            row = dict(
                id=obj.id,
                property_id=acc.property_id,
                unit_id=obj.unit_id,
                contract_id=cid,
                person_id=acc.person_id,
                person=self.person(acc.person_id),
                unit=self.space(obj.unit_id),
                receipt_id=rid,
                service_type_id=tid,
                currency=acc.currency,
                concept="Alquiler" if obj.rent_contract_id else "Servicio básico",
                period_start=obj.period_start,
                period_end=end,
                due_on=due,
                state=status,
                original=obj.original_amount,
                total=total,
                applied=paid,
                pending=pending,
                overdue_days=max((self.cut - due).days, 0) if pending else 0,
                adjustments=[
                    dict(id=x.id, delta=x.delta, date=self.day(x.operation_id))
                    for x in adjustments
                ],
                applications=[
                    dict(
                        id=x.id,
                        movement_id=x.source_movement_id,
                        amount=x.amount,
                        date=max(
                            self.day(x.operation_id),
                            self.moves[x.source_movement_id].occurred_on,
                        ),
                    )
                    for x in applications
                ],
            )
            self.obligations.append(row)
            for key, value in [
                ("obligations_total", total),
                ("obligations_applied", paid),
                ("pending", pending),
                (
                    "rent_pending" if obj.rent_contract_id else "service_pending",
                    pending,
                ),
            ]:
                self.add(acc.property_id, acc.currency, key, value)
            if rid:
                for app in applications:
                    move = self.moves[app.source_movement_id]
                    if self.in_period(
                        max(move.occurred_on, self.day(app.operation_id))
                    ):
                        direct = self.facts.get(f.FinanceDisbursement, move.id)
                        self.add(
                            acc.property_id,
                            acc.currency,
                            (
                                "services_direct"
                                if direct and direct.is_direct
                                else "services_recovered"
                            ),
                            app.amount,
                        )
            if self.in_period(self.day(obj.operation_id)):
                self.add(
                    acc.property_id,
                    acc.currency,
                    "charges_recorded",
                    obj.original_amount,
                )
            for x in adjustments:
                if self.in_period(self.day(x.operation_id)):
                    self.add(acc.property_id, acc.currency, "charges_recorded", x.delta)
                    self.add(
                        acc.property_id, acc.currency, "noncash_adjustments", x.delta
                    )

    def costs(self):
        for obj in self.facts.all(f.FinanceExpense):
            if not self.known(obj.operation_id) or obj.recorded_on > self.cut:
                continue
            acc = self.accounts[obj.account_id]
            adjustments = [
                x
                for x in self.facts.by(f.FinanceExpenseAdjustment, "expense_id", obj.id)
                if self.known(x.operation_id)
            ]
            links = self.facts.by(f.FinanceDisbursement, "expense_id", obj.id)
            moves = [
                self.moves[x.movement_id]
                for x in links
                if self.move_active(self.moves.get(x.movement_id))
            ]
            void = self.known(obj.void_operation_id)
            total, paid, pending = expense_measure(
                obj.original_amount, void, adjustments, moves
            )
            status = (
                "voided"
                if void
                else ("paid" if pending == 0 else ("partial" if paid else "pending"))
            )
            tid = None
            if obj.receipt_id:
                receipt = self.facts.get(u.UtilityReceipt, obj.receipt_id)
                tid = self.facts.get(u.ServiceAccount, receipt.account_id).type_id
            if not self.matches(
                acc.currency,
                acc.person_id,
                obj.unit_id,
                service=tid,
                category=obj.category_id,
                state=status,
            ):
                continue
            category = self.facts.get(f.FinanceCategory, obj.category_id)
            row = dict(
                id=obj.id,
                property_id=acc.property_id,
                unit_id=obj.unit_id,
                unit=self.space(obj.unit_id),
                person_id=acc.person_id,
                person=self.person(acc.person_id),
                currency=acc.currency,
                category_id=obj.category_id,
                category=category.name,
                receipt_id=obj.receipt_id,
                service_type_id=tid,
                description=obj.description,
                recorded_on=obj.recorded_on,
                due_on=obj.due_on,
                total=total,
                applied=paid,
                pending=pending,
                state=status,
                provider_refund_pending=max(paid - total, ZERO),
                adjustments=[
                    dict(id=x.id, delta=x.delta, date=self.day(x.operation_id))
                    for x in adjustments
                ],
                voided_on=self.day(obj.void_operation_id) if void else None,
            )
            self.expenses.append(row)
            for key, value in [
                ("expense_total", total),
                ("expense_applied", paid),
                ("payable_pending", pending),
                ("provider_refund_pending", max(paid - total, ZERO)),
            ]:
                self.add(acc.property_id, acc.currency, key, value)
            if self.in_period(obj.recorded_on):
                self.add(
                    acc.property_id,
                    acc.currency,
                    "expenses_recorded",
                    obj.original_amount,
                )
            for adj in adjustments:
                if self.in_period(self.day(adj.operation_id)):
                    self.add(
                        acc.property_id, acc.currency, "expenses_recorded", adj.delta
                    )
                    self.add(
                        acc.property_id, acc.currency, "noncash_adjustments", adj.delta
                    )
            if void and self.in_period(self.day(obj.void_operation_id)):
                self.add(
                    acc.property_id,
                    acc.currency,
                    "expenses_recorded",
                    -(obj.original_amount + sum((x.delta for x in adjustments), ZERO)),
                )
                self.add(
                    acc.property_id,
                    acc.currency,
                    "noncash_adjustments",
                    -(obj.original_amount + sum((x.delta for x in adjustments), ZERO)),
                )

    def movement_account(self, mid, seen=None):
        seen = seen or set()
        if mid in seen:
            raise HTTPException(
                409, "El historial contiene una referencia circular de devolución."
            )
        seen.add(mid)
        for model in (f.FinanceIncoming, f.FinanceGuarantee):
            row = self.facts.get(model, mid)
            if row:
                return self.accounts[row.account_id]
        row = self.facts.get(f.FinanceDisbursement, mid)
        if row:
            exp = self.facts.get(f.FinanceExpense, row.expense_id)
            return self.accounts[exp.account_id]
        row = self.facts.get(f.FinanceRefund, mid)
        if row:
            return self.movement_account(row.source_movement_id, seen)
        return None

    def cash(self):
        selected = {o["id"]: o for o in self.obligations}
        exps = {e["id"]: e for e in self.expenses}
        narrow = any(
            [
                self.filters.unit_id,
                self.filters.contract_id,
                self.filters.mode,
                self.filters.service_type_id,
                self.filters.category_id,
                self.filters.state,
            ]
        )
        for move in self.moves.values():
            if self.facts.get(a.AnticreticoMovement, move.id) or not self.move_active(
                move
            ):
                continue
            account = self.movement_account(move.id)
            if not account:
                raise HTTPException(
                    409,
                    "Hay un movimiento sin contexto financiero válido; revise el registro de origen.",
                )
            incoming = self.facts.get(f.FinanceIncoming, move.id)
            guarantee = self.facts.get(f.FinanceGuarantee, move.id)
            disb = self.facts.get(f.FinanceDisbursement, move.id)
            refund = self.facts.get(f.FinanceRefund, move.id)
            apps = self.apps_by_move[move.id]
            eligible = [x for x in apps if x.obligation_id in selected]
            direct_match = bool(disb and disb.is_direct and eligible)
            if self.filters.currency and self.filters.currency != account.currency:
                continue
            if (
                self.filters.person_id
                and self.filters.person_id != account.person_id
                and not direct_match
            ):
                continue
            amount = move.amount
            kind = (
                "advance"
                if incoming and incoming.category == "advance"
                else "collection"
            )
            if guarantee:
                c = self.contracts[guarantee.contract_id]
                if not self.matches(
                    account.currency, account.person_id, c.unit_id, c.id, state=c.status
                ):
                    continue
                kind = "guarantee"
            elif disb:
                if (
                    disb.is_direct
                    and narrow
                    or disb.is_direct
                    and self.filters.person_id
                ):
                    amount = sum((x.amount for x in eligible), ZERO)
                    if not amount:
                        continue
                elif disb.expense_id not in exps:
                    continue
                kind = "provider_direct" if disb.is_direct else "disbursement"
            elif refund:
                # Garantía: contrato explícito; crédito libre: sin atribución inventada.
                source_guarantee = self.facts.get(
                    f.FinanceGuarantee, refund.source_movement_id
                )
                if narrow:
                    if not source_guarantee:
                        continue
                    contract = self.contracts[source_guarantee.contract_id]
                    if not self.matches(
                        account.currency,
                        account.person_id,
                        contract.unit_id,
                        contract.id,
                        state=contract.status,
                    ):
                        continue
                kind = "refund"
            elif incoming and narrow:
                amount = sum((x.amount for x in eligible), ZERO)
                if not amount:
                    continue
            refunds = [
                self.moves[x.movement_id]
                for x in self.facts.by(f.FinanceRefund, "source_movement_id", move.id)
                if self.move_active(self.moves.get(x.movement_id))
            ]
            available = (
                move.amount
                - sum((x.amount for x in apps), ZERO)
                - sum((x.amount for x in refunds), ZERO)
            )
            if incoming or guarantee:
                if not narrow or guarantee:
                    self.add(
                        account.property_id,
                        account.currency,
                        "guarantees_available" if guarantee else "credit_available",
                        available,
                    )
            if not self.in_period(move.occurred_on):
                continue
            person_id = move.payer_id if disb and disb.is_direct else account.person_id
            row = dict(
                id=move.id,
                property_id=account.property_id,
                person_id=person_id,
                person=self.person(person_id),
                currency=account.currency,
                kind=kind,
                occurred_on=move.occurred_on,
                amount=amount,
                payer=self.person(move.payer_id),
                beneficiary=(
                    self.person(move.beneficiary_person_id)
                    if move.beneficiary_person_id
                    else (move.beneficiary_label or "Sin destinatario indicado")
                ),
                applications=[
                    dict(obligation_id=x.obligation_id, amount=x.amount)
                    for x in eligible
                ],
            )
            self.movements.append(row)
            if incoming:
                self.add(
                    account.property_id, account.currency, "ordinary_received", amount
                )
                self.add(account.property_id, account.currency, "cash_received", amount)
                if kind == "advance":
                    self.add(
                        account.property_id,
                        account.currency,
                        "advances_received",
                        amount,
                    )
            if guarantee:
                self.add(
                    account.property_id, account.currency, "guarantees_received", amount
                )
                self.add(account.property_id, account.currency, "cash_received", amount)
            if disb:
                self.add(
                    account.property_id,
                    account.currency,
                    "provider_direct" if disb.is_direct else "disbursed",
                    amount,
                )
                if not disb.is_direct:
                    self.add(account.property_id, account.currency, "cash_out", amount)
            if refund:
                self.add(account.property_id, account.currency, "refunded", amount)
                self.add(account.property_id, account.currency, "cash_out", amount)

    def principal(self):
        for terms in self.facts.all(a.AnticreticoTerms):
            c = self.contracts[terms.contract_id]
            revisions = sorted(
                [
                    r
                    for r in self.facts.by(a.AnticreticoRevision, "contract_id", c.id)
                    if self.known(r.operation_id)
                ],
                key=lambda x: x.revision,
            )
            if not revisions:
                continue
            rev = revisions[-1]
            holders = self.facts.by(a.AnticreticoHolder, "revision_id", rev.id)
            responsibles = self.facts.by(
                a.AnticreticoResponsible, "revision_id", rev.id
            )
            historical_people = {
                x.person_id
                for revision in revisions
                for model in (a.AnticreticoHolder, a.AnticreticoResponsible)
                for x in self.facts.by(model, "revision_id", revision.id)
            }
            if (
                self.filters.person_id
                and self.filters.person_id not in historical_people
            ):
                continue
            if not self.matches(
                c.currency,
                self.filters.person_id,
                c.unit_id,
                c.id,
                state=self.filters.state,
            ):
                continue
            pid = self.prop(c.id)
            cells = defaultdict(
                lambda: dict(received=ZERO, returned=ZERO, adjustments=ZERO)
            )
            received_period, returned_period, adjusted_period = ZERO, ZERO, ZERO
            for revision in revisions:
                for link in self.facts.by(
                    a.AnticreticoMovement, "revision_id", revision.id
                ):
                    move = self.moves.get(link.movement_id)
                    if not self.move_active(move):
                        continue
                    field = "received" if link.kind == "delivery" else "returned"
                    for line in self.facts.by(
                        a.AnticreticoAllocation, "movement_id", move.id
                    ):
                        if self.filters.person_id and self.filters.person_id not in {
                            line.holder_id,
                            line.responsible_id,
                        }:
                            continue
                        cells[(line.holder_id, line.responsible_id)][
                            field
                        ] += line.amount
                        if self.in_period(move.occurred_on):
                            if field == "received":
                                received_period += line.amount
                            else:
                                returned_period += line.amount
                for adj in self.facts.by(
                    a.AnticreticoAdjustment, "revision_id", revision.id
                ):
                    if not self.active(adj) or adj.effective_on > self.cut:
                        continue
                    for line in self.facts.by(
                        a.AnticreticoAdjustmentLine, "adjustment_id", adj.id
                    ):
                        if self.filters.person_id and self.filters.person_id not in {
                            line.holder_id,
                            line.responsible_id,
                        }:
                            continue
                        cells[(line.holder_id, line.responsible_id)][
                            "adjustments"
                        ] += line.delta
                        if self.in_period(adj.effective_on):
                            adjusted_period += line.delta
            received = sum((v["received"] for v in cells.values()), ZERO)
            returned = sum((v["returned"] for v in cells.values()), ZERO)
            adjusted = sum((v["adjustments"] for v in cells.values()), ZERO)
            pending = capital_pending(received, returned, adjusted)
            status = (
                "adjusted"
                if pending == 0 and received > returned
                else (
                    "paid"
                    if pending == 0 and received
                    else (
                        "overdue"
                        if pending
                        and rev.restitution_on
                        and rev.restitution_on < self.cut
                        else "partial" if returned else "pending"
                    )
                )
            )
            if (
                self.filters.state
                and self.filters.state
                not in {"active", "finished", "draft", "cancelled"}
                and self.filters.state != status
            ):
                continue
            for key, value in [
                ("capital_received_period", received_period),
                ("capital_returned_period", returned_period),
                ("cash_received", received_period),
                ("cash_out", returned_period),
                ("noncash_adjustments", adjusted_period),
            ]:
                self.add(pid, c.currency, key, value)
            agreed = rev.agreed_capital
            row = dict(
                contract_id=c.id,
                property_id=pid,
                unit_id=c.unit_id,
                unit=self.space(c.unit_id),
                currency=c.currency,
                agreed=agreed,
                received=received,
                returned=returned,
                adjustments=adjusted,
                pending=pending,
                restitution_on=rev.restitution_on,
                state=status,
                contract_state=c.status,
                filtered_person=(
                    self.person(self.filters.person_id)
                    if self.filters.person_id
                    else None
                ),
                agreement_scope="Capital acordado del contrato completo; las cuotas individuales se muestran por titular y responsable.",
                holders=[
                    dict(
                        person_id=h.person_id,
                        person=self.person(h.person_id),
                        assigned_amount=h.assigned_amount,
                    )
                    for h in holders
                ],
                responsibles=[
                    dict(
                        person_id=r.person_id,
                        person=self.person(r.person_id),
                        assigned_amount=r.assigned_amount,
                    )
                    for r in responsibles
                ],
                balances=[
                    dict(
                        holder_id=h,
                        responsible_id=r,
                        **v,
                        pending=capital_pending(
                            v["received"], v["returned"], v["adjustments"]
                        ),
                    )
                    for (h, r), v in sorted(cells.items())
                ],
            )
            self.capital.append(row)
            for key, value in [
                ("capital_agreed", agreed),
                ("capital_received", received),
                ("capital_returned", returned),
                ("capital_adjustments", adjusted),
                ("capital_pending", pending),
            ]:
                self.add(pid, c.currency, key, value)

    def service_rows(self):
        """Usa el reparto confirmado conocido al corte, sin recalcular 15 días."""
        by_receipt = defaultdict(list)
        for dist in self.facts.all(u.UtilityDistribution):
            if dist.confirmed_at and dist.confirmed_at < self.until:
                rev = self.facts.get(u.UtilityReceiptRevision, dist.receipt_revision_id)
                by_receipt[rev.receipt_id].append(dist)
        for rid, dists in by_receipt.items():
            dist = max(dists, key=lambda x: (x.confirmed_at, x.id))
            rev = self.facts.get(u.UtilityReceiptRevision, dist.receipt_revision_id)
            closed_in_period = self.in_period(rev.period_end)
            receipt = self.facts.get(u.UtilityReceipt, rid)
            supply = self.facts.get(u.ServiceAccount, receipt.account_id)
            if (
                self.filters.service_type_id
                and self.filters.service_type_id != supply.type_id
            ):
                continue
            if self.filters.currency and self.filters.currency != rev.currency:
                continue
            owner, occupant = ZERO, ZERO
            lines = []
            for alloc in self.facts.by(u.UtilityAllocation, "distribution_id", dist.id):
                for resp in self.facts.by(
                    u.UtilityResponsibility, "allocation_id", alloc.id
                ):
                    if not self.matches(
                        rev.currency,
                        resp.person_id,
                        alloc.unit_id,
                        resp.contract_id,
                        supply.type_id,
                        state=self.filters.state,
                    ):
                        continue
                    if self.filters.state and self.filters.state not in {
                        "active",
                        "finished",
                        "draft",
                        "cancelled",
                    }:
                        link = self.facts.get(f.FinanceUtilityLink, resp.id)
                        imported = self.facts.get(f.FinanceUtilityImport, dist.id)
                        if (
                            not link
                            or not imported
                            or not self.known(imported.operation_id)
                            or link.obligation_id
                            not in {o["id"] for o in self.obligations}
                        ):
                            continue
                    if resp.contract_id:
                        occupant += resp.amount
                    else:
                        owner += resp.amount
                    lines.append(
                        dict(
                            unit_id=alloc.unit_id,
                            contract_id=resp.contract_id,
                            person_id=resp.person_id,
                            person=self.person(resp.person_id),
                            amount=resp.amount,
                        )
                    )
            if not lines:
                continue
            if closed_in_period:
                self.add(
                    supply.property_id,
                    rev.currency,
                    "owner_service_responsibility",
                    owner,
                )
                self.add(
                    supply.property_id,
                    rev.currency,
                    "occupant_service_responsibility",
                    occupant,
                )
            debts = [o for o in self.obligations if o["receipt_id"] == rid]
            # El recibo y pago al proveedor son totales del documento, no una
            # atribución del gasto completo al cuarto/persona filtrados.
            costs = []
            for expense in self.facts.by(f.FinanceExpense, "receipt_id", rid):
                if (
                    not self.known(expense.operation_id)
                    or expense.recorded_on > self.cut
                ):
                    continue
                adjustments = [
                    x
                    for x in self.facts.by(
                        f.FinanceExpenseAdjustment, "expense_id", expense.id
                    )
                    if self.known(x.operation_id)
                ]
                payments = [
                    self.moves[x.movement_id]
                    for x in self.facts.by(
                        f.FinanceDisbursement, "expense_id", expense.id
                    )
                    if self.move_active(self.moves.get(x.movement_id))
                ]
                voided = self.known(expense.void_operation_id)
                total, paid, balance = expense_measure(
                    expense.original_amount, voided, adjustments, payments
                )
                costs.append(
                    dict(
                        total=total,
                        applied=paid,
                        pending=balance,
                        state="voided" if voided else "registered",
                    )
                )
            paid = sum((e["applied"] for e in costs), ZERO)
            recovered = ZERO
            direct = ZERO
            for debt in debts:
                for app in self.apps_by_debt[debt["id"]]:
                    move = self.moves[app.source_movement_id]
                    link = self.facts.get(f.FinanceDisbursement, move.id)
                    if link and link.is_direct:
                        direct += app.amount
                    else:
                        recovered += app.amount
            pending = sum((o["pending"] for o in debts), ZERO)
            # No se atribuye una recuperación a un propietario por su participación.
            reimbursement = None
            if costs and all(
                e["pending"] == 0 and e["state"] != "voided" for e in costs
            ):
                reimbursement = pending
                self.add(
                    supply.property_id, rev.currency, "recoveries_pending", pending
                )
            elif pending:
                self.unknown_recoveries.add(rev.currency)
                self.unknown_recovery_properties.add((supply.property_id, rev.currency))
            if not closed_in_period:
                continue
            imported = self.facts.get(f.FinanceUtilityImport, dist.id)
            self.services.append(
                dict(
                    receipt_id=rid,
                    property_id=supply.property_id,
                    service_type_id=supply.type_id,
                    service=supply.label,
                    distribution_id=dist.id,
                    period_start=rev.period_start,
                    period_end=rev.period_end,
                    due_on=rev.due_on,
                    currency=rev.currency,
                    amount=rev.amount,
                    owner_responsibility=owner,
                    occupant_responsibility=occupant,
                    provider_paid=paid,
                    recovered=recovered,
                    direct_paid=direct,
                    pending=pending,
                    reimbursement_pending=reimbursement,
                    pending_financial_import=not (
                        imported and self.known(imported.operation_id)
                    ),
                    responsibilities=lines,
                )
            )

    def summaries(self):
        return [
            dict(
                currency=currency,
                **{
                    **values,
                    "recoveries_pending": (
                        None
                        if currency in self.unknown_recoveries
                        else values["recoveries_pending"]
                    ),
                },
            )
            for currency, values in sorted(self.groups.items())
        ]
