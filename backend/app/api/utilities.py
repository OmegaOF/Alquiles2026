from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import Property, User
from app.models.utilities import (
    UtilityType,
    ServiceAccount,
    UtilityMeter,
    MeterReading,
    UtilityReceipt,
    UtilityReceiptRevision,
    UtilityDistribution,
)
from app.schemas.utilities import (
    TypeInput,
    AccountInput,
    AccountPatch,
    ConfigurationInput,
    MeterInput,
    MeterRetire,
    ReadingInput,
    ReadingCorrection,
    ReceiptInput,
    ReceiptCorrection,
    CalculationInput,
    ResolutionInput,
    ConfirmationInput,
)
from app.services import utilities as service
from app.services import utility_distribution as distribution
from app.services.registry import visible_properties

router = APIRouter(tags=["Servicios básicos, recibos y distribución"])


@router.get("/utility-types")
def types(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [
        service.scalar_dict(t)
        for t in service.rows(db, select(UtilityType).order_by(UtilityType.name))
    ]


@router.post("/utility-types", status_code=201)
def create_type(
    data: TypeInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return service.create_type(db, user, data)


@router.patch("/utility-types/{id}")
def update_type(
    id: int,
    data: TypeInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.create_type(db, user, data, id)


@router.get("/service-accounts")
def accounts(
    property_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    allowed = visible_properties(db, user).with_only_columns(Property.id)
    query = (
        select(ServiceAccount)
        .where(ServiceAccount.property_id.in_(allowed))
        .order_by(ServiceAccount.id)
    )
    if property_id is not None:
        service.read_property(db, user, property_id)
        query = query.where(ServiceAccount.property_id == property_id)
    return [service.account_dict(db, a) for a in service.rows(db, query)]


@router.post("/properties/{id}/service-accounts", status_code=201)
def create_account(
    id: int,
    data: AccountInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.account_dict(db, service.create_account(db, user, id, data))


@router.patch("/service-accounts/{id}")
def update_account(
    id: int,
    data: AccountPatch,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.account_dict(db, service.update_account(db, user, id, data))


@router.get("/service-accounts/{id}/configurations")
def configurations(
    id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    from app.models.utilities import UtilityConfiguration

    service.get_account(db, user, id)
    return [
        service.config_dict(db, c)
        for c in service.rows(
            db,
            select(UtilityConfiguration)
            .where(UtilityConfiguration.account_id == id)
            .order_by(UtilityConfiguration.revision),
        )
    ]


@router.post("/service-accounts/{id}/configurations", status_code=201)
def create_configuration(
    id: int,
    data: ConfigurationInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if data.expected_version is None:
        raise HTTPException(
            422, "Vuelva a cargar el servicio antes de guardar su nueva configuración."
        )
    account = service.get_account(db, user, id, True)
    service.create_configuration(db, user, account, data)
    return service.account_dict(db, account)


@router.get("/service-accounts/{id}/meters")
def meters(id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.get_account(db, user, id)
    return [
        service.meter_dict(db, m)
        for m in service.rows(
            db,
            select(UtilityMeter)
            .where(UtilityMeter.account_id == id)
            .order_by(UtilityMeter.installed_on, UtilityMeter.id),
        )
    ]


@router.post("/service-accounts/{id}/meters", status_code=201)
def create_meter(
    id: int,
    data: MeterInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.meter_dict(db, service.create_meter(db, user, id, data))


@router.post("/utility-meters/{id}/retire")
def retire(
    id: int,
    data: MeterRetire,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.meter_dict(db, service.retire_meter(db, user, id, data))


@router.get("/utility-meters/{id}/readings")
def readings(
    id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    service.meter_context(db, user, id)
    return service.readings_dict(db, id)


@router.post("/utility-meters/{id}/readings", status_code=201)
def create_reading(
    id: int,
    data: ReadingInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.scalar_dict(service.save_reading(db, user, id, data))


@router.patch("/meter-readings/{id}")
def correct_reading(
    id: int,
    data: ReadingCorrection,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    obj = db.get(MeterReading, id)
    if obj is None:
        raise HTTPException(404, "No se encontró la lectura o no tiene acceso.")
    return service.scalar_dict(service.save_reading(db, user, obj.meter_id, data, id))


@router.get("/utility-receipts")
def receipts(
    property_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    allowed = visible_properties(db, user).with_only_columns(Property.id)
    query = (
        select(UtilityReceipt)
        .join(ServiceAccount)
        .where(ServiceAccount.property_id.in_(allowed))
        .order_by(UtilityReceipt.id.desc())
    )
    if property_id is not None:
        service.read_property(db, user, property_id)
        query = query.where(ServiceAccount.property_id == property_id)
    return [service.receipt_dict(db, r) for r in service.rows(db, query)]


@router.post("/service-accounts/{id}/receipts", status_code=201)
def create_receipt(
    id: int,
    data: ReceiptInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.receipt_dict(db, service.create_receipt(db, user, id, data))


@router.get("/utility-receipts/{id}")
def receipt(id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    obj, _ = service.receipt_context(db, user, id)
    return service.receipt_dict(db, obj)


@router.patch("/utility-receipts/{id}")
def correct_receipt(
    id: int,
    data: ReceiptCorrection,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.receipt_dict(db, service.correct_receipt(db, user, id, data))


@router.post("/utility-receipts/{id}/calculate", status_code=201)
def calculate(
    id: int,
    data: CalculationInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return distribution.distribution_dict(
        db, distribution.calculate(db, user, id, data)
    )


@router.get("/utility-receipts/{id}/history")
def history(id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.receipt_context(db, user, id)
    revisions = service.rows(
        db,
        select(UtilityReceiptRevision)
        .where(UtilityReceiptRevision.receipt_id == id)
        .order_by(UtilityReceiptRevision.revision),
    )
    distributions = service.rows(
        db,
        select(UtilityDistribution)
        .where(UtilityDistribution.receipt_revision_id.in_([r.id for r in revisions]))
        .order_by(UtilityDistribution.id),
    )
    return {
        "revisions": [service.scalar_dict(r) for r in revisions],
        "distributions": [distribution.distribution_dict(db, d) for d in distributions],
    }


@router.get("/utility-distributions/{id}")
def detail(id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    obj, _, _ = distribution.dist_context(db, user, id)
    return distribution.distribution_dict(db, obj)


@router.post("/utility-distributions/{id}/resolve")
def resolve(
    id: int,
    data: ResolutionInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return distribution.distribution_dict(db, distribution.resolve(db, user, id, data))


@router.post("/utility-distributions/{id}/confirm")
def confirm(
    id: int,
    data: ConfirmationInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return distribution.distribution_dict(db, distribution.confirm(db, user, id, data))
