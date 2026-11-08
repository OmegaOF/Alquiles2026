"""Persistencia de preferencias, consentimientos e idempotencia, sin dinero."""

import hashlib
import json
from sqlalchemy import select, delete, or_
from app.models import reminders as m
from app.models.entities import (
    Person,
    User,
    Property,
    PropertyAccess,
    PropertyOwner,
    AuditEvent,
)
from app.services import finances as f, utilities as u
from app.services.tenancy import (
    manage,
    lock_property,
    contact_ids,
    today,
)
from app.services.reminder_content import (
    KINDS,
    PURPOSES,
    DEFAULTS,
    FIELDS,
    normalize_number,
    contact_matches,
    validate_template,
)

require = f.require
rows = f.rows
fresh = u.fresh


def fingerprint(data):
    return hashlib.sha256(
        json.dumps(
            data, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False
        ).encode()
    ).hexdigest()


def operation(
    db,
    user,
    property_id,
    action,
    data,
    fn,
    *,
    target=None,
    admin=False,
    owner_ok=False,
    revalidate=None
):
    if not (owner_ok and user.role == "owner"):
        manage(user, active=admin)
    lock_property(db, user, property_id)
    if revalidate:
        revalidate()
    payload_hash = fingerprint({"target": target, "body": data.model_dump(mode="json")})
    previous = rows(db, m.ReminderOperation, request_key=data.request_key)
    if previous:
        op = previous[0]
        require(
            op.property_id == property_id
            and op.created_by == user.id
            and op.action == action
            and op.payload_hash == payload_hash,
            "El identificador ya se utilizó para otra solicitud o usuario.",
            409,
        )
        return json.loads(op.result)
    op = m.ReminderOperation(
        property_id=property_id,
        request_key=data.request_key,
        action=action,
        payload_hash=payload_hash,
        result="{}",
        created_by=user.id,
    )
    db.add(op)
    db.flush()
    result = fn(op)
    op.result = json.dumps(
        {**result, "operation_id": op.id}, ensure_ascii=False, default=str
    )
    # El texto/URL y los teléfonos viven en sus registros autorizados, no se
    # replican en logs de operaciones ni en documentos generales de auditoría.
    db.add(
        AuditEvent(
            actor_id=user.id,
            action=action,
            entity_type="reminder_operations",
            entity_id=op.id,
            details=json.dumps(
                {"property_id": property_id, "target": target, "result": result},
                default=str,
                ensure_ascii=False,
            ),
        )
    )
    db.commit()
    return json.loads(op.result)


def scoped_person(db, property_id, id):
    require(
        id in set(db.scalars(contact_ids(db, property_id))),
        "Seleccione una persona vinculada a esta propiedad.",
        403,
    )
    person = fresh(db, Person, id)
    require(person is not None, "No se encontró la persona.", 404)
    return person


def eligible_users(db, property_id):
    access = select(PropertyAccess.user_id).where(
        PropertyAccess.property_id == property_id
    )
    owners = select(PropertyOwner.person_id).where(
        PropertyOwner.property_id == property_id
    )
    return u.rows(
        db,
        select(User)
        .where(
            User.is_active.is_(True),
            or_(
                User.role == "general_admin",
                User.id.in_(access),
                (User.role == "owner") & User.person_id.in_(owners),
            ),
        )
        .order_by(User.id),
        True,
    )


def preference(db, user, property_id):
    lock_property(db, user, property_id)
    found = rows(db, m.ReminderPreference, property_id=property_id)
    obj = found[0] if found else None
    types = rows(db, m.ReminderTypePreference, property_id=property_id) if obj else []
    return {
        "property_id": property_id,
        "version": obj.version if obj else 0,
        "snooze_days": obj.snooze_days if obj else 7,
        "lead_days": (
            sorted(
                (r.days for r in rows(db, m.ReminderLeadDay, property_id=property_id)),
                reverse=True,
            )
            if obj
            else [7, 3, 1]
        ),
        "types": [
            {
                "kind": k,
                "is_enabled": next((r.is_enabled for r in types if r.kind == k), True),
                "allow_whatsapp": next(
                    (r.allow_whatsapp for r in types if r.kind == k), k != "report"
                ),
            }
            for k in KINDS
        ],
        "recipient_user_ids": (
            [r.user_id for r in rows(db, m.ReminderRecipient, property_id=property_id)]
            if obj
            else []
        ),
    }


