"""Acciones y Click to Chat asistido, con revalidación en cada apertura."""

from datetime import date, timedelta
from sqlalchemy import select
from app.models import reminders as m
from app.models.entities import Person
from app.services import reminder_store as store, reminder_sources as sources
from app.services.reminder_content import ClickToChat, render_message, contact_matches
from app.services.tenancy import manage, lock_property, today

require = store.require
rows = store.rows
fresh = store.fresh


def notice_for_action(db, event, expected):
    obj = sources.stored_notice(db, event["key"])
    require(
        (obj.version if obj else 0) == expected,
        "Otro usuario modificó la atención de este aviso. Actualice la pantalla.",
        409,
    )
    if not obj:
        obj = m.ReminderNotice(**sources.anchor(event["key"]), version=0)
        db.add(obj)
        db.flush()
    return obj


def act(db, user, property_id, key, data):
    def run(op):
        event = sources.detail(db, user, property_id, key)
        require(
            event["requires_attention"],
            "El origen ya no requiere atención o está fuera del plazo configurado.",
            409,
        )
        require(
            event["attention_fingerprint"] == data.expected_fingerprint,
            "El aviso cambió. Revise sus datos actuales.",
            409,
        )
        obj = notice_for_action(db, event, data.expected_version)
        prefs = store.preference(db, user, property_id)
        if data.action == "snoozed":
            require(
                today()
                < data.until_on
                <= today() + timedelta(days=prefs["snooze_days"]),
                "La posposición debe ser futura y respetar el máximo configurado para esta casa.",
            )
        db.add(
            m.ReminderAttentionEvent(
                notice_id=obj.id,
                kind=data.action,
                fingerprint=event["attention_fingerprint"],
                until_on=data.until_on,
                notes=data.notes,
                operation_id=op.id,
            )
        )
        obj.version += 1
        return {
            "notice_id": obj.id,
            "version": obj.version,
            "state": data.action,
            "money_changed": False,
        }

    return store.operation(
        db,
        user,
        property_id,
        "reminder-attention",
        data,
        run,
        target=key,
        owner_ok=True,
    )


def sendable(db, user, property_id, event, recipient_id):
    manage(user)
    require(
        event["requires_attention"] and not event["resolved"],
        "El aviso ya no requiere un mensaje. Actualice los datos del origen.",
        409,
    )
    require(
        event["allow_whatsapp"],
        "Esta casa no ofrece WhatsApp para este tipo de aviso.",
        403,
    )
    require(
        event["due_on"] is not None or event["kind"] == "report",
        "La fecha está pendiente de definir. Complete el origen antes de preparar WhatsApp.",
        409,
    )
    require(
        recipient_id in event["recipient_ids"],
        "El destinatario no corresponde a las responsabilidades de este aviso.",
    )
    person = store.scoped_person(db, property_id, recipient_id)
    heads = rows(
        db,
        m.CommunicationConsentHead,
        property_id=property_id,
        person_id=recipient_id,
        purpose=event["purpose"],
    )
    consent = fresh(db, m.CommunicationConsent, heads[0].consent_id) if heads else None
    require(
        consent is not None and consent.revoked_operation_id is None,
        "No hay consentimiento vigente para esta persona, propiedad y tipo de comunicación.",
        409,
    )
    require(
        contact_matches(person, consent.number),
        "El número del contacto cambió o es inválido. Revise sus datos y el consentimiento.",
        409,
    )
    return person, consent


def proposal(db, user, property_id, key, recipient_id):
    event = sources.detail(db, user, property_id, key)
    person, consent = sendable(db, user, property_id, event, recipient_id)
    template = store.template(db, property_id, event["kind"])
    text = render_message(template["effective_body"], event, person)
    return {
        "event": event,
        "proposal_fingerprint": store.fingerprint(
            [
                event["source_fingerprint"],
                recipient_id,
                consent.id,
                template["used_id"],
                template["used_version"],
                template["effective_body"],
            ]
        ),
        "recipient_id": recipient_id,
        "recipient_name": person.full_name,
        "number": consent.number,
        "consent": store.consent_dict(db, consent),
        "text": text,
        "template": {
            "id": template["used_id"],
            "kind": event["kind"],
            "version": template["used_version"],
            "name": template["name"],
        },
    }


