"""Fuentes vivas, consentimiento, apertura manual y concurrencia MySQL."""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4
from urllib.parse import urlsplit, parse_qs
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, local
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, func, event as sqlalchemy_event
from sqlalchemy.orm import Session
from app.main import app
from app.models import reminders as m, finances as fm
from app.models.entities import AuditEvent
from app.services import tenancy, reminder_store as store
from app.services.reminder_content import (
    normalize_number,
    ClickToChat,
    validate_template,
)
from test_phase1 import db, client, admin, post, person, property_, user, login_as
from test_tenancy import home, contract_body
from test_utilities import utility, receipt, rent, calculate, confirm, configure
from test_finances import (
    fin,
    rental,
    services,
    cash as ordinary_cash,
    call as ordinary_call,
    state as money_state,
)
from test_anticreticos import anti, save as capital_conditions, deliver, restitution


def key():
    return uuid4().hex


@pytest.fixture
def rem(admin, fin, monkeypatch):
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 1, 16))
    for p, number in [
        (fin["tenant"], "+59171234567"),
        (fin["owner"], "+12025550123"),
        (fin["occupant"], "+34612345678"),
    ]:
        assert (
            admin.patch(
                f"/api/v1/persons/{p['id']}", json={"whatsapp": number}
            ).status_code
            == 200
        )
    c, oid = rental(admin, fin)
    return {
        **fin,
        "c": c,
        "oid": oid,
        "rem": f"/properties/{fin['property']['id']}/reminders",
        "notice": f"debt:{oid}",
    }


def get(admin, r, path=""):
    response = admin.get("/api/v1" + r["rem"] + path)
    assert response.status_code == 200, response.text
    return response.json()


def event(admin, r, k=None):
    return get(admin, r, "/notices/" + (k or r["notice"]))


def invoke(admin, r, path, **body):
    return post(admin, r["rem"] + path, {"request_key": key(), **body})


def attention(admin, r, action="reviewed", k=None, **other):
    e = event(admin, r, k)
    return invoke(
        admin,
        r,
        f"/notices/{e['key']}/actions",
        action=action,
        expected_version=e["version"],
        expected_fingerprint=e["attention_fingerprint"],
        **other,
    )


def consent(admin, r, p=None, purpose="payments", number="+59171234567", **other):
    p = p or r["tenant"]["id"]
    prior = next(
        (
            c
            for c in get(admin, r, "/consents")["items"]
            if c["person_id"] == p and c["purpose"] == purpose
        ),
        None,
    )
    return invoke(
        admin,
        r,
        "/consents",
        expected_version=prior["version"] if prior else 0,
        person_id=p,
        purpose=purpose,
        number=number,
        accepted_on="2030-12-31",
        method="Aceptación expresa ficticia",
        explicitly_accepted=True,
        **other,
    )


def prepare(admin, r, k=None, p=None, text=None):
    e = event(admin, r, k)
    proposal = get(
        admin, r, f"/notices/{e['key']}/proposal?recipient_id={p or r['tenant']['id']}"
    )
    return invoke(
        admin,
        r,
        f"/notices/{e['key']}/messages",
        expected_version=e["version"],
        expected_fingerprint=e["source_fingerprint"],
        expected_proposal_fingerprint=proposal["proposal_fingerprint"],
        recipient_id=p or r["tenant"]["id"],
        text=text,
    )


def comm(admin, r, id):
    return get(admin, r, f"/communications/{id}")


def comm_action(admin, r, id, action, **other):
    current = comm(admin, r, id)
    return invoke(
        admin,
        r,
        f"/communications/{id}/actions",
        action=action,
        expected_version=current["version"],
        **other,
    )


def pay(admin, r, amount, oid=None, **other):
    return ordinary_call(
        admin,
        r,
        "/receive",
        person_id=r["tenant"]["id"],
        applications=[{"obligation_id": oid or r["oid"], "amount": str(amount)}],
        **ordinary_cash(r, amount, **other),
    )


def preference_body(admin, r, **changes):
    pref = get(admin, r, "/preferences")
    return {
        "expected_version": pref["version"],
        "lead_days": pref["lead_days"],
        "snooze_days": pref["snooze_days"],
        "recipient_user_ids": pref["recipient_user_ids"],
        "types": pref["types"],
        **changes,
    }


def report_body(r, **changes):
    return {
        "obligation_id": r["oid"],
        "reporting_person_id": r["tenant"]["id"],
        "concept": "Alquiler reportado",
        "amount": "500",
        "reported_on": "2031-01-01",
        "method_id": r["method"],
        "document_reference": "Comprobante externo ficticio",
        **changes,
    }


