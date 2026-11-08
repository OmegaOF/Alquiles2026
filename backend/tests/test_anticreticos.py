"""Capital real y acuerdos separados; repeticiones SQLite/MySQL y carreras reales."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from threading import Barrier
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.main import app
from app.models.finances import (
    FinanceMovement,
    FinanceIncoming,
    FinanceGuarantee,
    FinanceOperation,
)
from app.models import anticreticos as m
from app.services import finances as finance
from app.services import anticreticos as service
from test_phase1 import db, client, admin, post, person, property_, user, login_as
from test_tenancy import home, contract_body
from test_utilities import utility, receipt, rent, calculate, confirm, configure
from test_finances import (
    fin,
    cash as ordinary_cash,
    call as ordinary_call,
    state as ordinary_state,
)


def key():
    return uuid4().hex


@pytest.fixture
def anti(admin, fin, request):
    c = post(
        admin,
        "/contracts",
        contract_body(
            fin,
            mode="anticretico",
            price=None,
            services_included=getattr(request, "param", False),
            end_date="2032-01-31",
            owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
        ),
    )
    return {
        **fin,
        "contract": c,
        "path": f"/properties/{fin['property']['id']}/anticreticos/{c['id']}",
    }


def detail(admin, u):
    return admin.get("/api/v1" + u["path"]).json()


def version(admin, u):
    d = detail(admin, u)
    return {
        "expected_version": d["version"],
        "expected_contract_version": d["contract"]["version"],
    }


def conditions_body(u, **changes):
    return {
        "agreed_capital": "70000",
        "expected_delivery_on": "2031-01-01",
        "restitution_on": "2032-02-01",
        "allow_early_return": True,
        "conditions": "Acuerdo particular sujeto a revisión del propietario",
        "document_reference": "Documento externo de prueba",
        "holders": [
            {
                "person_id": u["tenant"]["id"],
                "beneficiary_person_id": u["tenant"]["id"],
                "assigned_amount": "70000",
            }
        ],
        "responsibles": [{"person_id": u["owner"]["id"], "assigned_amount": "70000"}],
        **changes,
    }


def call(admin, u, path, **body):
    return post(
        admin, u["path"] + path, {"request_key": key(), **version(admin, u), **body}
    )


def save(admin, u, **changes):
    return call(admin, u, "/conditions", **conditions_body(u, **changes))


def capital_body(u, amount, kind="delivery", **changes):
    return {
        "amount": str(amount),
        "currency": "BOB",
        "occurred_on": "2031-01-02" if kind == "delivery" else "2031-02-01",
        "method_id": u["method"],
        "payer_id": u["tenant"]["id"] if kind == "delivery" else u["owner"]["id"],
        "beneficiary_person_id": (
            u["owner"]["id"] if kind == "delivery" else u["tenant"]["id"]
        ),
        "allocations": [
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["owner"]["id"],
                "amount": str(amount),
            }
        ],
        **changes,
    }


def deliver(admin, u, amount, **changes):
    return call(admin, u, "/deliveries", **capital_body(u, amount, **changes))


def restitution(admin, u, amount, **changes):
    return call(admin, u, "/returns", **capital_body(u, amount, "return", **changes))


@pytest.mark.parametrize("whole", [False, True])
def test_existing_contract_and_agreement_do_not_imply_money(admin, anti, whole):
    u = anti
    if whole:
        c = post(
            admin,
            "/contracts",
            contract_body(
                u,
                property_id=u["property"]["id"],
                unit_id=None,
                mode="anticretico",
                price=None,
                status="draft",
                services_included=False,
            ),
        )
        u = {
            **u,
            "contract": c,
            "path": f"/properties/{u['property']['id']}/anticreticos/{c['id']}",
        }
    d = detail(admin, u)
    assert (
        d["state"] == "preparation" and d["conditions"] is None and d["movements"] == []
    )
    save(admin, u)
    d = detail(admin, u)
    assert (
        d["capital_agreed"] == "70000.00"
        and d["capital_received"] == d["capital_pending"] == "0.00"
    )
    assert d["capital_to_receive"] == "70000.00" and d["contract"]["price"] is None


def test_partial_deliveries_returns_and_reconciliation(admin, anti, db):
    u = anti
    save(admin, u)
    for amount in [20000, 30000, 20000]:
        deliver(admin, u, amount)
    restitution(admin, u, 10000)
    restitution(admin, u, 15000)
    d = detail(admin, u)
    assert (
        d["capital_received"] == "70000.00"
        and d["capital_returned"] == "25000.00"
        and d["capital_pending"] == "45000.00"
        and d["capital_to_receive"] == "0.00"
    )
    s = ordinary_state(admin, u)["summary"][0]
    assert (
        s["received"]
        == s["disbursed"]
        == s["guarantees_received"]
        == s["credit_available"]
        == "0.00"
    )
    assert (
        s["capital_received"] == d["capital_received"]
        and s["capital_returned"] == d["capital_returned"]
        and s["capital_pending"] == d["capital_pending"]
    )
    with Session(db) as session:
        assert session.scalar(select(func.count()).select_from(FinanceMovement)) == 5
        assert (
            session.scalar(select(func.count()).select_from(FinanceIncoming))
            == session.scalar(select(func.count()).select_from(FinanceGuarantee))
            == 0
        )


def test_partial_receipt_remains_separate_from_restitution_and_overpayment_blocked(
    admin, anti
):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    d = detail(admin, u)
    assert d["capital_to_receive"] == "20000.00" and d["capital_pending"] == "50000.00"
    bad = admin.post(
        "/api/v1" + u["path"] + "/deliveries",
        json={"request_key": key(), **version(admin, u), **capital_body(u, 25000)},
    )
    assert bad.status_code == 409
    save(
        admin,
        u,
        agreed_capital="80000",
        reason="Aumento expresamente acordado",
        holders=[
            {
                "person_id": u["tenant"]["id"],
                "beneficiary_person_id": u["tenant"]["id"],
                "assigned_amount": "80000",
            }
        ],
        responsibles=[{"person_id": u["owner"]["id"], "assigned_amount": "80000"}],
    )
    deliver(admin, u, 25000)
    assert detail(admin, u)["capital_received"] == "75000.00"


def test_return_limits_and_idempotence(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 70000)
    body = {
        "request_key": key(),
        **version(admin, u),
        **capital_body(u, 70000, "return"),
    }
    url = "/api/v1" + u["path"] + "/returns"
    first = admin.post(url, json=body)
    again = admin.post(url, json=body)
    assert (
        first.status_code == again.status_code == 201 and first.json() == again.json()
    )
    assert (
        detail(admin, u)["state"] == "returned"
        and detail(admin, u)["contract"]["status"] == "active"
    )
    assert (
        admin.post(
            url,
            json={
                **body,
                "request_key": key(),
                **version(admin, u),
                "amount": "1",
                "allocations": [
                    {
                        "holder_id": u["tenant"]["id"],
                        "responsible_id": u["owner"]["id"],
                        "amount": "1",
                    }
                ],
            },
        ).status_code
        == 409
    )


def test_explicit_multiple_holders_responsibles_and_payer_distinction(admin, anti):
    u = anti
    save(
        admin,
        u,
        agreed_capital="50000",
        holders=[
            {
                "person_id": u["tenant"]["id"],
                "beneficiary_person_id": u["occupant"]["id"],
                "assigned_amount": "30000",
            },
            {
                "person_id": u["owner"]["id"],
                "beneficiary_person_id": u["owner"]["id"],
                "assigned_amount": "20000",
            },
        ],
        responsibles=[
            {"person_id": u["owner"]["id"], "assigned_amount": "30000"},
            {"person_id": u["occupant"]["id"], "assigned_amount": "20000"},
        ],
    )
    parts = [
        {
            "holder_id": u["tenant"]["id"],
            "responsible_id": u["owner"]["id"],
            "amount": "30000",
        },
        {
            "holder_id": u["owner"]["id"],
            "responsible_id": u["occupant"]["id"],
            "amount": "20000",
        },
    ]
    deliver(admin, u, 50000, payer_id=u["occupant"]["id"], allocations=parts)
    restitution(
        admin,
        u,
        10000,
        payer_id=u["tenant"]["id"],
        beneficiary_person_id=u["occupant"]["id"],
        allocations=[{**parts[0], "amount": "10000"}],
    )
    d = detail(admin, u)
    assert d["capital_pending"] == "40000.00"
    assert {x["person_id"]: x["pending"] for x in d["responsibles"]} == {
        u["owner"]["id"]: "20000.00",
        u["occupant"]["id"]: "20000.00",
    }
    assert (
        d["movements"][0]["payer_id"] == u["occupant"]["id"]
        and d["movements"][1]["payer_id"] == u["tenant"]["id"]
    )


def test_incomplete_parties_and_wrong_sums_require_review(admin, anti):
    u = anti
    save(admin, u, holders=[], responsibles=[])
    assert detail(admin, u)["review_issues"]
    response = admin.post(
        "/api/v1" + u["path"] + "/deliveries",
        json={"request_key": key(), **version(admin, u), **capital_body(u, 100)},
    )
    assert response.status_code == 422
    response = admin.post(
        "/api/v1" + u["path"] + "/conditions",
        json={
            "request_key": key(),
            **version(admin, u),
            **conditions_body(
                u,
                holders=[
                    {
                        "person_id": u["tenant"]["id"],
                        "beneficiary_person_id": u["tenant"]["id"],
                        "assigned_amount": "1",
                    }
                ],
            ),
        },
    )
    assert response.status_code == 422


def test_occupation_finish_and_capital_dates_are_independent(admin, anti, monkeypatch):
    from app.services import tenancy

    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 15, 18))
    c = admin.post(
        f"/api/v1/contracts/{u['contract']['id']}/actions",
        json={
            "action": "finish",
            "end_date": "2031-02-10",
            "reason": "Finalización de ocupación",
        },
    )
    assert c.status_code == 200, c.text
    d = detail(admin, u)
    assert (
        d["capital_pending"] == "50000.00"
        and d["contract"]["actual_end_date"] == "2031-02-10"
    )
    restitution(admin, u, 50000)
    assert detail(admin, u)["contract"]["status"] == "finished"


def test_extend_uses_existing_availability_and_conditions_history(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    c = admin.post(
        f"/api/v1/contracts/{u['contract']['id']}/actions",
        json={
            "action": "extend",
            "end_date": "2032-02-29",
            "reason": "Prórroga de ocupación acordada",
            "expected_version": 1,
        },
    )
    assert c.status_code == 200, c.text
    save(
        admin,
        u,
        restitution_on="2032-03-15",
        reason="Nueva fecha de restitución pactada",
    )
    d = detail(admin, u)
    assert (
        d["conditions"]["restitution_on"] == "2032-03-15"
        and len(d["history"]) == 2
        and d["capital_received"] == "50000.00"
    )
    post(
        admin,
        "/contracts",
        contract_body(
            u, mode="daily", start_date="2032-03-01", end_date="2032-03-05", price="100"
        ),
    )
    bad = admin.post(
        f"/api/v1/contracts/{u['contract']['id']}/actions",
        json={
            "action": "extend",
            "end_date": "2032-03-04",
            "reason": "Prórroga incompatible",
            "expected_version": c.json()["version"],
        },
    )
    assert bad.status_code == 409


def test_correction_and_void_guards_preserve_history(admin, anti):
    u = anti
    save(admin, u)
    first = deliver(admin, u, 20000)
    call(
        admin,
        u,
        f"/movements/{first['movement_id']}/void",
        reason="Entrega real fue quince mil",
    )
    deliver(admin, u, 15000)
    returned = restitution(admin, u, 10000)
    current = next(
        m
        for m in detail(admin, u)["movements"]
        if m["kind"] == "delivery" and not m["void_operation_id"]
    )
    bad = admin.post(
        "/api/v1" + u["path"] + f"/movements/{current['id']}/void",
        json={
            "request_key": key(),
            **version(admin, u),
            "reason": "Produciría saldo negativo",
        },
    )
    assert bad.status_code == 409
    call(
        admin,
        u,
        f"/movements/{returned['movement_id']}/void",
        reason="Devolución real fue cinco mil",
    )
    restitution(admin, u, 5000)
    d = detail(admin, u)
    assert (
        d["capital_received"] == "15000.00"
        and d["capital_returned"] == "5000.00"
        and d["capital_pending"] == "10000.00"
        and len(d["movements"]) == 4
    )


def test_adjustments_are_explicit_non_cash_and_do_not_pay_services(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    adj = call(
        admin,
        u,
        "/adjustments",
        kind="settlement",
        effective_on="2031-01-15",
        document_reference="Acuerdo firmado externo",
        reason="Reducción expresa de restitución",
        allocations=[
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["owner"]["id"],
                "delta": "-10000",
            }
        ],
    )
    d = detail(admin, u)
    assert (
        d["capital_received"] == "50000.00"
        and d["capital_returned"] == "0.00"
        and d["capital_pending"] == "40000.00"
    )
    assert len(d["movements"]) == 1
    call(
        admin,
        u,
        f"/adjustments/{adj['adjustment_id']}/void",
        reason="Acuerdo anulado por las partes",
    )
    assert detail(admin, u)["capital_pending"] == "50000.00"
    call(
        admin,
        u,
        "/adjustments",
        kind="additional",
        effective_on="2031-01-15",
        document_reference="Otra obligación contractual explícita",
        reason="Obligación adicional documentada, sin interés automático",
        allocations=[
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["owner"]["id"],
                "delta": "1000",
            }
        ],
    )
    restitution(admin, u, 51000)
    assert (
        detail(admin, u)["capital_received"] == "50000.00"
        and detail(admin, u)["capital_pending"] == "0.00"
    )


def test_capital_cannot_be_applied_refunded_or_voided_as_ordinary_funds(admin, anti):
    u = anti
    save(admin, u)
    move = deliver(admin, u, 50000, reference="CAPITAL-EXTERNAL-001")
    r = receipt(admin, u)
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    imp = ordinary_call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d["id"],
        owner_person_id=u["owner"]["id"],
    )
    oid = imp["obligation_ids"][0]
    body = {
        "request_key": key(),
        "applications": [
            {
                "source_movement_id": move["movement_id"],
                "obligation_id": oid,
                "amount": "1",
            }
        ],
    }
    assert admin.post("/api/v1" + u["base"] + "/apply", json=body).status_code == 422
    refund = admin.post(
        "/api/v1" + u["base"] + f"/movements/{move['movement_id']}/refund",
        json={
            "request_key": key(),
            "reason": "No usar devolución ordinaria de capital",
            **ordinary_cash(u, 1, beneficiary_person_id=u["tenant"]["id"]),
        },
    )
    assert refund.status_code == 422
    assert (
        admin.post(
            "/api/v1" + u["base"] + f"/movements/{move['movement_id']}/void",
            json={"request_key": key(), "reason": "Usar operación equivocada"},
        ).status_code
        == 409
    )
    duplicate = admin.post(
        "/api/v1" + u["base"] + "/receive",
        json={
            "request_key": key(),
            "person_id": u["tenant"]["id"],
            "surplus": "advance",
            **ordinary_cash(u, 50000, reference="CAPITAL-EXTERNAL-001"),
        },
    )
    assert duplicate.status_code == 409
    assert (
        detail(admin, u)["capital_pending"] == "50000.00"
        and detail(admin, u)["service_obligations"][0]["pending"] == "150.00"
    )


def test_phase5_has_no_fiscal_legal_or_messaging_routes():
    from app.api.anticreticos import router
    # El módulo de fase 5 conserva su alcance. Fase 6 incorpora recordatorios
    # en su propio router; esta comprobación histórica no los prohíbe globalmente.
    routes = {route.path.lower() for route in router.routes if hasattr(route, "path")}
    assert not any(
        any(
            word in path
            for word in ("whatsapp", "reminder", "tribut", "fiscal", "notarial", "pdf")
        )
        for path in routes
    )


@pytest.mark.parametrize(
    "days,expected", [(14, "70.00"), (15, "150.00"), (16, "150.00")]
)
def test_anticretic_services_keep_fifteen_day_rule(
    admin, anti, days, expected, monkeypatch
):
    from app.services import tenancy

    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 2, 18))
    ended = admin.post(
        f"/api/v1/contracts/{u['contract']['id']}/actions",
        json={
            "action": "finish",
            "end_date": f"2031-01-{days:02}",
            "reason": "Salida efectiva registrada para el recibo",
        },
    )
    assert ended.status_code == 200, ended.text
    r = receipt(admin, u)
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    ordinary_call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d["id"],
        owner_person_id=u["owner"]["id"],
    )
    result = detail(admin, u)
    assert (
        result["capital_pending"] == "50000.00"
        and result["service_obligations"][0]["pending"] == expected
    )


def test_responsibility_reassignment_is_explicit_and_preserves_total(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    save(
        admin,
        u,
        reason="Dos responsables pactados expresamente",
        responsibles=[
            {"person_id": u["owner"]["id"], "assigned_amount": "40000"},
            {"person_id": u["occupant"]["id"], "assigned_amount": "30000"},
        ],
    )
    assert detail(admin, u)["capital_pending"] == "50000.00"
    adj = call(
        admin,
        u,
        "/adjustments",
        kind="reassignment",
        effective_on="2031-01-15",
        document_reference="Acuerdo de reasignación autorizado",
        reason="Veinte mil pasan al nuevo responsable",
        allocations=[
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["owner"]["id"],
                "delta": "-20000",
            },
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["occupant"]["id"],
                "delta": "20000",
            },
        ],
    )
    d = detail(admin, u)
    assert d["capital_pending"] == "50000.00" and d["capital_received"] == "50000.00"
    assert {x["person_id"]: x["pending"] for x in d["responsibles"]} == {
        u["owner"]["id"]: "30000.00",
        u["occupant"]["id"]: "20000.00",
    }
    deliver(
        admin,
        u,
        10000,
        occurred_on="2031-01-20",
        allocations=[
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["occupant"]["id"],
                "amount": "10000",
            }
        ],
    )
    assert detail(admin, u)["capital_pending"] == "60000.00"


def test_reduced_agreement_does_not_change_received_capital(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    body = conditions_body(
        u,
        agreed_capital="40000",
        reason="Nuevo acuerdo de capital",
        holders=[
            {
                "person_id": u["tenant"]["id"],
                "beneficiary_person_id": u["tenant"]["id"],
                "assigned_amount": "40000",
            }
        ],
        responsibles=[{"person_id": u["owner"]["id"], "assigned_amount": "40000"}],
    )
    response = admin.post(
        "/api/v1" + u["path"] + "/conditions",
        json={"request_key": key(), **version(admin, u), **body},
    )
    assert response.status_code == 422
    call(admin, u, "/conditions", **{**body, "acknowledge_received_excess": True})
    d = detail(admin, u)
    assert (
        d["capital_agreed"] == "40000.00"
        and d["capital_received"] == "50000.00"
        and d["capital_pending"] == "50000.00"
        and d["received_above_agreed"] == "10000.00"
    )


def test_currency_scope_and_operator_permissions(admin, anti):
    u = anti
    save(admin, u)
    bad = admin.post(
        "/api/v1" + u["path"] + "/deliveries",
        json={
            "request_key": key(),
            **version(admin, u),
            **capital_body(u, 1000, currency="USD"),
        },
    )
    assert bad.status_code == 422
    changed = admin.patch(
        f"/api/v1/contracts/{u['contract']['id']}",
        json={"expected_version": 1, "currency": "USD"},
    )
    assert changed.status_code == 409
    other = property_(admin, person(admin, "Propietaria ajena"), "Casa privada ajena")
    account = user(admin, "operator", property_ids=[u["property"]["id"]])
    login_as(admin, account)
    assert (
        admin.get(f"/api/v1/properties/{other['id']}/anticreticos").status_code == 404
    )
    deliver(admin, u, 1000)
    response = admin.post(
        "/api/v1" + u["path"] + "/returns",
        json={
            "request_key": key(),
            **version(admin, u),
            **capital_body(u, 1000, "return"),
        },
    )
    assert response.status_code == 403
    response = admin.post(
        "/api/v1" + u["path"] + "/conditions",
        json={
            "request_key": key(),
            **version(admin, u),
            **conditions_body(u, reason="Operador sin autorización"),
        },
    )
    assert response.status_code == 403


def test_wrong_beneficiary_early_return_and_chronology_are_checked(admin, anti):
    u = anti
    save(admin, u, allow_early_return=False)
    deliver(admin, u, 50000)
    response = admin.post(
        "/api/v1" + u["path"] + "/returns",
        json={
            "request_key": key(),
            **version(admin, u),
            **capital_body(u, 1000, "return"),
        },
    )
    assert response.status_code == 422
    save(
        admin,
        u,
        allow_early_return=True,
        reason="Se autoriza devolver antes del vencimiento",
    )
    for changes, expected in [
        ({"beneficiary_person_id": u["occupant"]["id"]}, 422),
        ({"occurred_on": "2030-12-31"}, 409),
    ]:
        response = admin.post(
            "/api/v1" + u["path"] + "/returns",
            json={
                "request_key": key(),
                **version(admin, u),
                **capital_body(u, 1000, "return", **changes),
            },
        )
        assert response.status_code == expected, response.text
    assert detail(admin, u)["capital_pending"] == "50000.00"


def test_overdue_and_settled_by_agreement_are_distinct_from_cash(
    admin, anti, monkeypatch
):
    u = anti
    save(admin, u)
    deliver(admin, u, 50000)
    monkeypatch.setattr(service, "today", lambda: date(2033, 1, 1))
    assert detail(admin, u)["state"] == "overdue"
    call(
        admin,
        u,
        "/adjustments",
        kind="settlement",
        effective_on="2031-02-01",
        document_reference="Acuerdo de liquidación autorizado",
        reason="Restitución liquidada mediante acuerdo explícito",
        allocations=[
            {
                "holder_id": u["tenant"]["id"],
                "responsible_id": u["owner"]["id"],
                "delta": "-50000",
            }
        ],
    )
    d = detail(admin, u)
    assert (
        d["state"] == "settled_by_agreement"
        and d["capital_returned"] == "0.00"
        and d["contract"]["status"] == "active"
    )


@pytest.mark.parametrize(
    "exemption,anti", [("included", True), ("owner", False)], indirect=["anti"]
)
def test_anticretic_included_or_owner_services_never_reduce_capital(
    admin, anti, exemption
):
    u = anti
    if exemption == "owner":
        configure(admin, u, economic_policy="owner")
    save(admin, u)
    deliver(admin, u, 50000)
    r = receipt(admin, u)
    distribution = calculate(admin, r)
    assert confirm(admin, distribution).status_code == 200
    ordinary_call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=distribution["id"],
        owner_person_id=u["owner"]["id"],
    )
    result = detail(admin, u)
    assert result["service_obligations"] == []
    assert result["capital_pending"] == "50000.00"
    restitution(admin, u, 50000)
    ordinary = ordinary_state(admin, u)
    assert ordinary["summary"][0]["pending"] == "0.00"
    assert ordinary["summary"][0]["capital_returned"] == "50000.00"


def test_delivery_replay_external_reference_and_audit(admin, anti, db):
    from app.models.entities import AuditEvent

    u = anti
    save(admin, u)
    body = {
        "request_key": key(),
        **version(admin, u),
        **capital_body(u, 1000, reference="EXTERNAL-CAPITAL-ONLY-ONE"),
    }
    first = admin.post("/api/v1" + u["path"] + "/deliveries", json=body)
    assert first.status_code == 201, first.text
    replay = admin.post("/api/v1" + u["path"] + "/deliveries", json=body)
    assert replay.status_code == 201 and replay.json() == first.json()
    duplicate = admin.post(
        "/api/v1" + u["path"] + "/deliveries",
        json={**body, "request_key": key(), **version(admin, u)},
    )
    assert duplicate.status_code == 409
    assert detail(admin, u)["capital_received"] == "1000.00"
    with Session(db) as s:
        assert s.scalar(select(func.count()).select_from(FinanceMovement)) == 1
        events = list(s.scalars(select(AuditEvent)))
        capital_events = [e for e in events if "anti-" in e.action]
        assert (
            len(capital_events) == 2
        )  # condiciones y una entrega, sin auditar reintentos como dinero nuevo


@pytest.mark.parametrize("role", ["property_admin", "owner", "operator"])
def test_capital_scope_nested_ids_and_sensitive_permissions(admin, anti, role):
    u = anti
    save(admin, u)
    deliver(admin, u, 1000)
    other = property_(
        admin, person(admin, "Persona de otra casa"), "Casa ajena de capital"
    )
    account = user(
        admin,
        role,
        u["owner"]["id"] if role == "owner" else None,
        [u["property"]["id"]] if role != "owner" else [],
    )
    login_as(admin, account)
    assert admin.get("/api/v1" + u["path"]).status_code == 200
    assert (
        admin.get(
            f"/api/v1/properties/{other['id']}/anticreticos/{u['contract']['id']}"
        ).status_code
        == 404
    )
    unknown = admin.post(
        "/api/v1" + u["path"] + "/movements/999999/void",
        json={
            "request_key": key(),
            **version(admin, u),
            "reason": "Identificador ajeno no disponible",
        },
    )
    assert unknown.status_code == (404 if role == "property_admin" else 403)
    response = admin.post(
        "/api/v1" + u["path"] + "/returns",
        json={
            "request_key": key(),
            **version(admin, u),
            **capital_body(u, 100, "return"),
        },
    )
    assert response.status_code == (
        201 if role == "property_admin" else 403
    ), response.text
    if role == "owner":
        response = admin.post(
            "/api/v1" + u["path"] + "/deliveries",
            json={"request_key": key(), **version(admin, u), **capital_body(u, 100)},
        )
        assert response.status_code == 403


def test_parties_with_pending_capital_cannot_be_silently_removed(admin, anti):
    u = anti
    save(admin, u)
    deliver(admin, u, 1000)
    response = admin.post(
        "/api/v1" + u["path"] + "/conditions",
        json={
            "request_key": key(),
            **version(admin, u),
            **conditions_body(
                u, reason="Intento de eliminar responsable pendiente", responsibles=[]
            ),
        },
    )
    assert response.status_code == 409
    assert detail(admin, u)["responsibles"][0]["person_id"] == u["owner"]["id"]


def test_capital_summary_keeps_currency_separate_and_excludes_void_cash(admin, anti):
    u = anti
    save(admin, u)
    erroneous = deliver(admin, u, 20000)
    call(
        admin,
        u,
        f"/movements/{erroneous['movement_id']}/void",
        reason="Corrección con historial",
    )
    deliver(admin, u, 15000)
    c = post(
        admin,
        "/contracts",
        contract_body(
            u,
            unit_id=u["second"]["id"],
            mode="anticretico",
            price=None,
            currency="USD",
            services_included=False,
        ),
    )
    second = {
        **u,
        "contract": c,
        "path": f"/properties/{u['property']['id']}/anticreticos/{c['id']}",
    }
    save(admin, second)
    deliver(admin, second, 500, currency="USD")
    listing = admin.get(f"/api/v1/properties/{u['property']['id']}/anticreticos").json()
    summary = {row["currency"]: row for row in listing["summary"]}
    assert summary["BOB"]["capital_received"] == "15000.00"
    assert summary["USD"]["capital_received"] == "500.00"
    ordinary = {row["currency"]: row for row in ordinary_state(admin, u)["summary"]}
    for currency in summary:
        assert (
            ordinary[currency]["capital_pending"]
            == summary[currency]["capital_pending"]
        )
        assert (
            ordinary[currency]["received"] == ordinary[currency]["disbursed"] == "0.00"
        )


@pytest.mark.parametrize("scenario", ["delivery", "return", "same_key"])
@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_independent_capital_races(admin, anti, db, monkeypatch, scenario):
    u = anti
    save(admin, u)
    if scenario == "return":
        deliver(admin, u, 50000)
    kind = "return" if scenario == "return" else "delivery"
    path = "/returns" if kind == "return" else "/deliveries"
    body = {**version(admin, u), **capital_body(u, 40000, kind)}
    original = finance.lock_property
    barrier = Barrier(2)

    def locked(*args):
        barrier.wait(timeout=20)
        return original(*args)

    monkeypatch.setattr(finance, "lock_property", locked)
    request_key = key()

    def run(i):
        with TestClient(app) as other:
            other.cookies.update(admin.cookies)
            return other.post(
                "/api/v1" + u["path"] + path,
                json={
                    "request_key": request_key if scenario == "same_key" else key(),
                    **body,
                },
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [0, 1]))
    assert sorted(r.status_code for r in results) == (
        [201, 201] if scenario == "same_key" else [201, 409]
    ), [r.text for r in results]
    if scenario == "same_key":
        assert results[0].json() == results[1].json()
    monkeypatch.setattr(finance, "lock_property", original)
    d = detail(admin, u)
    assert d["capital_pending"] == ("10000.00" if scenario == "return" else "40000.00")