def save_preference(db, user, property_id, data):
    def run(op):
        before = preference(db, user, property_id)
        require(
            before["version"] == data.expected_version,
            "Las preferencias cambiaron. Actualice la pantalla.",
            409,
        )
        allowed = {v.id for v in eligible_users(db, property_id)}
        require(
            set(data.recipient_user_ids).issubset(allowed),
            "Seleccione usuarios activos con acceso a esta casa; esta configuración no concede permisos nuevos.",
        )
        found = rows(db, m.ReminderPreference, property_id=property_id)
        obj = (
            found[0]
            if found
            else m.ReminderPreference(property_id=property_id, version=0)
        )
        obj.version += 1
        obj.snooze_days = data.snooze_days
        obj.operation_id = op.id
        db.add(obj)
        db.flush()
        for model in [m.ReminderLeadDay, m.ReminderRecipient, m.ReminderTypePreference]:
            db.execute(delete(model).where(model.property_id == property_id))
        db.add_all(
            m.ReminderLeadDay(property_id=property_id, days=d) for d in data.lead_days
        )
        db.add_all(
            m.ReminderRecipient(property_id=property_id, user_id=id)
            for id in data.recipient_user_ids
        )
        db.add_all(
            m.ReminderTypePreference(property_id=property_id, **v.model_dump())
            for v in data.types
        )
        return {"version": obj.version, "before": before}

    return operation(
        db, user, property_id, "reminder-preferences", data, run, admin=True
    )


def template(db, property_id, kind):
    found = rows(db, m.ReminderTemplate, property_id=property_id, kind=kind)
    obj = found[0] if found else None
    active = obj and obj.is_active
    return {
        "id": obj.id if obj else None,
        "kind": kind,
        "name": obj.name if obj else KINDS[kind][0],
        "body": obj.body if obj else DEFAULTS[kind],
        "effective_body": obj.body if active else DEFAULTS[kind],
        "is_active": bool(active),
        "version": obj.version if obj else 0,
        "used_id": obj.id if active else None,
        "used_version": obj.version if active else 1,
    }


def templates(db, user, property_id):
    lock_property(db, user, property_id)
    return {
        "items": [template(db, property_id, k) for k in KINDS],
        "fields": sorted(FIELDS),
    }


def save_template(db, user, property_id, data):
    validate_template(data.body)

    def run(op):
        previous = template(db, property_id, data.kind)
        require(
            previous["version"] == data.expected_version,
            "La plantilla cambió. Actualice los datos.",
            409,
        )
        obj = (
            fresh(db, m.ReminderTemplate, previous["id"])
            if previous["id"]
            else m.ReminderTemplate(property_id=property_id, kind=data.kind, version=0)
        )
        obj.name = data.name
        obj.body = data.body
        obj.is_active = data.is_active
        obj.version += 1
        obj.operation_id = op.id
        db.add(obj)
        db.flush()
        return {
            "template_id": obj.id,
            "version": obj.version,
            "previous_body": previous["body"],
        }

    return operation(
        db,
        user,
        property_id,
        "reminder-template",
        data,
        run,
        target=data.kind,
        admin=True,
    )


def consent_dict(db, obj):
    grant = fresh(db, m.ReminderOperation, obj.operation_id)
    revoked = (
        fresh(db, m.ReminderOperation, obj.revoked_operation_id)
        if obj.revoked_operation_id
        else None
    )
    person = fresh(db, Person, obj.person_id)
    head = rows(
        db,
        m.CommunicationConsentHead,
        property_id=obj.property_id,
        person_id=obj.person_id,
        purpose=obj.purpose,
    )[0]
    return {
        **u.scalar_dict(obj),
        "version": head.version,
        "is_active": not revoked and head.consent_id == obj.id,
        "matches_current_number": contact_matches(person, obj.number),
        "recorded_by": grant.created_by,
        "recorded_at": grant.created_at.isoformat(),
        "revoked_at": revoked.created_at.isoformat() if revoked else None,
        "revoked_by": revoked.created_by if revoked else None,
    }


def consents(db, user, property_id):
    lock_property(db, user, property_id)
    heads = rows(db, m.CommunicationConsentHead, property_id=property_id)
    items = [fresh(db, m.CommunicationConsent, h.consent_id) for h in heads]
    if user.role == "owner":
        items = [c for c in items if c.person_id == user.person_id]
    return {"items": [consent_dict(db, c) for c in items], "purposes": PURPOSES}