@pytest.mark.parametrize("scenario", ["upcoming", "partial", "settled", "finished"])
def test_capital_deadline_uses_actual_balance_independently_of_occupation(
    admin, anti, monkeypatch, scenario
):
    r = {**anti, "rem": f"/properties/{anti['property']['id']}/reminders"}
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2032, 1, 27, 16))
    capital_conditions(admin, r)
    assert not any(e["kind"] == "capital" for e in get(admin, r)["items"])
    deliver(admin, r, 50000)
    k = f"capital:{r['contract']['id']}:{r['tenant']['id']}:{r['owner']['id']}"
    e = event(admin, r, k)
    assert e["priority"] == "upcoming" and e["amount"] == "50000.00"
    assert e["due_on"] == "2032-02-01" and e["capital_received"] == "50000.00"
    assert e["person_id"] == r["owner"]["id"] and e["holder_id"] == r["tenant"]["id"]
    attention(admin, r, k=k)
    if scenario in ["partial", "settled"]:
        restitution(admin, r, 15000 if scenario == "partial" else 50000)
        e = event(admin, r, k)
        assert e["amount"] == ("35000.00" if scenario == "partial" else "0.00")
        assert e["capital_returned"] == (
            "15000.00" if scenario == "partial" else "50000.00"
        )
        assert e["resolved"] == (scenario == "settled")
    if scenario == "finished":
        response = admin.post(
            f"/api/v1/contracts/{r['contract']['id']}/actions",
            json={
                "action": "finish",
                "end_date": "2032-01-25",
                "reason": "Entrega de la habitación; capital pendiente",
            },
        )
        assert response.status_code == 200, response.text
        assert event(admin, r, k)["requires_attention"]
        assert event(admin, r, k)["contract_status"] == "finished"
        assert event(admin, r, f"contract:{r['contract']['id']}")["resolved"]
    summary = money_state(admin, r)["summary"][0]
    assert summary["receivable"] == summary["received"] == "0.00"
    assert summary["guarantees_received"] == summary["credit_available"] == "0.00"


def test_consent_renewal_keeps_immutable_historical_number_and_blocks_old_grant(
    admin, rem, db
):
    r = rem
    original = consent(admin, r)
    message = prepare(admin, r)["communication_id"]
    assert (
        admin.patch(
            f"/api/v1/persons/{r['tenant']['id']}", json={"whatsapp": "+59171234568"}
        ).status_code
        == 200
    )
    renewed = consent(
        admin, r, number="+59171234568", notes="Nueva autorización expresa"
    )
    assert renewed["consent_id"] != original["consent_id"]
    assert comm(admin, r, message)["number"] == "59171234567"
    assert not comm(admin, r, message)["consent_current"]
    response = admin.post(
        "/api/v1" + r["rem"] + f"/communications/{message}/actions",
        json={"request_key": key(), "expected_version": 1, "action": "authorize_open"},
    )
    assert response.status_code == 409
    new = prepare(admin, r)["communication_id"]
    assert "/59171234568?" in comm_action(admin, r, new, "authorize_open")["url"]
    with Session(db) as s:
        old = s.get(m.CommunicationConsent, original["consent_id"])
        assert old.number == "59171234567" and old.revoked_operation_id is not None
        head = s.get(
            m.CommunicationConsentHead,
            (r["property"]["id"], r["tenant"]["id"], "payments"),
        )
        assert head.consent_id == renewed["consent_id"] and head.version == 2
    history = get(admin, r, f"/consents/{original['consent_id']}/history")
    assert len(history) == 2 and str(original["consent_id"]) in history[1]["details"]


def test_custom_template_is_versioned_and_old_preparation_requires_refresh(admin, rem):
    r = rem
    consent(admin, r)
    body = dict(
        expected_version=0,
        kind="rent",
        name="Alquiler cordial",
        body="Hola {nombre}. Saldo real {moneda} {importe} por {concepto}, hasta {vencimiento}.",
        is_active=True,
    )
    invoke(admin, r, "/templates", **body)
    message = prepare(admin, r)["communication_id"]
    assert "Saldo real BOB 500,00" in comm(admin, r, message)["final_text"]
    invoke(
        admin,
        r,
        "/templates",
        **{
            **body,
            "expected_version": 1,
            "body": "Estimado/a {nombre}, revise {moneda} {importe} hasta {vencimiento}.",
        },
    )
    response = admin.post(
        "/api/v1" + r["rem"] + f"/communications/{message}/actions",
        json={"request_key": key(), "expected_version": 1, "action": "authorize_open"},
    )
    assert response.status_code == 409
    assert "Saldo real" in comm(admin, r, message)["final_text"]
    assert (
        "Estimado/a"
        in get(
            admin,
            r,
            f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}",
        )["text"]
    )
    response = admin.post(
        "/api/v1" + r["rem"] + "/templates",
        json={
            "request_key": key(),
            **body,
            "expected_version": 2,
            "body": "Datos inválidos: {nombre.__class__}",
        },
    )
    assert response.status_code == 422


def test_credit_application_and_void_refresh_the_same_reminder(admin, rem):
    r = rem
    attention(admin, r)
    credit = ordinary_call(
        admin,
        r,
        "/receive",
        person_id=r["tenant"]["id"],
        surplus="credit",
        applications=[],
        **ordinary_cash(r, 200),
    )
    assert event(admin, r)["amount"] == "500.00"
    ordinary_call(
        admin,
        r,
        "/apply",
        applications=[
            {
                "source_movement_id": credit["movement_id"],
                "obligation_id": r["oid"],
                "amount": "200",
            }
        ],
    )
    assert event(admin, r)["amount"] == "300.00"
    ordinary_call(
        admin,
        r,
        f"/movements/{credit['movement_id']}/void",
        reason="Anulación trazable del anticipo ordinario",
    )
    assert event(admin, r)["amount"] == "500.00"


