"""Lecturas masivas autorizadas. Sin JOIN multiplicadores ni consultas por fila."""

from collections import defaultdict
from contextlib import contextmanager
from sqlalchemy import select, or_
from fastapi import HTTPException
from app.models import finances as f, anticreticos as a, utilities as u
from app.models.entities import Person, Unit, PropertyOwner
from app.models.tenancy import Contract, ContractOwner, ContractOccupant, Reservation
from app.services.registry import visible_properties
from app.services.tenancy import lock_property


def scope_properties(db, user, filters):
    properties = list(db.scalars(visible_properties(db, user).order_by("id")))
    permitted = {p.id for p in properties}
    if filters.property_id and filters.property_id not in permitted:
        raise HTTPException(404, "No tiene permiso para consultar esta propiedad.")
    ids = {filters.property_id} if filters.property_id else permitted
    owners = list(
        db.scalars(select(PropertyOwner).where(PropertyOwner.property_id.in_(ids)))
    )
    if filters.owner_id:
        owned = {o.property_id for o in owners if o.person_id == filters.owner_id}
        if not owned:
            raise HTTPException(
                404, "No se encontró el propietario en sus propiedades autorizadas."
            )
        ids &= owned
    if filters.unit_id:
        target = db.scalar(
            select(Unit).where(Unit.id == filters.unit_id, Unit.property_id.in_(ids))
        )
        if target is None:
            raise HTTPException(
                404, "No se encontró el cuarto en sus propiedades autorizadas."
            )
        ids &= {target.property_id}
    if filters.contract_id:
        target = db.scalar(
            select(Contract).where(
                Contract.id == filters.contract_id,
                or_(
                    Contract.property_id.in_(ids),
                    Contract.unit_id.in_(
                        select(Unit.id).where(Unit.property_id.in_(ids))
                    ),
                ),
            )
        )
        if target is None:
            raise HTTPException(
                404, "No se encontró el contrato en sus propiedades autorizadas."
            )
        pid = target.property_id or db.scalar(
            select(Unit.property_id).where(Unit.id == target.unit_id)
        )
        ids &= {pid}
    properties = [p for p in properties if p.id in ids]
    return properties, [o for o in owners if o.property_id in ids]


