from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import User
from app.schemas import reminders as s
from app.services import (
    reminders as service,
    reminder_sources as sources,
    reminder_store as store,
    reported_payments as reports,
)

router = APIRouter(
    prefix="/properties/{property_id}/reminders",
    tags=["Recordatorios y comunicaciones asistidas"],
)


@router.get("")
def listing(
    property_id: int,
    kind: s.Kind | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return sources.listing(db, user, property_id, kind=kind)


@router.get("/preferences")
def preferences(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    result = store.preference(db, user, property_id)
    return {
        **result,
        "eligible_users": (
            [
                {"id": u.id, "full_name": u.full_name, "role": u.role}
                for u in store.eligible_users(db, property_id)
            ]
            if user.role in ["general_admin", "property_admin"]
            else []
        ),
    }


@router.post("/preferences")
def save_preferences(
    property_id: int,
    data: s.PreferenceInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return store.save_preference(db, user, property_id, data)


@router.get("/templates")
def templates(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return store.templates(db, user, property_id)


@router.post("/templates", status_code=201)
def save_template(
    property_id: int,
    data: s.TemplateInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return store.save_template(db, user, property_id, data)


@router.get("/consents")
def consents(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return store.consents(db, user, property_id)


@router.post("/consents", status_code=201)
def save_consent(
    property_id: int,
    data: s.ConsentInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return store.save_consent(db, user, property_id, data)


@router.post("/consents/{id}/revoke")
def revoke_consent(
    property_id: int,
    id: int,
    data: s.RevokeConsent,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return store.revoke_consent(db, user, property_id, id, data)


@router.get("/consents/{id}/history")
def consent_history(
    property_id: int,
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return store.consent_history(db, user, property_id, id)


@router.get("/notices/{key}")
def detail(
    property_id: int,
    key: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return sources.detail(db, user, property_id, key)


@router.post("/notices/{key}/actions")
def action(
    property_id: int,
    key: str,
    data: s.NoticeAction,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.act(db, user, property_id, key, data)


@router.get("/notices/{key}/proposal")
def proposal(
    property_id: int,
    key: str,
    recipient_id: int = Query(gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.proposal(db, user, property_id, key, recipient_id)


@router.post("/notices/{key}/messages", status_code=201)
def prepare(
    property_id: int,
    key: str,
    data: s.PrepareMessage,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.prepare(db, user, property_id, key, data)


@router.get("/communications")
def communications(
    property_id: int,
    key: str | None = None,
    recipient_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.communications(db, user, property_id, key, recipient_id)


@router.get("/communications/{id}")
def communication(
    property_id: int,
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.communication_dict(db, user, property_id, id)


@router.post("/communications/{id}/actions")
def message_action(
    property_id: int,
    id: int,
    data: s.MessageAction,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return service.message_action(db, user, property_id, id, data)


@router.get("/payment-reports")
def report_list(
    property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return reports.listing(db, user, property_id)


@router.post("/payment-reports", status_code=201)
def report_create(
    property_id: int,
    data: s.ReportInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return reports.create(db, user, property_id, data)


@router.post("/payment-reports/{id}/decisions")
def report_decide(
    property_id: int,
    id: int,
    data: s.ReportDecision,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return reports.decide(db, user, property_id, id, data)