def test_repeated_report_and_message_requests_keep_single_records(admin, rem, db):
    r = rem
    consent(admin, r)
    source = event(admin, r)
    proposal = get(
        admin, r, f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    requests = [
        ("/payment-reports", {"request_key": key(), **report_body(r)}),
        (
            f"/notices/{r['notice']}/messages",
            {
                "request_key": key(),
                "expected_version": source["version"],
                "expected_fingerprint": source["source_fingerprint"],
                "expected_proposal_fingerprint": proposal["proposal_fingerprint"],
                "recipient_id": r["tenant"]["id"],
                "text": None,
            },
        ),
    ]
    for path, body in requests:
        first = admin.post("/api/v1" + r["rem"] + path, json=body)
        second = admin.post("/api/v1" + r["rem"] + path, json=body)
        assert first.status_code == second.status_code == 201
        assert first.json() == second.json()
        changed = admin.post(
            "/api/v1" + r["rem"] + path,
            json={
                **body,
                "request_key": body["request_key"],
                **(
                    {"amount": "1"}
                    if path == "/payment-reports"
                    else {"text": "Un texto diferente"}
                ),
            },
        )
        assert changed.status_code == 409
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(m.ReportedPayment)) == 1
        assert s.scalar(select(func.count()).select_from(m.ReminderCommunication)) == 1
        assert s.scalar(select(func.count()).select_from(fm.FinanceMovement)) == 0


def test_no_active_external_messaging_or_fiscal_endpoints():
    routes = [path.lower() for path in app.openapi()["paths"]]
    assert not any(
        word in path
        for path in routes
        for word in (
            "webhook",
            "auto-send",
            "bulk-send",
            "business-api",
            "fiscal",
            "tributario",
        )
    )


def test_template_cannot_invent_capital_for_a_rental_notice(admin, rem):
    r = rem
    consent(admin, r)
    invoke(
        admin,
        r,
        "/templates",
        expected_version=0,
        kind="rent",
        name="Plantilla con dato incorrecto",
        body="Hola {nombre}, el capital recibido es {capital_recibido}.",
        is_active=True,
    )
    response = admin.get(
        "/api/v1"
        + r["rem"]
        + f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    assert response.status_code == 422 and "Faltan datos" in response.text


def test_finished_occupancy_with_future_restitution_still_requests_internal_review(
    admin, anti, monkeypatch
):
    r = {**anti, "rem": f"/properties/{anti['property']['id']}/reminders"}
    capital_conditions(admin, r)
    deliver(admin, r, 50000)
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 15, 16))
    response = admin.post(
        f"/api/v1/contracts/{r['contract']['id']}/actions",
        json={
            "action": "finish",
            "end_date": "2031-02-10",
            "reason": "Entrega anticipada de la habitación",
        },
    )
    assert response.status_code == 200, response.text
    k = f"capital:{r['contract']['id']}:{r['tenant']['id']}:{r['owner']['id']}"
    e = event(admin, r, k)
    assert e["requires_attention"] and e["priority"] == "date_missing"
    assert e["due_on"] == "2032-02-01" and e["days_overdue"] == 0
    assert e["amount"] == "50000.00" and "sin adelantar" in e["review_issues"][0]


def test_api_filters_by_type_within_the_authorized_property(admin, rem):
    assert [e["kind"] for e in get(admin, rem, "?kind=rent")["items"]] == ["rent"]
    assert get(admin, rem, "?kind=capital")["items"] == []
    assert admin.get("/api/v1" + rem["rem"] + "?kind=inventado").status_code == 422


@pytest.mark.parametrize("change", ["number", "template"])
def test_preparation_requires_the_same_authorized_number_and_template_as_preview(
    admin, rem, change, db
):
    r = rem
    consent(admin, r)
    draft = get(
        admin, r, f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    if change == "number":
        assert (
            admin.patch(
                f"/api/v1/persons/{r['tenant']['id']}",
                json={"whatsapp": "+59171234568"},
            ).status_code
            == 200
        )
        consent(admin, r, number="+59171234568")
    else:
        invoke(
            admin,
            r,
            "/templates",
            expected_version=0,
            kind="rent",
            name="Nuevo texto revisado",
            body="Hola {nombre}, saldo vigente {moneda} {importe}.",
            is_active=True,
        )
    response = admin.post(
        "/api/v1" + r["rem"] + f"/notices/{r['notice']}/messages",
        json={
            "request_key": key(),
            "expected_version": draft["event"]["version"],
            "expected_fingerprint": draft["event"]["source_fingerprint"],
            "expected_proposal_fingerprint": draft["proposal_fingerprint"],
            "recipient_id": r["tenant"]["id"],
            "text": draft["text"],
        },
    )
    assert response.status_code == 409 and "vista previa" in response.text
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(m.ReminderCommunication)) == 0
    prepare(admin, r)