def prepare(db, user, property_id, key, data):
    def run(op):
        draft = proposal(db, user, property_id, key, data.recipient_id)
        event = draft["event"]
        require(
            draft["proposal_fingerprint"] == data.expected_proposal_fingerprint,
            "El destinatario autorizado, número, plantilla o saldo cambió desde la vista previa. Genere y revise un texto actualizado.",
            409,
        )
        require(
            event["source_fingerprint"] == data.expected_fingerprint,
            "El saldo, fecha o destinatario cambió. Genere el mensaje con los datos actuales.",
            409,
        )
        obj = notice_for_action(db, event, data.expected_version)
        text = data.text if data.text is not None else draft["text"]
        require(bool(text.strip()), "Escriba un mensaje antes de guardarlo.")
        comm = m.ReminderCommunication(
            notice_id=obj.id,
            consent_id=draft["consent"]["id"],
            template_id=draft["template"]["id"],
            template_code=(
                None if draft["template"]["id"] else draft["template"]["kind"]
            ),
            template_version=draft["template"]["version"],
            final_text=text,
            source_fingerprint=event["source_fingerprint"],
            version=1,
            operation_id=op.id,
        )
        db.add(comm)
        obj.version += 1
        db.flush()
        return {
            "communication_id": comm.id,
            "version": comm.version,
            "notice_version": obj.version,
            "state": "prepared",
            "sent": False,
        }

    return store.operation(
        db, user, property_id, "message-prepared", data, run, target=key
    )


def communication_context(db, user, property_id, id):
    lock_property(db, user, property_id)
    obj = fresh(db, m.ReminderCommunication, id)
    require(obj is not None, "No se encontró la comunicación.", 404)
    notice = fresh(db, m.ReminderNotice, obj.notice_id)
    event = sources.detail(db, user, property_id, sources.notice_key(notice))
    consent = fresh(db, m.CommunicationConsent, obj.consent_id)
    require(
        consent.property_id == property_id,
        "No se encontró la comunicación de esta casa.",
        404,
    )
    op = fresh(db, m.ReminderOperation, obj.operation_id)
    require(
        user.role != "owner"
        or consent.person_id == user.person_id
        or op.created_by == user.id,
        "Solo puede consultar comunicaciones que le correspondan.",
        403,
    )
    return obj, event, consent, op


def communication_state(db, obj):
    events = rows(db, m.ReminderCommunicationEvent, communication_id=obj.id)
    if not events:
        return "prepared", events
    last = events[-1].kind
    state = {
        "opened": "opened",
        "manual_sent": "manual_sent",
        "correct_sent": "manual_sent",
        "not_sent": "not_sent",
        "correct_not_sent": "not_sent",
    }[last]
    return state, events


def communication_dict(db, user, property_id, id, include_text=True):
    obj, event, consent, op = communication_context(db, user, property_id, id)
    state, events = communication_state(db, obj)
    person = fresh(db, Person, consent.person_id)
    return {
        "id": id,
        "notice_key": event["key"],
        "notice_id": obj.notice_id,
        "version": obj.version,
        "state": state,
        "recipient_id": consent.person_id,
        "recipient_name": person.full_name,
        "purpose": consent.purpose,
        "number": consent.number if include_text else None,
        "masked_number": "…" + consent.number[-4:],
        "final_text": obj.final_text if include_text else None,
        "template_code": (
            fresh(db, m.ReminderTemplate, obj.template_id).kind
            if obj.template_id
            else obj.template_code
        ),
        "template_version": obj.template_version,
        "source_fingerprint": obj.source_fingerprint,
        "source_changed": obj.source_fingerprint != event["source_fingerprint"],
        "consent_current": consent.revoked_operation_id is None
        and contact_matches(person, consent.number),
        "created_by": op.created_by,
        "created_at": op.created_at.isoformat(),
        "can_confirm": user.role != "owner" and op.created_by == user.id,
        "event": event,
        "events": [
            {
                **store.u.scalar_dict(e),
                "created_by": fresh(db, m.ReminderOperation, e.operation_id).created_by,
                "created_at": fresh(
                    db, m.ReminderOperation, e.operation_id
                ).created_at.isoformat(),
            }
            for e in events
        ],
    }


