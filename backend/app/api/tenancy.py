import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import AuditEvent, Person, Property, User
from app.models.tenancy import Contract, PropertyContact, Reservation
from app.schemas.tenancy import (
    ContactInput,
    ContactLink,
    ContractAction,
    ContractInput,
    ContractPatch,
    ReservationAction,
    ReservationInput,
    ReservationPatch,
)
from app.services import tenancy as service
from app.services.registry import ADMIN, person_dict, record_audit

router = APIRouter(tags=["Contratos, reservas y disponibilidad"])


@router.get("/contracts")
def contracts(
    property_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    query = service.scope(select(Contract), Contract, db, user)
    if property_id is not None:
        service.read_property(db, user, property_id)
        query = query.where(service.target_filter(Contract, property_id, None))
    return [
        service.contract_dict(db, obj)
        for obj in db.scalars(
            query.order_by(Contract.start_date.desc(), Contract.id.desc())
        )
    ]


@router.post("/contracts", status_code=201)
def create_contract(
    data: ContractInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.contract_dict(db, service.create_contract(db, user, data))


@router.get("/contracts/{contract_id}")
def contract(
    contract_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return service.contract_dict(db, service.find_contract(db, user, contract_id))


@router.patch("/contracts/{contract_id}")
def update_contract(
    contract_id: int,
    data: ContractPatch,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.contract_dict(
        db, service.update_contract(db, user, contract_id, data)
    )


@router.post("/contracts/{contract_id}/actions")
def contract_action(
    contract_id: int,
    data: ContractAction,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.contract_dict(
        db, service.contract_action(db, user, contract_id, data)
    )


@router.get("/contracts/{contract_id}/history")
def contract_history(
    contract_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    service.find_contract(db, user, contract_id)
    return history(db, "contracts", contract_id)


def history(db, kind, id):
    query = (
        select(AuditEvent)
        .where(AuditEvent.entity_type == kind, AuditEvent.entity_id == id)
        .order_by(AuditEvent.id)
    )
    return [
        {
            "id": event.id,
            "action": event.action,
            "created_at": event.created_at.isoformat(),
            "actor_id": event.actor_id,
            "details": json.loads(event.details),
        }
        for event in db.scalars(query)
    ]


@router.get("/reservations")
def reservations(
    property_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    query = service.scope(select(Reservation), Reservation, db, user)
    if property_id is not None:
        service.read_property(db, user, property_id)
        query = query.where(service.target_filter(Reservation, property_id, None))
    return [
        service.reservation_dict(db, obj)
        for obj in db.scalars(
            query.order_by(Reservation.start_date.desc(), Reservation.id.desc())
        )
    ]


@router.post("/reservations", status_code=201)
def create_reservation(
    data: ReservationInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.reservation_dict(db, service.create_reservation(db, user, data))


@router.get("/reservations/{reservation_id}")
def reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.reservation_dict(
        db, service.find_reservation(db, user, reservation_id)
    )


@router.patch("/reservations/{reservation_id}")
def update_reservation(
    reservation_id: int,
    data: ReservationPatch,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.reservation_dict(
        db, service.update_reservation(db, user, reservation_id, data)
    )


@router.post("/reservations/{reservation_id}/actions")
def reservation_action(
    reservation_id: int,
    data: ReservationAction,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.reservation_dict(
        db, service.reservation_action(db, user, reservation_id, data)
    )


@router.post("/reservations/{reservation_id}/convert", status_code=201)
def convert_reservation(
    reservation_id: int,
    data: ContractInput,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    obj, created = service.convert_reservation(db, user, reservation_id, data)
    response.status_code = 201 if created else 200
    return service.contract_dict(db, obj)


@router.get("/reservations/{reservation_id}/history")
def reservation_history(
    reservation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    service.find_reservation(db, user, reservation_id)
    return history(db, "reservations", reservation_id)


@router.get("/properties/{property_id}/contacts")
def contacts(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return service.contacts(db, user, property_id)


@router.post("/properties/{property_id}/contacts", status_code=201)
def create_contact(
    property_id: int,
    data: ContactInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    service.manage(user)
    service.lock_property(db, user, property_id)
    person = Person(**data.model_dump())
    db.add(person)
    record_audit(db, user, "create", person, list(data.model_fields_set))
    db.add(PropertyContact(property_id=property_id, person_id=person.id))
    service.commit(db)
    return person_dict(person)


@router.post("/properties/{property_id}/contacts/link")
def link_contact(
    property_id: int,
    data: ContactLink,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    service.manage(user)
    service.lock_property(db, user, property_id)
    person = db.get(Person, data.person_id)
    if person is None:
        raise HTTPException(404, "No se encontró la persona.")
    if user.role != ADMIN:
        visible = set()
        from app.services.registry import visible_properties

        for id in db.scalars(
            visible_properties(db, user).with_only_columns(Property.id)
        ):
            visible.update(db.scalars(service.contact_ids(db, id)))
        if person.id not in visible:
            raise HTTPException(
                403, "Solicite al administrador general la vinculación de esta persona."
            )
    if db.get(PropertyContact, (property_id, person.id)) is None:
        db.add(PropertyContact(property_id=property_id, person_id=person.id))
        db.add(
            AuditEvent(
                actor_id=user.id,
                action="link_contact",
                entity_type="property_contacts",
                entity_id=property_id,
                details=json.dumps(
                    {"property_id": property_id, "person_id": person.id}
                ),
            )
        )
        service.commit(db)
    return person_dict(person)


@router.get("/properties/{property_id}/availability")
def availability(
    property_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    start = start or service.today()
    end = end or start
    if end < start:
        raise HTTPException(422, "La salida no puede ser anterior a la entrada.")
    return service.availability(db, user, property_id, start, end)


@router.get("/properties/{property_id}/occupancy")
def occupancy(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    service.read_property(db, user, property_id)
    query = select(Contract).where(
        service.target_filter(Contract, property_id, None),
        Contract.status.in_(["active", "finished"]),
    )
    values = []
    for obj in db.scalars(query.order_by(Contract.start_date.desc())):
        result = service.contract_dict(db, obj)
        result["current"] = (
            obj.start_date <= service.today() <= (obj.actual_end_date or obj.end_date)
        )
        # Personas anteriores se conservan en los eventos, además de las vigentes.
        result["history"] = history(db, "contracts", obj.id)
        values.append(result)
    return values