def test_live_due_overdue_partial_paid_and_no_duplicate_accounting(
    admin, rem, db, monkeypatch
):
    r = rem
    with Session(db) as s:
        before = s.scalar(select(func.count()).select_from(fm.FinanceOperation))
    for _ in range(3):
        e = next(e for e in get(admin, r)["items"] if e["key"] == r["notice"])
        assert (
            e["priority"] == "upcoming"
            and e["amount"] == "500.00"
            and e["days_remaining"] == 4
        )
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(m.ReminderNotice)) == 0
        assert s.scalar(select(func.count()).select_from(fm.FinanceOperation)) == before
    attention(admin, r)
    pay(admin, r, 200)
    e = event(admin, r)
    assert (
        e["amount"] == "300.00"
        and e["applied"] == "200.00"
        and e["attention_state"] == "pending"
    )
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 6, 16))
    assert (
        event(admin, r)["priority"] == "overdue"
        and event(admin, r)["days_overdue"] == 1
    )
    pay(admin, r, 300)
    assert (
        event(admin, r)["resolved"] and event(admin, r)["attention_state"] == "resolved"
    )
    assert not any(
        e["key"] == r["notice"] and e["requires_attention"]
        for e in get(admin, r)["items"]
    )


def test_adjustment_zero_and_changed_due_use_financial_source(admin, rem):
    r = rem
    attention(admin, r)
    ordinary_call(
        admin,
        r,
        f"/obligations/{r['oid']}/adjust",
        new_total="450",
        new_due_on="2031-01-08",
        reason="Corrección de importe y fecha autorizada",
    )
    e = event(admin, r)
    assert (
        e["amount"] == "450.00"
        and e["due_on"] == "2031-01-08"
        and e["attention_state"] == "pending"
    )
    ordinary_call(
        admin,
        r,
        f"/obligations/{r['oid']}/adjust",
        new_total="0",
        reason="Obligación anulada mediante ajuste trazable",
    )
    assert event(admin, r)["resolved"]


def test_review_reactivates_at_milestones_and_snooze_does_not_change_due(
    admin, rem, monkeypatch
):
    r = rem
    ordinary_call(
        admin,
        r,
        f"/obligations/{r['oid']}/adjust",
        new_total="500",
        new_due_on="2031-01-08",
        reason="Fecha pactada",
    )
    attention(admin, r)
    assert event(admin, r)["attention_state"] == "reviewed"
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 2, 16))
    assert event(admin, r)["attention_state"] == "reviewed"
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 5, 16))
    assert event(admin, r)["attention_state"] == "pending"
    attention(admin, r, "snoozed", until_on="2031-01-06")
    assert (
        event(admin, r)["attention_state"] == "snoozed"
        and event(admin, r)["due_on"] == "2031-01-08"
    )
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 6, 16))
    assert event(admin, r)["attention_state"] == "pending"
    attention(admin, r, "reviewed")
    attention(admin, r, "reopened")
    assert (
        event(admin, r)["attention_state"] == "pending"
        and money_state(admin, r)["obligations"][0]["pending"] == "500.00"
    )


@pytest.mark.parametrize("days", [7, 3, 1, 8])
def test_configured_notice_window(admin, rem, days):
    r = rem
    invoke(admin, r, "/preferences", **preference_body(admin, r, lead_days=[days]))
    assert event(admin, r)["requires_attention"] == (days >= 4)
    ordinary_call(
        admin,
        r,
        f"/obligations/{r['oid']}/adjust",
        new_total="500",
        new_due_on=f"2031-01-{days+1:02}",
        reason="Fecha para comprobar el hito",
    )
    assert event(admin, r)["requires_attention"]


def test_bolivia_business_midnight_is_authoritative(admin, rem, monkeypatch):
    r = rem
    ordinary_call(
        admin,
        r,
        f"/obligations/{r['oid']}/adjust",
        new_total="500",
        new_due_on="2031-01-02",
        reason="Vencimiento para prueba de zona",
    )
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 2, 3, 59, 59))
    assert (
        get(admin, r)["today"] == "2031-01-01"
        and event(admin, r)["priority"] == "upcoming"
    )
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 2, 4, 0, 0))
    assert (
        get(admin, r)["today"] == "2031-01-02"
        and event(admin, r)["priority"] == "today"
    )


def test_missing_due_stays_internal_and_does_not_invent_date(admin, rem):
    r = rem
    expense = ordinary_call(
        admin,
        r,
        "/expenses",
        person_id=r["owner"]["id"],
        currency="BOB",
        category_id=r["category"],
        description="Gasto registrado sin fecha pactada",
        recorded_on="2031-01-01",
        amount="100",
    )
    k = f"expense:{expense['expense_id']}"
    e = event(admin, r, k)
    assert e["due_on"] is None and e["priority"] == "date_missing"
    consent(admin, r, r["owner"]["id"], number="+12025550123")
    response = admin.get(
        "/api/v1" + r["rem"] + f"/notices/{k}/proposal?recipient_id={r['owner']['id']}"
    )
    assert response.status_code == 409


