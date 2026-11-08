from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import User
from app.schemas import anticreticos as s
from app.services import anticreticos as service

router = APIRouter(tags=["Anticréticos, capital y restituciones"])


@router.get("/properties/{property_id}/anticreticos")
def listing(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return service.listing(db, user, property_id)


@router.get("/properties/{property_id}/anticreticos/{contract_id}")
def detail(
    property_id: int,
    contract_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.detail(db, user, property_id, contract_id)


@router.post(
    "/properties/{property_id}/anticreticos/{contract_id}/conditions", status_code=201
)
def conditions(
    property_id: int,
    contract_id: int,
    data: s.ConditionsInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.save_conditions(db, user, property_id, contract_id, data)


@router.post(
    "/properties/{property_id}/anticreticos/{contract_id}/deliveries", status_code=201
)
def delivery(
    property_id: int,
    contract_id: int,
    data: s.CapitalCash,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.register_cash(db, user, property_id, contract_id, data, "delivery")


@router.post(
    "/properties/{property_id}/anticreticos/{contract_id}/returns", status_code=201
)
def restitution(
    property_id: int,
    contract_id: int,
    data: s.CapitalCash,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.register_cash(db, user, property_id, contract_id, data, "return")


@router.post(
    "/properties/{property_id}/anticreticos/{contract_id}/adjustments", status_code=201
)
def adjustment(
    property_id: int,
    contract_id: int,
    data: s.CapitalAdjustmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.adjust(db, user, property_id, contract_id, data)


@router.post("/properties/{property_id}/anticreticos/{contract_id}/movements/{id}/void")
def void_cash(
    property_id: int,
    contract_id: int,
    id: int,
    data: s.CapitalReason,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.void_cash(db, user, property_id, contract_id, id, data)


@router.post(
    "/properties/{property_id}/anticreticos/{contract_id}/adjustments/{id}/void"
)
def void_adjustment(
    property_id: int,
    contract_id: int,
    id: int,
    data: s.CapitalReason,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.void_adjustment(db, user, property_id, contract_id, id, data)
