"""Disponibilidad inclusiva y escrituras serializadas por propiedad.

Los SELECT críticos son lecturas actuales (FOR UPDATE). No reutilizar una
lectura de snapshot tras esperar el bloqueo: MySQL usa REPEATABLE READ.
"""

import json
from datetime import date
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, or_, select, union
from sqlalchemy.orm import Session

from app.core.clock import utc_now
from app.models.entities import AuditEvent, Person, Property, PropertyOwner, Unit, User
from app.models.tenancy import (
    Contract,
    ContractOccupant,
    ContractOwner,
    PropertyContact,
    Reservation,
)
from app.schemas.tenancy import ContractInput, ReservationInput
from app.services.periods import periods
from app.services.registry import ADMIN, person_dict, visible_properties


def today():
    return (
        utc_now()
        .replace(tzinfo=ZoneInfo("UTC"))
        .astimezone(ZoneInfo("America/La_Paz"))
        .date()
    )


def manage(user, contracts=False, active=False):
    allowed = (
        {ADMIN, "property_admin"} if active else {ADMIN, "property_admin", "operator"}
    )
    if user.role not in allowed:
        raise HTTPException(403, "No tiene permiso para realizar esta operación.")


def target_property(db, property_id, unit_id):
    if property_id is not None:
        return property_id
    result = db.scalar(select(Unit.property_id).where(Unit.id == unit_id))
    if result is None:
        raise HTTPException(404, "No se encontró la casa o el cuarto solicitado.")
    return result


def scope(query, model, db, user):
    ids = visible_properties(db, user).with_only_columns(Property.id)
    units = select(Unit.id).where(Unit.property_id.in_(ids))
    return query.where(or_(model.property_id.in_(ids), model.unit_id.in_(units)))