def test_services_owner_payment_recovery_partial_and_single_receipt_notice(
    admin, rem, monkeypatch
):
    r = rem
    receipt_, dist, result = services(admin, r, amount="240")
    oid = result["obligation_ids"][0]
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 5, 16))
    assert event(admin, r, f"debt:{oid}")["kind"] == "service"
    expense = next(
        e
        for e in money_state(admin, r)["expenses"]
        if e["receipt_id"] == receipt_["id"]
    )
    ordinary_call(
        admin,
        r,
        f"/expenses/{expense['id']}/pay",
        **ordinary_cash(r, 180, payer_id=r["owner"]["id"]),
    )
    e = event(admin, r, f"debt:{oid}")
    assert e["kind"] == "recovery" and e["amount"] == "120.00"
    pay(admin, r, 50, oid)
    assert event(admin, r, f"debt:{oid}")["amount"] == "70.00"
    provider = event(admin, r, f"receipt:{receipt_['id']}")
    assert (
        provider["recorded_amount"] == "240.00"
        and provider["paid"] == "180.00"
        and provider["amount"] == "60.00"
    )
    assert not any(
        e["key"] == f"expense:{expense['id']}" for e in get(admin, r)["items"]
    )


def test_payment_by_other_person_is_not_inferred_as_owner_reimbursement(
    admin, rem, monkeypatch
):
    r = rem
    receipt_, _, imported = services(admin, r, amount="240")
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 5, 16))
    expense = next(
        e
        for e in money_state(admin, r)["expenses"]
        if e["receipt_id"] == receipt_["id"]
    )
    k = f"debt:{imported['obligation_ids'][0]}"
    ordinary_call(
        admin,
        r,
        f"/expenses/{expense['id']}/pay",
        **ordinary_cash(r, 60, payer_id=r["occupant"]["id"]),
    )
    assert event(admin, r, k)["kind"] == "service"
    assert event(admin, r, k)["amount"] == "120.00"
    ordinary_call(
        admin,
        r,
        f"/expenses/{expense['id']}/pay",
        **ordinary_cash(r, 20, payer_id=r["owner"]["id"]),
    )
    assert event(admin, r, k)["kind"] == "recovery"
    assert event(admin, r, k)["amount"] == "120.00"


@pytest.mark.parametrize(
    "mode,included,policy",
    [
        ("daily", True, "occupant"),
        ("monthly", True, "occupant"),
        ("monthly", False, "owner"),
    ],
)
def test_exempt_services_never_become_tenant_reminders(
    admin, fin, monkeypatch, mode, included, policy
):
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 5, 16))
    rent(
        admin,
        fin,
        mode=mode,
        services_included=included,
        owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
    )
    if policy == "owner":
        configure(admin, fin, economic_policy="owner")
    r = receipt(admin, fin)
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    ordinary_call(
        admin,
        fin,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d["id"],
        owner_person_id=fin["owner"]["id"],
    )
    r = {**fin, "rem": f"/properties/{fin['property']['id']}/reminders"}
    assert not any(e["kind"] in ["service", "recovery"] for e in get(admin, r)["items"])
    assert any(e["kind"] == "provider" for e in get(admin, r)["items"])


def test_contract_extension_and_cancellation_update_same_source(
    admin, rem, monkeypatch
):
    r = rem
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 25, 16))
    k = f"contract:{r['c']['id']}"
    attention(admin, r, k=k)
    response = admin.post(
        f"/api/v1/contracts/{r['c']['id']}/actions",
        json={
            "action": "extend",
            "end_date": "2031-02-28",
            "expected_version": 1,
            "reason": "Prórroga vigente revisada",
        },
    )
    assert response.status_code == 200, response.text
    assert (
        event(admin, r, k)["due_on"] == "2031-02-28"
        and not event(admin, r, k)["requires_attention"]
    )
    future = post(
        admin,
        "/contracts",
        contract_body(
            r,
            unit_id=r["second"]["id"],
            mode="daily",
            price="50",
            services_included=True,
            start_date="2031-01-26",
            end_date="2031-01-27",
        ),
    )
    k = f"contract:{future['id']}"
    attention(admin, r, k=k)
    response = admin.post(
        f"/api/v1/contracts/{future['id']}/actions",
        json={
            "action": "cancel",
            "expected_version": 1,
            "reason": "Cancelación antes del ingreso",
        },
    )
    assert response.status_code == 200, response.text
    assert event(admin, r, k)["resolved"]


def test_consent_current_text_encoding_open_manual_and_correction(admin, rem, db):
    r = rem
    consent(admin, r)
    draft = get(
        admin, r, f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    assert "500,00" in draft["text"] and r["tenant"]["full_name"] in draft["text"]
    text = draft["text"] + "\nObservación: ¿Está de acuerdo? áéíóú & + #"
    created = prepare(admin, r, text=text)
    id = created["communication_id"]
    assert comm(admin, r, id)["state"] == "prepared"
    opened = comm_action(admin, r, id, "authorize_open")
    url = urlsplit(opened["url"])
    assert (
        url.scheme == "https" and url.netloc == "wa.me" and url.path == "/59171234567"
    )
    assert parse_qs(url.query)["text"] == [text]
    assert comm(admin, r, id)["state"] == "prepared"
    comm_action(
        admin,
        r,
        id,
        "opened",
        authorization_operation_id=opened["authorization_operation_id"],
    )
    assert (
        comm(admin, r, id)["state"] == "opened"
        and len(comm(admin, r, id)["events"]) == 1
    )
    comm_action(admin, r, id, "manual_sent", notes="Confirmación expresa del usuario")
    assert comm(admin, r, id)["state"] == "manual_sent"
    comm_action(
        admin,
        r,
        id,
        "correct_not_sent",
        notes="Confirmación equivocada; se conserva el evento anterior",
    )
    current = comm(admin, r, id)
    assert current["state"] == "not_sent" and len(current["events"]) == 3
    assert all(
        e["kind"] not in ["delivered", "read", "received"] for e in current["events"]
    )
    assert money_state(admin, r)["obligations"][0]["pending"] == "500.00"
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(fm.FinanceMovement)) == 0
        ops = list(s.scalars(select(m.ReminderOperation)))
        assert all(text not in o.result and "wa.me" not in o.result for o in ops)