def communications(db, user, property_id, key=None, recipient_id=None):
    projected, _, _ = sources.project(db, user, property_id)
    keys = {e["key"] for e in projected}
    # No explorar ni devolver mensajes de otras propiedades.
    ids = []
    for event in projected:
        if (key is None or event["key"] == key) and event["notice_id"]:
            ids.append(event["notice_id"])
    found = store.u.rows(
        db,
        select(m.ReminderCommunication)
        .where(m.ReminderCommunication.notice_id.in_(ids))
        .order_by(m.ReminderCommunication.id.desc()),
        True,
    )
    result = []
    for obj in found:
        consent = fresh(db, m.CommunicationConsent, obj.consent_id)
        op = fresh(db, m.ReminderOperation, obj.operation_id)
        if (
            user.role == "owner"
            and consent.person_id != user.person_id
            and op.created_by != user.id
        ):
            continue
        if recipient_id and consent.person_id != recipient_id:
            continue
        result.append(communication_dict(db, user, property_id, obj.id, False))
    return result


def ready_to_open(db, user, property_id, id):
    obj, event, consent, op = communication_context(db, user, property_id, id)
    manage(user)
    require(
        op.created_by == user.id,
        "Cada usuario debe abrir y confirmar sus propios mensajes preparados.",
        403,
    )
    person, current = sendable(db, user, property_id, event, consent.person_id)
    require(
        obj.source_fingerprint == event["source_fingerprint"],
        "El saldo, fecha o persona cambió después de preparar el mensaje. Genere y revise un texto actualizado.",
        409,
    )
    require(
        current.id == obj.consent_id,
        "El consentimiento o número cambió. Prepare un nuevo mensaje autorizado.",
        409,
    )
    template = store.template(
        db,
        property_id,
        (
            fresh(db, m.ReminderTemplate, obj.template_id).kind
            if obj.template_id
            else obj.template_code
        ),
    )
    require(
        template["used_id"] == obj.template_id
        and template["used_version"] == obj.template_version,
        "La plantilla cambió. Genere y revise el texto actualizado.",
        409,
    )
    state, _ = communication_state(db, obj)
    require(
        state in ["prepared", "opened"],
        "Prepare otro mensaje para una nueva comunicación; este registro ya tiene una decisión de envío.",
        409,
    )
    return obj, event, consent, op


def message_action(db, user, property_id, id, data):
    opening = data.action == "authorize_open"

    def revalidate():
        # También se ejecuta antes de devolver una respuesta idempotente. Nunca
        # devolver un enlace almacenado después de revocar el consentimiento.
        ready_to_open(db, user, property_id, id)

    def run(op):
        if data.action == "opened":
            ready_to_open(db, user, property_id, id)
        obj, event, consent, prepared = communication_context(db, user, property_id, id)
        require(
            prepared.created_by == user.id,
            "No puede confirmar mensajes de otro usuario.",
            403,
        )
        require(
            obj.version == data.expected_version,
            "La comunicación cambió. Actualice el historial.",
            409,
        )
        state, events = communication_state(db, obj)
        if data.action == "authorize_open":
            obj.authorization_operation_id = op.id
            obj.version += 1
            return {
                "communication_id": id,
                "version": obj.version,
                "authorization_operation_id": op.id,
                "sent": False,
            }
        if data.action == "opened":
            require(
                obj.authorization_operation_id == data.authorization_operation_id,
                "Valide nuevamente el mensaje antes de informar una apertura.",
                409,
            )
            authorization = fresh(
                db, m.ReminderOperation, data.authorization_operation_id
            )
            require(
                authorization.created_by == user.id
                and authorization.action == "message-authorize_open",
                "La autorización no pertenece a esta apertura.",
                403,
            )
        elif data.action.startswith("correct_"):
            require(
                state in ["manual_sent", "not_sent"],
                "Solo se corrige una confirmación o cancelación anterior.",
                409,
            )
        else:
            require(
                state in ["prepared", "opened"],
                "El mensaje ya tiene una decisión. Use la corrección para conservar el historial.",
                409,
            )
        event_row = m.ReminderCommunicationEvent(
            communication_id=id, kind=data.action, notes=data.notes, operation_id=op.id
        )
        db.add(event_row)
        obj.version += 1
        db.flush()
        return {
            "communication_id": id,
            "event_id": event_row.id,
            "version": obj.version,
            "state": data.action,
            "automatic_delivery_confirmation": False,
        }

    result = store.operation(
        db,
        user,
        property_id,
        "message-" + data.action,
        data,
        run,
        target=id,
        revalidate=revalidate if opening else None,
    )
    if data.action == "authorize_open":
        obj, _, _, _ = ready_to_open(db, user, property_id, id)
        result = {
            **result,
            "url": ClickToChat().build_link(
                fresh(db, m.CommunicationConsent, obj.consent_id).number, obj.final_text
            ),
        }
    return result
