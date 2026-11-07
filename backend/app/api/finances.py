from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import User
from app.models import finances as m
from app.schemas import finances as s
from app.services import finances as f
from app.services import utilities as u

router = APIRouter(tags=["Por cobrar, pagos, garantías y gastos"])


@router.get("/finances/catalogs")
def catalogs(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {
        "methods": [u.scalar_dict(x) for x in f.rows(db, m.FinanceMethod)],
        "categories": [u.scalar_dict(x) for x in f.rows(db, m.FinanceCategory)],
    }


@router.post("/finances/catalogs/{kind}", status_code=201)
def create_catalog(
    kind: str,
    data: s.CatalogInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role != "general_admin":
        raise HTTPException(
            403, "Solo el administrador general gestiona los métodos y categorías."
        )
    model = {"methods": m.FinanceMethod, "categories": m.FinanceCategory}.get(kind)
    if model is None:
        raise HTTPException(404, "No se encontró el catálogo.")
    obj = model(**data.model_dump())
    db.add(obj)
    u.audit(db, user, obj, "create")
    db.commit()
    return u.scalar_dict(obj)


@router.patch("/finances/catalogs/{kind}/{id}")
def update_catalog(
    kind: str,
    id: int,
    data: s.CatalogInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role != "general_admin":
        raise HTTPException(
            403, "Solo el administrador general gestiona los métodos y categorías."
        )
    model = {"methods": m.FinanceMethod, "categories": m.FinanceCategory}.get(kind)
    obj = u.fresh(db, model, id) if model else None
    if obj is None:
        raise HTTPException(404, "No se encontró el registro.")
    before = u.scalar_dict(obj)
    for k, v in data.model_dump().items():
        setattr(obj, k, v)
    u.audit(db, user, obj, "update", before=before)
    db.commit()
    return u.scalar_dict(obj)


@router.get("/properties/{property_id}/finances")
def state(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return f.state(db, user, property_id)


@router.post("/properties/{property_id}/finances/contracts/{id}/preview")
def preview(
    property_id: int,
    id: int,
    data: s.RentGeneration,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.preview(db, user, property_id, id, data)


@router.post(
    "/properties/{property_id}/finances/contracts/{id}/generate", status_code=201
)
def generate(
    property_id: int,
    id: int,
    data: s.RentGeneration,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.generate_rent(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/receipts/{id}/import", status_code=201)
def import_utility(
    property_id: int,
    id: int,
    data: s.UtilityImport,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.import_utility(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/receive", status_code=201)
def receive(
    property_id: int,
    data: s.ReceiveInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.receive(db, user, property_id, data)


@router.post(
    "/properties/{property_id}/finances/receipts/{id}/expense", status_code=201
)
def receipt_expense(
    property_id: int,
    id: int,
    data: s.ReceiptExpenseInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.receipt_expense(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/guarantees", status_code=201)
def guarantee(
    property_id: int,
    data: s.GuaranteeInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.guarantee(db, user, property_id, data)


@router.post("/properties/{property_id}/finances/apply", status_code=201)
def apply(
    property_id: int,
    data: s.ApplyInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.apply(db, user, property_id, data)


@router.post("/properties/{property_id}/finances/expenses", status_code=201)
def expense(
    property_id: int,
    data: s.ExpenseInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.create_expense(db, user, property_id, data)


@router.post("/properties/{property_id}/finances/expenses/{id}/pay", status_code=201)
def disburse(
    property_id: int,
    id: int,
    data: s.DisbursementInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.disburse(db, user, property_id, id, data)


@router.post(
    "/properties/{property_id}/finances/movements/{id}/refund", status_code=201
)
def refund(
    property_id: int,
    id: int,
    data: s.RefundInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.refund(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/movements/{id}/void")
def void(
    property_id: int,
    id: int,
    data: s.ReasonInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.void_movement(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/obligations/{id}/adjust")
def adjust(
    property_id: int,
    id: int,
    data: s.AdjustmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.adjust(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/expenses/{id}/adjust")
def adjust_expense(
    property_id: int,
    id: int,
    data: s.AdjustmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.expense_adjust(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/expenses/{id}/void")
def void_expense(
    property_id: int,
    id: int,
    data: s.ReasonInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.expense_void(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/applications/{id}/void")
def void_application(
    property_id: int,
    id: int,
    data: s.ReasonInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.application_void(db, user, property_id, id, data)


@router.post("/properties/{property_id}/finances/guarantees/{id}/retain")
def retain(
    property_id: int,
    id: int,
    data: s.ReasonInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return f.retain_guarantee(db, user, property_id, id, data)