def lock_property(db, user, property_id):
    query = (
        visible_properties(db, user)
        .where(Property.id == property_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    prop = db.scalar(query)
    if prop is None:
        raise HTTPException(404, "No se encontró la propiedad o no tiene acceso.")
    return prop


def read_property(db, user, property_id):
    prop = db.scalar(visible_properties(db, user).where(Property.id == property_id))
    if prop is None:
        raise HTTPException(404, "No se encontró la propiedad o no tiene acceso.")
    return prop


def target_filter(model, property_id, unit_id):
    if unit_id is not None:
        return or_(model.property_id == property_id, model.unit_id == unit_id)
    units = select(Unit.id).where(Unit.property_id == property_id)
    return or_(model.property_id == property_id, model.unit_id.in_(units))


def effective_reservation_status(obj):
    if (
        obj.status in {"pending", "confirmed"}
        and obj.expires_at is not None
        and obj.expires_at <= utc_now()
    ):
        return "expired"
    return obj.status


def blockers(
    db,
    property_id,
    unit_id,
    start,
    end,
    exclude_contract=None,
    exclude_reservation=None,
    locked=False,
):
    contracts = select(Contract).where(
        target_filter(Contract, property_id, unit_id),
        Contract.status.in_(["active", "finished"]),
        Contract.start_date <= end,
        func.coalesce(Contract.actual_end_date, Contract.end_date) >= start,
    )
    reservations = select(Reservation).where(
        target_filter(Reservation, property_id, unit_id),
        Reservation.status.in_(["pending", "confirmed"]),
        Reservation.start_date <= end,
        Reservation.end_date >= start,
        or_(Reservation.expires_at.is_(None), Reservation.expires_at > utc_now()),
    )
    if exclude_contract is not None:
        contracts = contracts.where(Contract.id != exclude_contract)
    if exclude_reservation is not None:
        reservations = reservations.where(Reservation.id != exclude_reservation)
    if locked:
        contracts = contracts.with_for_update().execution_options(
            populate_existing=True
        )
        reservations = reservations.with_for_update().execution_options(
            populate_existing=True
        )
    result = []
    for obj in db.scalars(contracts):
        result.append(
            {
                "kind": "contract",
                "id": obj.id,
                "start_date": obj.start_date.isoformat(),
                "end_date": (obj.actual_end_date or obj.end_date).isoformat(),
                "reason": f"Contrato {obj.id}: del {obj.start_date} al {obj.actual_end_date or obj.end_date}.",
            }
        )
    for obj in db.scalars(reservations):
        result.append(
            {
                "kind": "reservation",
                "id": obj.id,
                "start_date": obj.start_date.isoformat(),
                "end_date": obj.end_date.isoformat(),
                "reason": f"Reserva {obj.id}: del {obj.start_date} al {obj.end_date}.",
            }
        )
    return result


def resource_state(db, prop, unit_id, locked=False):
    if not prop.is_active:
        return "disabled", "La propiedad está deshabilitada."
    query = select(Unit).where(Unit.property_id == prop.id)
    if unit_id is not None:
        query = query.where(Unit.id == unit_id)
    if locked:
        query = query.with_for_update().execution_options(populate_existing=True)
    units = list(db.scalars(query))
    if unit_id is not None and not units:
        raise HTTPException(404, "El cuarto no pertenece a esta propiedad.")
    if any(not unit.is_enabled for unit in units):
        return "disabled", (
            "El cuarto está deshabilitado."
            if unit_id
            else "La casa completa incluye unidades deshabilitadas."
        )
    if any(unit.maintenance for unit in units):
        return "maintenance", (
            "El cuarto está en mantenimiento."
            if unit_id
            else "La casa completa incluye unidades en mantenimiento."
        )
    return None, None


def require_available(
    db, prop, unit_id, start, end, exclude_contract=None, exclude_reservation=None
):
    state, reason = resource_state(db, prop, unit_id, locked=True)
    if state:
        raise HTTPException(409, reason)
    conflicts = blockers(
        db,
        prop.id,
        unit_id,
        start,
        end,
        exclude_contract,
        exclude_reservation,
        locked=True,
    )
    if conflicts:
        raise HTTPException(
            409,
            "El periodo no está disponible. "
            + conflicts[0]["reason"]
            + " La entrada y la salida están incluidas.",
        )


def contact_ids(db, property_id):
    unit_ids = select(Unit.id).where(Unit.property_id == property_id)
    contract_ids = select(Contract.id).where(
        or_(Contract.property_id == property_id, Contract.unit_id.in_(unit_ids))
    )
    return union(
        select(PropertyContact.person_id).where(
            PropertyContact.property_id == property_id
        ),
        select(PropertyOwner.person_id).where(PropertyOwner.property_id == property_id),
        select(Contract.responsible_person_id).where(Contract.id.in_(contract_ids)),
        select(ContractOccupant.person_id).where(
            ContractOccupant.contract_id.in_(contract_ids)
        ),
        select(ContractOwner.person_id).where(
            ContractOwner.contract_id.in_(contract_ids)
        ),
        select(Reservation.person_id).where(
            or_(
                Reservation.property_id == property_id,
                Reservation.unit_id.in_(unit_ids),
            )
        ),
    )


def contacts(db, user, property_id):
    read_property(db, user, property_id)
    return [
        person_dict(p)
        for p in db.scalars(
            select(Person)
            .where(Person.id.in_(contact_ids(db, property_id)))
            .order_by(Person.full_name, Person.id)
        )
    ]


def validate_people(db, user, property_id, ids):
    found = set(db.scalars(select(Person.id).where(Person.id.in_(ids))))
    if found != set(ids):
        raise HTTPException(
            422, "Seleccione personas existentes para el responsable y los ocupantes."
        )
    if user.role != ADMIN and not set(ids).issubset(
        set(db.scalars(contact_ids(db, property_id)))
    ):
        raise HTTPException(
            403,
            "Seleccione personas registradas para esta propiedad. Puede registrarlas desde este formulario o solicitar su vinculación al administrador general.",
        )


def retain_contacts(db, property_id, ids):
    for id in ids:
        if db.get(PropertyContact, (property_id, id)) is None:
            db.add(PropertyContact(property_id=property_id, person_id=id))


def data_snapshot(obj):
    data = {column.name: getattr(obj, column.name) for column in obj.__table__.columns}
    if isinstance(obj, Contract):
        data["occupant_ids"] = sorted(p.person_id for p in obj.occupants)
        data["owners"] = [
            {
                "person_id": p.person_id,
                "share": str(p.share) if p.share is not None else None,
            }
            for p in obj.owners
        ]
    return data


def event(db, user, obj, action, before=None, reason=None):
    db.flush()
    db.add(
        AuditEvent(
            actor_id=user.id,
            action=action,
            entity_type=obj.__tablename__,
            entity_id=obj.id,
            details=json.dumps(
                {"before": before, "after": data_snapshot(obj), "reason": reason},
                default=str,
                ensure_ascii=False,
            ),
        )
    )


def commit(db):
    db.commit()


def capture_owners(db, obj, property_id):
    if not obj.owners:
        owners = list(
            db.scalars(
                select(PropertyOwner)
                .where(PropertyOwner.property_id == property_id)
                .with_for_update()
            )
        )
        if not owners:
            raise HTTPException(
                409,
                "La propiedad debe tener al menos un propietario antes de activar el contrato.",
            )
        obj.owners.extend(
            ContractOwner(person_id=p.person_id, share=p.share) for p in owners
        )
        retain_contacts(db, property_id, [p.person_id for p in owners])


def set_owner_parties(db, user, obj, property_id, parties):
    """Firmantes del contrato, que pueden ser distintos de los titulares actuales."""
    if parties is None:
        capture_owners(db, obj, property_id)
        return
    ids = [p.person_id for p in parties]
    validate_people(db, user, property_id, ids)
    if any(not db.get(Person, id).is_owner for id in ids):
        raise HTTPException(
            422, "Seleccione personas registradas como propietarias para los firmantes."
        )
    obj.owners.clear()
    db.flush()
    obj.owners.extend(
        ContractOwner(person_id=p.person_id, share=p.share) for p in parties
    )
    retain_contacts(db, property_id, ids)


def contract_dict(db, obj):
    data = data_snapshot(obj)
    for key in (
        "start_date",
        "end_date",
        "actual_end_date",
        "created_at",
        "updated_at",
    ):
        data[key] = data[key].isoformat() if data[key] else None
    data["price"] = str(obj.price) if obj.price is not None else None
    data["resolved_property_id"] = target_property(db, obj.property_id, obj.unit_id)
    unit = db.get(Unit, obj.unit_id) if obj.unit_id is not None else None
    data["target_label"] = f"{unit.code} · {unit.name}" if unit else "Casa completa"
    data["periods"] = periods(obj)
    data["owner_parties"] = data["owners"]
    data["allows_service_charges"] = obj.mode != "daily" and not obj.services_included
    return data


def reservation_dict(db, obj):
    data = data_snapshot(obj)
    for key in ("start_date", "end_date", "expires_at", "created_at", "updated_at"):
        data[key] = data[key].isoformat() if data[key] else None
    data["effective_status"] = effective_reservation_status(obj)
    data["resolved_property_id"] = target_property(db, obj.property_id, obj.unit_id)
    unit = db.get(Unit, obj.unit_id) if obj.unit_id is not None else None
    data["target_label"] = f"{unit.code} · {unit.name}" if unit else "Casa completa"
    return data


def find_contract(db, user, id):
    obj = db.scalar(
        scope(select(Contract).where(Contract.id == id), Contract, db, user)
    )
    if obj is None:
        raise HTTPException(404, "No se encontró el contrato o no tiene acceso.")
    return obj


def find_reservation(db, user, id):
    obj = db.scalar(
        scope(select(Reservation).where(Reservation.id == id), Reservation, db, user)
    )
    if obj is None:
        raise HTTPException(404, "No se encontró la reserva o no tiene acceso.")
    return obj


def check_version(obj, expected):
    if expected is not None and expected != obj.version:
        raise HTTPException(
            409,
            "El registro cambió mientras lo revisaba. Vuelva a cargarlo antes de guardar.",
        )


def create_contract(db, user, data, source=None, do_commit=True):
    manage(user, active=data.status == "active")
    prop_id = target_property(db, data.property_id, data.unit_id)
    prop = lock_property(db, user, prop_id)
    validate_people(db, user, prop_id, [data.responsible_person_id] + data.occupant_ids)
    if data.status == "active":
        require_available(
            db,
            prop,
            data.unit_id,
            data.start_date,
            data.end_date,
            exclude_reservation=source,
        )
    if (
        data.status == "active"
        and data.start_date < today()
        and data.owner_parties is None
    ):
        raise HTTPException(
            422,
            "Indique expresamente los propietarios firmantes al registrar un contrato de fechas pasadas.",
        )
    obj = Contract(
        **data.model_dump(
            exclude={"occupant_ids", "owner_parties", "expected_version"}
        ),
        source_reservation_id=source,
        version=1,
    )
    obj.occupants = [ContractOccupant(person_id=id) for id in data.occupant_ids]
    db.add(obj)
    retain_contacts(db, prop_id, [data.responsible_person_id] + data.occupant_ids)
    set_owner_parties(db, user, obj, prop_id, data.owner_parties)
    event(db, user, obj, "create")
    if do_commit:
        commit(db)
    return obj


def update_contract(db, user, id, patch):
    initial = find_contract(db, user, id)
    prop_id = target_property(db, initial.property_id, initial.unit_id)
    prop = lock_property(db, user, prop_id)
    obj = db.scalar(
        select(Contract)
        .where(Contract.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    manage(user, active=obj.status != "draft")
    if obj.status not in {"draft", "active"}:
        raise HTTPException(
            409,
            "Un contrato finalizado o cancelado conserva su historial y no se modifica.",
        )
    values = patch.model_dump(exclude_unset=True)
    check_version(obj, values.get("expected_version"))
    if "status" in values and values["status"] != obj.status:
        raise HTTPException(
            422,
            "Use las acciones de activar, finalizar o cancelar para cambiar el estado.",
        )
    merged = {
        key: value
        for key, value in contract_dict(db, obj).items()
        if key in ContractInput.model_fields
    }
    merged.update(values)
    try:
        data = ContractInput.model_validate(merged)
    except ValidationError as error:
        raise HTTPException(422, validation_message(error)) from None
    from app.models.anticreticos import AnticreticoTerms

    capital_terms = db.scalar(
        select(AnticreticoTerms)
        .where(AnticreticoTerms.contract_id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if capital_terms and (data.mode, data.currency, data.property_id, data.unit_id) != (
        obj.mode,
        obj.currency,
        obj.property_id,
        obj.unit_id,
    ):
        raise HTTPException(
            409,
            "El anticrético tiene condiciones económicas históricas. Conserve su modalidad, moneda y espacio; registre otro contrato para cambiarlos.",
        )
    if target_property(db, data.property_id, data.unit_id) != prop_id:
        raise HTTPException(
            422,
            "La casa de un contrato registrado no se cambia. Cree un contrato nuevo para otra propiedad.",
        )
    validate_people(db, user, prop_id, [data.responsible_person_id] + data.occupant_ids)
    if obj.status == "active":
        if data.start_date != obj.start_date:
            raise HTTPException(
                422,
                "La fecha de entrada de un contrato vigente se conserva. Corrija el borrador antes de activarlo.",
            )
        if (data.property_id, data.unit_id) != (
            obj.property_id,
            obj.unit_id,
        ) and obj.start_date <= today():
            raise HTTPException(
                409,
                "Para cambiar el espacio de una estancia ya iniciada, finalice este contrato y registre uno nuevo. Se conservará la ocupación anterior.",
            )
        require_available(
            db,
            prop,
            data.unit_id,
            data.start_date,
            data.end_date,
            exclude_contract=obj.id,
        )
    before = data_snapshot(obj)
    if obj.status == "active" and data.owner_parties is not None:
        if {(p.person_id, p.share) for p in data.owner_parties} != {
            (p.person_id, p.share) for p in obj.owners
        }:
            raise HTTPException(
                409,
                "Los propietarios firmantes de un contrato vigente se conservan. Registre un nuevo contrato si cambian las partes.",
            )
    for key, value in data.model_dump(
        exclude={"occupant_ids", "owner_parties", "expected_version"}
    ).items():
        setattr(obj, key, value)
    if obj.status == "draft" and data.owner_parties is not None:
        set_owner_parties(db, user, obj, prop_id, data.owner_parties)
    obj.occupants.clear()
    db.flush()
    obj.occupants.extend(ContractOccupant(person_id=id) for id in data.occupant_ids)
    retain_contacts(db, prop_id, [data.responsible_person_id] + data.occupant_ids)
    obj.version += 1
    event(db, user, obj, "update", before)
    commit(db)
    return obj


def validation_message(error):
    for item in error.errors():
        exception = item.get("ctx", {}).get("error")
        if exception is not None:
            return str(exception)
    return "Revise las fechas, personas, precio y condiciones del formulario."


def contract_action(db, user, id, data):
    initial = find_contract(db, user, id)
    prop_id = target_property(db, initial.property_id, initial.unit_id)
    prop = lock_property(db, user, prop_id)
    obj = db.scalar(
        select(Contract)
        .where(Contract.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    manage(user, active=not (data.action == "cancel" and obj.status == "draft"))
    check_version(obj, data.expected_version)
    before = data_snapshot(obj)
    if data.action == "activate":
        if obj.status != "draft" or obj.mode == "mixed":
            raise HTTPException(
                409,
                "Solo se activan borradores con una modalidad validada; los mixtos requieren revisión futura.",
            )
        require_available(db, prop, obj.unit_id, obj.start_date, obj.end_date)
        capture_owners(db, obj, prop_id)
        obj.status = "active"
    elif data.action == "finish":
        actual = data.end_date or min(today(), obj.end_date)
        if (
            obj.status != "active"
            or actual < obj.start_date
            or actual > obj.end_date
            or actual > today()
        ):
            raise HTTPException(
                409,
                "Solo se finaliza un contrato vigente, con una fecha real entre su entrada y la fecha de hoy.",
            )
        obj.status, obj.actual_end_date = "finished", actual
    elif data.action == "cancel":
        if obj.status not in {"draft", "active"} or (
            obj.status == "active" and obj.start_date <= today()
        ):
            raise HTTPException(
                409,
                "Un contrato que ya comenzó debe finalizarse para conservar su ocupación histórica.",
            )
        obj.status = "cancelled"
    elif data.action == "extend":
        if (
            obj.status != "active"
            or data.end_date is None
            or data.end_date <= obj.end_date
        ):
            raise HTTPException(
                422,
                "La prórroga requiere un contrato vigente y una salida posterior a la acordada.",
            )
        check = {
            key: value
            for key, value in contract_dict(db, obj).items()
            if key in ContractInput.model_fields
        }
        check["end_date"] = data.end_date
        try:
            ContractInput.model_validate(check)
        except ValidationError as error:
            raise HTTPException(422, validation_message(error)) from None
        require_available(
            db,
            prop,
            obj.unit_id,
            obj.start_date,
            data.end_date,
            exclude_contract=obj.id,
        )
        obj.end_date = data.end_date
    obj.version += 1
    event(db, user, obj, data.action, before, data.reason)
    commit(db)
    return obj


def create_reservation(db, user, data):
    manage(user)
    prop_id = target_property(db, data.property_id, data.unit_id)
    prop = lock_property(db, user, prop_id)
    validate_people(db, user, prop_id, [data.person_id])
    if data.expires_at is not None and data.expires_at <= utc_now():
        raise HTTPException(
            422, "El vencimiento de la reserva debe estar en el futuro."
        )
    require_available(db, prop, data.unit_id, data.start_date, data.end_date)
    obj = Reservation(**data.model_dump(exclude={"expected_version"}), version=1)
    db.add(obj)
    event(db, user, obj, "create")
    commit(db)
    return obj


def update_reservation(db, user, id, patch):
    manage(user)
    initial = find_reservation(db, user, id)
    prop_id = target_property(db, initial.property_id, initial.unit_id)
    prop = lock_property(db, user, prop_id)
    obj = db.scalar(
        select(Reservation)
        .where(Reservation.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    check_version(obj, patch.expected_version)
    if effective_reservation_status(obj) not in {"pending", "confirmed"}:
        raise HTTPException(
            409,
            "Solo se modifican reservas activas; se conserva el historial de las demás.",
        )
    merged = {
        key: value
        for key, value in data_snapshot(obj).items()
        if key in ReservationInput.model_fields
    }
    values = patch.model_dump(exclude_unset=True)
    if "status" in values and values["status"] != obj.status:
        raise HTTPException(
            422, "Use la acción confirmar o cancelar para cambiar el estado."
        )
    merged.update(values)
    try:
        data = ReservationInput.model_validate(merged)
    except ValidationError as error:
        raise HTTPException(422, validation_message(error)) from None
    if target_property(db, data.property_id, data.unit_id) != prop_id:
        raise HTTPException(
            422, "La casa de la reserva no se cambia; cancele y registre otra reserva."
        )
    if data.expires_at is not None and data.expires_at <= utc_now():
        raise HTTPException(422, "El vencimiento debe estar en el futuro.")
    validate_people(db, user, prop_id, [data.person_id])
    require_available(
        db,
        prop,
        data.unit_id,
        data.start_date,
        data.end_date,
        exclude_reservation=obj.id,
    )
    before = data_snapshot(obj)
    for key, value in data.model_dump(exclude={"expected_version"}).items():
        setattr(obj, key, value)
    obj.version += 1
    event(db, user, obj, "update", before)
    commit(db)
    return obj


def reservation_action(db, user, id, data):
    manage(user)
    initial = find_reservation(db, user, id)
    prop_id = target_property(db, initial.property_id, initial.unit_id)
    prop = lock_property(db, user, prop_id)
    obj = db.scalar(
        select(Reservation)
        .where(Reservation.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    check_version(obj, data.expected_version)
    before = data_snapshot(obj)
    status = effective_reservation_status(obj)
    if data.action == "confirm":
        if status != "pending":
            raise HTTPException(
                409, "Solo se confirma una reserva pendiente y no vencida."
            )
        require_available(
            db,
            prop,
            obj.unit_id,
            obj.start_date,
            obj.end_date,
            exclude_reservation=obj.id,
        )
        obj.status = "confirmed"
    elif data.action == "cancel":
        if status not in {"pending", "confirmed"}:
            raise HTTPException(409, "La reserva ya no está activa.")
        obj.status = "cancelled"
    elif data.action == "expire":
        if status != "expired" or obj.status not in {"pending", "confirmed"}:
            raise HTTPException(
                409, "Solo se marca vencida una reserva cuyo plazo ya terminó."
            )
        obj.status = "expired"
    obj.version += 1
    event(db, user, obj, data.action, before, data.reason)
    commit(db)
    return obj


def convert_reservation(db, user, id, data):
    manage(user, active=True)
    if data.status != "active":
        raise HTTPException(
            422,
            "La conversión crea un contrato vigente para mantener bloqueada la disponibilidad.",
        )
    initial = find_reservation(db, user, id)
    prop_id = target_property(db, initial.property_id, initial.unit_id)
    lock_property(db, user, prop_id)
    obj = db.scalar(
        select(Reservation)
        .where(Reservation.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    existing = db.scalar(
        select(Contract).where(Contract.source_reservation_id == id).with_for_update()
    )
    if existing is not None:
        return existing, False
    if effective_reservation_status(obj) != "confirmed":
        raise HTTPException(
            409, "Confirme una reserva vigente antes de convertirla en contrato."
        )
    if (
        data.property_id,
        data.unit_id,
        data.start_date,
        data.end_date,
        data.mode,
        data.responsible_person_id,
    ) != (
        obj.property_id,
        obj.unit_id,
        obj.start_date,
        obj.end_date,
        obj.mode,
        obj.person_id,
    ):
        raise HTTPException(
            422,
            "El contrato debe conservar la casa o cuarto, persona, modalidad y fechas de la reserva. Modifique primero la reserva si corresponde.",
        )
    before = data_snapshot(obj)
    # Comprobar recursos y conflictos antes de reemplazar la reserva por la ocupación.
    prop = lock_property(db, user, prop_id)
    require_available(
        db, prop, obj.unit_id, obj.start_date, obj.end_date, exclude_reservation=obj.id
    )
    contract = create_contract(db, user, data, source=obj.id, do_commit=False)
    obj.status, obj.version = "converted", obj.version + 1
    event(db, user, obj, "convert", before, f"Contrato {contract.id}")
    commit(db)
    return contract, True


def availability(db, user, property_id, start, end):
    prop = read_property(db, user, property_id)
    units = list(
        db.scalars(
            select(Unit).where(Unit.property_id == property_id).order_by(Unit.code)
        )
    )

    def item(unit):
        unit_id = unit.id if unit else None
        state, reason = resource_state(db, prop, unit_id)
        conflicts = blockers(db, prop.id, unit_id, start, end)
        if not state:
            state = (
                "occupied"
                if any(c["kind"] == "contract" for c in conflicts)
                else "reserved" if conflicts else "available"
            )
            reason = (
                conflicts[0]["reason"]
                if conflicts
                else "Disponible para las fechas consultadas."
            )
        return {
            "unit_id": unit_id,
            "label": f"{unit.code} · {unit.name}" if unit else "Casa completa",
            "state": state,
            "reason": reason,
            "blockers": conflicts,
        }

    return {
        "property_id": prop.id,
        "property_name": prop.name,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "whole": item(None),
        "units": [item(unit) for unit in units],
    }