def save_consent(db, user, property_id, data):
    number = normalize_number(data.number, data.bolivia_local)

    def run(op):
        person = scoped_person(db, property_id, data.person_id)
        require(
            data.accepted_on <= today(),
            "La aceptación no puede registrarse con una fecha futura.",
        )
        require(
            contact_matches(person, number),
            "El número autorizado debe coincidir con phone o whatsapp de la persona. Corrija primero sus datos de contacto.",
        )
        found = rows(
            db,
            m.CommunicationConsentHead,
            property_id=property_id,
            person_id=person.id,
            purpose=data.purpose,
        )
        head = found[0] if found else None
        require(
            (head.version if head else 0) == data.expected_version,
            "El consentimiento cambió. Compruebe su estado actual.",
            409,
        )
        previous = fresh(db, m.CommunicationConsent, head.consent_id) if head else None
        if previous and previous.revoked_operation_id is None:
            previous.revoked_operation_id = op.id
        obj = m.CommunicationConsent(
            property_id=property_id,
            person_id=person.id,
            purpose=data.purpose,
            number=number,
            accepted_on=data.accepted_on,
            method=data.method.strip(),
            notes=data.notes,
            operation_id=op.id,
        )
        db.add(obj)
        db.flush()
        if not head:
            head = m.CommunicationConsentHead(
                property_id=property_id,
                person_id=person.id,
                purpose=data.purpose,
                consent_id=obj.id,
                version=0,
            )
        head.consent_id = obj.id
        head.version += 1
        db.add(head)
        db.add(
            AuditEvent(
                actor_id=user.id,
                action="consent-granted",
                entity_type="communication_consents",
                entity_id=obj.id,
                details=json.dumps(
                    {
                        "property_id": property_id,
                        "supersedes_id": previous.id if previous else None,
                        "grant": u.scalar_dict(obj),
                    },
                    default=str,
                    ensure_ascii=False,
                ),
            )
        )
        return {"consent_id": obj.id, "version": head.version}

    return operation(
        db,
        user,
        property_id,
        "consent-grant",
        data,
        run,
        target=[data.person_id, data.purpose],
        admin=True,
    )


def revoke_consent(db, user, property_id, id, data):
    def run(op):
        obj = fresh(db, m.CommunicationConsent, id)
        require(
            obj is not None and obj.property_id == property_id,
            "No se encontró el consentimiento de esta casa.",
            404,
        )
        head = rows(
            db,
            m.CommunicationConsentHead,
            property_id=property_id,
            person_id=obj.person_id,
            purpose=obj.purpose,
        )[0]
        require(
            head.consent_id == id and head.version == data.expected_version,
            "El consentimiento cambió. Actualice los datos.",
            409,
        )
        require(
            obj.revoked_operation_id is None,
            "Este consentimiento ya está revocado.",
            409,
        )
        obj.revoked_operation_id = op.id
        head.version += 1
        db.add(
            AuditEvent(
                actor_id=user.id,
                action="consent-revoked",
                entity_type="communication_consents",
                entity_id=obj.id,
                details=json.dumps(
                    {
                        "property_id": property_id,
                        "reason": data.reason,
                        "version": head.version,
                    },
                    ensure_ascii=False,
                ),
            )
        )
        return {"consent_id": id, "version": head.version, "revoked": True}

    return operation(
        db, user, property_id, "consent-revoke", data, run, target=id, admin=True
    )


def consent_history(db, user, property_id, id):
    lock_property(db, user, property_id)
    obj = fresh(db, m.CommunicationConsent, id)
    require(
        obj is not None and obj.property_id == property_id,
        "No se encontró el consentimiento.",
        404,
    )
    require(
        user.role != "owner" or obj.person_id == user.person_id,
        "Solo puede consultar su propio consentimiento.",
        403,
    )
    grant_ids = select(m.CommunicationConsent.id).where(
        m.CommunicationConsent.property_id == property_id,
        m.CommunicationConsent.person_id == obj.person_id,
        m.CommunicationConsent.purpose == obj.purpose,
    )
    return [
        u.scalar_dict(e)
        for e in u.rows(
            db,
            select(AuditEvent)
            .where(
                AuditEvent.entity_type == "communication_consents",
                AuditEvent.entity_id.in_(grant_ids),
            )
            .order_by(AuditEvent.id),
            True,
        )
    ]