def test_changed_balance_blocks_old_text_and_new_preparation_uses_current_money(
    admin, rem
):
    r = rem
    consent(admin, r)
    old = prepare(admin, r)["communication_id"]
    pay(admin, r, 200)
    response = admin.post(
        "/api/v1" + r["rem"] + f"/communications/{old}/actions",
        json={"request_key": key(), "expected_version": 1, "action": "authorize_open"},
    )
    assert response.status_code == 409 and "cambió" in response.text
    draft = get(
        admin, r, f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    assert "300,00" in draft["text"] and "500,00" not in draft["text"]
    new = prepare(admin, r)["communication_id"]
    assert new != old
    assert "wa.me" in comm_action(admin, r, new, "authorize_open")["url"]


def test_consent_required_revoked_and_replayed_open_cannot_bypass(admin, rem):
    r = rem
    response = admin.get(
        "/api/v1"
        + r["rem"]
        + f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    assert response.status_code == 409
    grant = consent(admin, r)
    id = prepare(admin, r)["communication_id"]
    body = {"request_key": key(), "expected_version": 1, "action": "authorize_open"}
    endpoint = "/api/v1" + r["rem"] + f"/communications/{id}/actions"
    assert admin.post(endpoint, json=body).status_code == 200
    invoke(
        admin,
        r,
        f"/consents/{grant['consent_id']}/revoke",
        expected_version=1,
        reason="La persona retiró expresamente su aceptación",
    )
    assert admin.post(endpoint, json=body).status_code == 409
    assert (
        event(admin, r)["requires_attention"]
        and money_state(admin, r)["obligations"][0]["pending"] == "500.00"
    )
    assert len(get(admin, r, f"/consents/{grant['consent_id']}/history")) == 2


def test_wrong_same_house_recipient_other_purpose_and_changed_number_are_blocked(
    admin, rem
):
    r = rem
    consent(admin, r, r["occupant"]["id"], number="+34612345678")
    response = admin.get(
        "/api/v1"
        + r["rem"]
        + f"/notices/{r['notice']}/proposal?recipient_id={r['occupant']['id']}"
    )
    assert response.status_code == 422
    consent(admin, r, purpose="contracts")
    response = admin.get(
        "/api/v1"
        + r["rem"]
        + f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}"
    )
    assert response.status_code == 409
    consent(admin, r)
    id = prepare(admin, r)["communication_id"]
    assert (
        admin.patch(
            f"/api/v1/persons/{r['tenant']['id']}", json={"whatsapp": "+59171234568"}
        ).status_code
        == 200
    )
    response = admin.post(
        "/api/v1" + r["rem"] + f"/communications/{id}/actions",
        json={"request_key": key(), "expected_version": 1, "action": "authorize_open"},
    )
    assert response.status_code == 409


def test_report_does_not_change_money_verified_link_idempotent_and_void_reactivates(
    admin, rem
):
    r = rem
    report = invoke(admin, r, "/payment-reports", **report_body(r))
    id = report["report_id"]
    assert event(admin, r, f"report:{id}")["report_state"] == "reported"
    assert money_state(admin, r)["summary"][0]["received"] == "0.00"
    move = pay(admin, r, 500)
    body = {
        "request_key": key(),
        "expected_version": 1,
        "action": "verified",
        "movement_id": move["movement_id"],
        "reason": "Comprobación manual del comprobante y aplicación real",
    }
    path = "/api/v1" + r["rem"] + f"/payment-reports/{id}/decisions"
    first = admin.post(path, json=body)
    assert first.status_code == 200, first.text
    second = admin.post(path, json=body)
    assert second.status_code == 200 and first.json() == second.json()
    assert get(admin, r, "/payment-reports")[0]["state"] == "verified"
    assert money_state(admin, r)["summary"][0]["received"] == "500.00"
    ordinary_call(
        admin,
        r,
        f"/movements/{move['movement_id']}/void",
        reason="Pago anulado con su historial",
    )
    assert event(admin, r, f"report:{id}")["report_state"] == "verification_invalid"
    assert event(admin, r)["amount"] == "500.00"


def test_reject_report_and_reject_wrong_cash_context(admin, rem):
    r = rem
    report = invoke(admin, r, "/payment-reports", **report_body(r, amount="100"))
    id = report["report_id"]
    invoke(
        admin,
        r,
        f"/payment-reports/{id}/decisions",
        expected_version=1,
        action="pending",
        reason="Comprobante pendiente de revisión",
    )
    wrong = pay(admin, r, 200)
    response = admin.post(
        "/api/v1" + r["rem"] + f"/payment-reports/{id}/decisions",
        json={
            "request_key": key(),
            "expected_version": 2,
            "action": "verified",
            "movement_id": wrong["movement_id"],
            "reason": "No coincide el importe",
        },
    )
    assert response.status_code == 409
    invoke(
        admin,
        r,
        f"/payment-reports/{id}/decisions",
        expected_version=2,
        action="rejected",
        reason="Comprobante no corresponde al pago informado",
    )
    assert get(admin, r, "/payment-reports")[0]["state"] == "rejected"
    assert (
        event(admin, r, f"report:{id}")["resolved"]
        and money_state(admin, r)["summary"][0]["received"] == "200.00"
    )


def test_report_free_concept_has_no_copied_account_and_requires_unique_real_payment(
    admin, rem, db
):
    r = rem
    report = invoke(
        admin,
        r,
        "/payment-reports",
        **report_body(
            r,
            obligation_id=None,
            person_id=r["tenant"]["id"],
            currency="BOB",
            amount="100",
        ),
    )
    with Session(db) as s:
        obj = s.get(m.ReportedPayment, report["report_id"])
        assert obj.account_id is not None and obj.obligation_id is None
        assert s.scalar(select(func.count()).select_from(fm.FinanceMovement)) == 0
    move = pay(admin, r, 100)
    invoke(
        admin,
        r,
        f"/payment-reports/{report['report_id']}/decisions",
        expected_version=1,
        action="verified",
        movement_id=move["movement_id"],
        reason="Ingreso real del concepto comprobado",
    )
    other = invoke(admin, r, "/payment-reports", **report_body(r, amount="100"))
    response = admin.post(
        "/api/v1" + r["rem"] + f"/payment-reports/{other['report_id']}/decisions",
        json={
            "request_key": key(),
            "expected_version": 1,
            "action": "verified",
            "movement_id": move["movement_id"],
            "reason": "Duplicado del mismo comprobante",
        },
    )
    assert response.status_code == 409


@pytest.mark.parametrize("role", ["property_admin", "operator", "owner"])
def test_scope_roles_and_no_impersonation_of_manual_confirmation(admin, rem, role):
    r = rem
    consent(admin, r)
    id = prepare(admin, r)["communication_id"]
    other = property_(
        admin, person(admin, "Dueña de otra casa"), "Casa ajena a los avisos"
    )
    account = user(
        admin,
        role,
        r["owner"]["id"] if role == "owner" else None,
        [r["property"]["id"]] if role != "owner" else [],
    )
    login_as(admin, account)
    assert get(admin, r)["items"]
    assert (
        admin.get(
            f"/api/v1/properties/{other['id']}/reminders/notices/{r['notice']}"
        ).status_code
        == 404
    )
    assert (
        admin.post(
            "/api/v1" + r["rem"] + f"/communications/{id}/actions",
            json={"request_key": key(), "expected_version": 1, "action": "manual_sent"},
        ).status_code
        == 403
    )
    pref = preference_body(admin, r)
    response = admin.post(
        "/api/v1" + r["rem"] + "/preferences", json={"request_key": key(), **pref}
    )
    assert response.status_code == (200 if role == "property_admin" else 403)
    if role == "owner":
        assert (
            admin.post(
                "/api/v1" + r["rem"] + "/payment-reports",
                json={"request_key": key(), **report_body(r)},
            ).status_code
            == 403
        )
        attention(admin, r)
    else:
        prepared = prepare(admin, r)
        assert prepared["communication_id"] != id


def test_operator_can_report_but_cannot_verify_and_internal_assignment_is_enforced(
    admin, rem
):
    r = rem
    operator = user(admin, "operator", property_ids=[r["property"]["id"]])
    manager = user(admin, "property_admin", property_ids=[r["property"]["id"]])
    invoke(
        admin,
        r,
        "/preferences",
        **preference_body(admin, r, recipient_user_ids=[manager["id"]]),
    )
    login_as(admin, operator)
    assert admin.get("/api/v1" + r["rem"]).status_code == 403
    report = invoke(admin, r, "/payment-reports", **report_body(r))
    response = admin.post(
        "/api/v1" + r["rem"] + f"/payment-reports/{report['report_id']}/decisions",
        json={
            "request_key": key(),
            "expected_version": 1,
            "action": "verified",
            "movement_id": 999,
            "reason": "Operador sin autorización",
        },
    )
    assert response.status_code == 403


@pytest.mark.parametrize("scenario", ["notice", "same_key", "prepare"])
@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_independent_reminder_actions_are_serialized(
    admin, rem, db, monkeypatch, scenario
):
    r = rem
    if scenario == "prepare":
        consent(admin, r)
    e = event(admin, r)
    if scenario == "prepare":
        suffix = "/messages"
        proposal = get(
            admin,
            r,
            f"/notices/{r['notice']}/proposal?recipient_id={r['tenant']['id']}",
        )
        body = {
            "expected_version": e["version"],
            "expected_fingerprint": e["source_fingerprint"],
            "expected_proposal_fingerprint": proposal["proposal_fingerprint"],
            "recipient_id": r["tenant"]["id"],
        }
    else:
        suffix = "/actions"
        body = {
            "expected_version": e["version"],
            "expected_fingerprint": e["attention_fingerprint"],
            "action": "reviewed",
        }
    barrier = Barrier(2)
    original = store.lock_property
    entered = local()

    def synchronized(*args, **kwargs):
        # Las consultas internas pueden volver a bloquear la misma propiedad
        # en la misma transacción. Sincronizar solo el ingreso de la solicitud.
        if not getattr(entered, "once", False):
            entered.once = True
            barrier.wait(timeout=15)
        return original(*args, **kwargs)

    monkeypatch.setattr(store, "lock_property", synchronized)
    shared = key()
    cookies = [dict(admin.cookies)]
    if scenario != "same_key":
        second_user = user(admin, "property_admin", property_ids=[r["property"]["id"]])
        with TestClient(app) as other:
            login_as(other, second_user)
            cookies.append(dict(other.cookies))
        assert cookies[0] != cookies[1]
    else:
        cookies.append(cookies[0])

    def run(n):
        with TestClient(app) as c:
            c.cookies.update(cookies[n - 1])
            return c.post(
                "/api/v1" + r["rem"] + f"/notices/{r['notice']}" + suffix,
                json={
                    "request_key": shared if scenario == "same_key" else key(),
                    **body,
                },
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(run, [1, 2]))
    statuses = sorted(v.status_code for v in responses)
    assert statuses == (
        [200, 200]
        if scenario == "same_key"
        else [201, 409] if scenario == "prepare" else [200, 409]
    ), [v.text for v in responses]
    if scenario == "same_key":
        assert responses[0].json() == responses[1].json()
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(m.ReminderNotice)) == 1
        assert s.scalar(select(func.count()).select_from(fm.FinanceMovement)) == 0
        assert s.scalar(select(func.count()).select_from(m.ReminderCommunication)) == (
            1 if scenario == "prepare" else 0
        )
        assert s.scalar(select(func.count()).select_from(m.ReminderAttentionEvent)) == (
            0 if scenario == "prepare" else 1
        )