class Facts:
    def __init__(self, db, user, filters):
        self.data = {}
        self.groups = {}
        self.properties, owners = scope_properties(db, user, filters)
        ids = {p.id for p in self.properties}
        # Mismo orden que finanzas/recordatorios, antes de bloquear las fuentes.
        for prop in self.properties:
            lock_property(db, user, prop.id)

        def load(model, condition):
            values = list(
                db.scalars(
                    select(model)
                    .where(condition)
                    .order_by(*model.__table__.primary_key)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            )
            self.data[model] = values
            return values

        self.data[PropertyOwner] = [o for o in owners if o.property_id in ids]
        units = load(Unit, Unit.property_id.in_(ids))
        unit_ids = {x.id for x in units}
        contracts = load(
            Contract, or_(Contract.property_id.in_(ids), Contract.unit_id.in_(unit_ids))
        )
        cids = {x.id for x in contracts}
        for field, valid in [(filters.unit_id, unit_ids), (filters.contract_id, cids)]:
            if field and field not in valid:
                raise HTTPException(
                    404, "No se encontró el registro en sus propiedades autorizadas."
                )
        if filters.unit_id and filters.contract_id:
            c = next(c for c in contracts if c.id == filters.contract_id)
            if c.unit_id != filters.unit_id:
                raise HTTPException(
                    422, "El contrato no corresponde al cuarto seleccionado."
                )
        load(ContractOwner, ContractOwner.contract_id.in_(cids))
        load(ContractOccupant, ContractOccupant.contract_id.in_(cids))
        load(
            Reservation,
            or_(Reservation.property_id.in_(ids), Reservation.unit_id.in_(unit_ids)),
        )
        accounts = load(f.FinanceAccount, f.FinanceAccount.property_id.in_(ids))
        aids = {x.id for x in accounts}
        ops = load(f.FinanceOperation, f.FinanceOperation.property_id.in_(ids))
        opids = {x.id for x in ops}
        obligations = load(
            f.FinanceObligation, f.FinanceObligation.account_id.in_(aids)
        )
        oids = {x.id for x in obligations}
        expenses = load(f.FinanceExpense, f.FinanceExpense.account_id.in_(aids))
        eids = {x.id for x in expenses}
        moves = load(f.FinanceMovement, f.FinanceMovement.operation_id.in_(opids))
        mids = {x.id for x in moves}
        load(f.FinanceAdjustment, f.FinanceAdjustment.obligation_id.in_(oids))
        load(
            f.FinanceExpenseAdjustment, f.FinanceExpenseAdjustment.expense_id.in_(eids)
        )
        load(f.FinanceApplication, f.FinanceApplication.obligation_id.in_(oids))
        for model in [
            f.FinanceIncoming,
            f.FinanceGuarantee,
            f.FinanceDisbursement,
            f.FinanceRefund,
        ]:
            load(model, model.movement_id.in_(mids))
        load(a.AnticreticoTerms, a.AnticreticoTerms.contract_id.in_(cids))
        revs = load(a.AnticreticoRevision, a.AnticreticoRevision.contract_id.in_(cids))
        rids = {x.id for x in revs}
        for model in [
            a.AnticreticoHolder,
            a.AnticreticoResponsible,
            a.AnticreticoMovement,
            a.AnticreticoAdjustment,
        ]:
            load(model, model.revision_id.in_(rids))
        load(a.AnticreticoAllocation, a.AnticreticoAllocation.movement_id.in_(mids))
        adids = {x.id for x in self.data[a.AnticreticoAdjustment]}
        load(
            a.AnticreticoAdjustmentLine,
            a.AnticreticoAdjustmentLine.adjustment_id.in_(adids),
        )
        supplies = load(u.ServiceAccount, u.ServiceAccount.property_id.in_(ids))
        sids = {x.id for x in supplies}
        receipts = load(u.UtilityReceipt, u.UtilityReceipt.account_id.in_(sids))
        receipts_ids = {x.id for x in receipts}
        revs = load(
            u.UtilityReceiptRevision,
            u.UtilityReceiptRevision.receipt_id.in_(receipts_ids),
        )
        rids = {x.id for x in revs}
        dists = load(
            u.UtilityDistribution, u.UtilityDistribution.receipt_revision_id.in_(rids)
        )
        dids = {x.id for x in dists}
        allocs = load(
            u.UtilityAllocation, u.UtilityAllocation.distribution_id.in_(dids)
        )
        alids = {x.id for x in allocs}
        responsibilities = load(
            u.UtilityResponsibility, u.UtilityResponsibility.allocation_id.in_(alids)
        )
        respids = {x.id for x in responsibilities}
        load(f.FinanceUtilityLink, f.FinanceUtilityLink.responsibility_id.in_(respids))
        load(f.FinanceUtilityImport, f.FinanceUtilityImport.distribution_id.in_(dids))
        for model in [f.FinanceCategory, f.FinanceMethod, u.UtilityType]:
            load(model, model.id > 0)
        # Solo identidades referenciadas en el ámbito; sin documentos/contactos en la respuesta.
        pids = set()
        for values in self.data.values():
            for obj in values:
                for field in [
                    "person_id",
                    "payer_id",
                    "beneficiary_person_id",
                    "responsible_person_id",
                    "holder_id",
                    "responsible_id",
                ]:
                    value = getattr(obj, field, None)
                    if value:
                        pids.add(value)
        load(Person, Person.id.in_(pids))
        self.lookups = {}
        for model, values in self.data.items():
            keys = list(model.__table__.primary_key)
            if len(keys) == 1:
                self.lookups[model] = {getattr(v, keys[0].name): v for v in values}

    def all(self, model):
        return self.data.get(model, [])

    def get(self, model, key):
        return self.lookups.get(model, {}).get(key)

    def by(self, model, field, key):
        index_key = (model, field)
        if index_key not in self.groups:
            group = defaultdict(list)
            for row in self.all(model):
                group[getattr(row, field)].append(row)
            self.groups[index_key] = group
        return self.groups[index_key].get(key, [])


@contextmanager
def locked_read_cache(db, facts):
    """Reutiliza solo hechos leídos con FOR UPDATE en esta misma transacción.

    Exclusivo del contador de atención; no hay caché persistida ni escrituras.
    La salida restaura siempre el contexto de Session.
    """
    previous = db.info.get("phase7_locked_facts")
    db.info["phase7_locked_facts"] = facts
    try:
        yield
    finally:
        if previous is None:
            db.info.pop("phase7_locked_facts", None)
        else:
            db.info["phase7_locked_facts"] = previous