@pytest.mark.parametrize(
    "endpoint",
    [
        "finances",
        "anticreticos",
        "reminders/preferences",
        "reminders/templates",
        "reminders/consents",
        "reminders/consent-history",
    ],
)
@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_parallel_finance_capital_and_reminder_reads_lock_property_first(
    admin, anti, db, endpoint
):
    capital_conditions(admin, anti)
    deliver(admin, anti, 50000)
    property_id = anti["property"]["id"]
    if endpoint == "reminders/consent-history":
        r = {**anti, "rem": f"/properties/{property_id}/reminders"}
        assert (
            admin.patch(
                f"/api/v1/persons/{r['tenant']['id']}",
                json={"whatsapp": "+59171234567"},
            ).status_code
            == 200
        )
        grant = invoke(
            admin,
            r,
            "/consents",
            expected_version=0,
            person_id=r["tenant"]["id"],
            purpose="capital",
            number="+59171234567",
            accepted_on=get(admin, r)["today"],
            method="Aceptación ficticia de concurrencia",
            explicitly_accepted=True,
        )
        endpoint = f"reminders/consents/{grant['consent_id']}/history"
    barrier = Barrier(2)
    first_locks = {}

    def before_execute(connection, cursor, statement, parameters, context, executemany):
        if "FOR UPDATE" in statement.upper() and id(connection) not in first_locks:
            first_locks[id(connection)] = statement
            barrier.wait(timeout=15)

    sqlalchemy_event.listen(db, "before_cursor_execute", before_execute)
    cookies = dict(admin.cookies)

    def run(path):
        with TestClient(app) as other:
            other.cookies.update(cookies)
            return other.get("/api/v1" + path)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(
                    run,
                    [
                        f"/properties/{property_id}/{endpoint}",
                        f"/properties/{property_id}/reminders",
                    ],
                )
            )
        assert [r.status_code for r in responses] == [200, 200]
        assert len(first_locks) == 2
        assert all("FROM properties" in sql for sql in first_locks.values())
    finally:
        sqlalchemy_event.remove(db, "before_cursor_execute", before_execute)


@pytest.mark.parametrize(
    "raw,bolivia,expected",
    [
        ("+591 71234567", False, "59171234567"),
        ("71234567", True, "59171234567"),
        ("+1 (202) 555-0123", False, "12025550123"),
        ("0034 612 345 678", False, "34612345678"),
    ],
)
def test_international_numbers_and_explicit_bolivia_prefix(raw, bolivia, expected):
    assert normalize_number(raw, bolivia) == expected


@pytest.mark.parametrize(
    "raw",
    ["71234567", "abc", "https://evil.example/123", "+59112", "000", "+99912345678"],
)
def test_invalid_numbers_cannot_create_click_to_chat(raw):
    with pytest.raises(HTTPException):
        normalize_number(raw)


def test_link_domain_and_template_placeholders_are_restricted():
    url = ClickToChat().build_link("12025550123", "á & ? #\nhttps://evil.example/")
    assert urlsplit(url).netloc == "wa.me" and parse_qs(urlsplit(url).query)[
        "text"
    ] == ["á & ? #\nhttps://evil.example/"]
    for body in [
        "Hola {person.__class__}",
        "Hola {amount:1000000}",
        "Hola {person!r}",
        "Hola {unknown}",
    ]:
        with pytest.raises(HTTPException):
            validate_template(body)
