"""Obligaciones, caja, créditos y garantías; SQLite y MySQL independientes."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier
from uuid import uuid4
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from app.main import app
from app.models import finances as m
from app.schemas.finances import RentGeneration
from app.services import finances as f
from app.services.finance_periods import rent_preview
from test_phase1 import db, client, admin, post, person, property_, user, login_as
from test_utilities import (
    utility,
    receipt,
    rent,
    calculate,
    confirm,
    configure,
    receipt_body,
)
from test_tenancy import home


def key():
    return uuid4().hex


@pytest.fixture
def fin(admin, utility):
    method = post(admin, "/finances/catalogs/methods", {"name": "Efectivo de prueba"})
    category = post(
        admin, "/finances/catalogs/categories", {"name": "Reparaciones de prueba"}
    )
    post(admin, "/finances/catalogs/categories", {"name": "Servicios básicos"})
    return {
        **utility,
        "base": f"/properties/{utility['property']['id']}/finances",
        "method": method["id"],
        "category": category["id"],
    }


def call(admin, u, path, **body):
    return post(admin, u["base"] + path, {"request_key": key(), **body})


def state(admin, u):
    return admin.get("/api/v1" + u["base"]).json()


def cash(u, amount, **changes):
    return {
        "amount": str(amount),
        "currency": "BOB",
        "occurred_on": "2031-02-01",
        "method_id": u["method"],
        "payer_id": u["tenant"]["id"],
        **changes,
    }


def rental(admin, u, **changes):
    c = rent(admin, u, end_date="2031-01-31", price="500", **changes)
    result = call(
        admin,
        u,
        f"/contracts/{c['id']}/generate",
        expected_version=c["version"],
        through="2031-01-01",
    )
    return c, result["obligation_ids"][0]


def services(admin, u, amount="300"):
    r = receipt(admin, u, amount=amount)
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    result = call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d["id"],
        owner_person_id=u["owner"]["id"],
    )
    return r, d, result


@pytest.mark.parametrize(
    "mode,changes,expected",
    [
        ("daily", {"daily_count": "inclusive", "end_date": date(2031, 1, 3)}, "300.00"),
        ("daily", {"daily_count": "nights", "end_date": date(2031, 1, 3)}, "200.00"),
        ("weekly", {"end_date": date(2031, 1, 14)}, "200.00"),
        (
            "weekly",
            {"end_date": date(2031, 1, 10), "weekly_partial_allowed": True},
            "142.86",
        ),
        (
            "monthly",
            {
                "monthly_period": "anniversary",
                "start_date": date(2031, 1, 10),
                "end_date": date(2031, 2, 9),
            },
            "100.00",
        ),
        ("monthly", {"end_date": date(2031, 1, 31)}, "100.00"),
        (
            "monthly",
            {"start_date": date(2031, 1, 18), "end_date": date(2031, 1, 31)},
            "45.16",
        ),
    ],
)
def test_contract_price_rules(mode, changes, expected):
    c = SimpleNamespace(
        mode=mode,
        status="active",
        start_date=date(2031, 1, 1),
        end_date=date(2031, 1, 31),
        actual_end_date=None,
        price=Decimal(100),
        daily_count="inclusive",
        weekly_partial_allowed=False,
        monthly_period="calendar",
        first_period="prorated",
        due_day=5,
        payment_timing="advance",
        version=1,
        currency="BOB",
    )
    for name, value in changes.items():
        setattr(c, name, value)
    data = RentGeneration(
        request_key=key(),
        expected_version=1,
        through=date(2031, 12, 31),
        weekly_partial_rule="proportional",
        last_period_rule="proportional",
        reason="Condición acordada expresamente",
    )
    p = rent_preview(c, data)
    assert not p["issues"]
    assert sum((Decimal(r["amount"]) for r in p["periods"]), Decimal(0)) == Decimal(
        expected
    )


@pytest.mark.parametrize(
    "year,month,days,expected",
    [
        (2031, 2, 28, "75.00"),
        (2032, 2, 29, "72.41"),
        (2031, 4, 30, "70.00"),
        (2031, 1, 31, "67.74"),
    ],
)
def test_real_month_proportional(year, month, days, expected):
    c = SimpleNamespace(
        mode="monthly",
        status="active",
        start_date=date(year, month, days - 13),
        end_date=date(year, month, days),
        actual_end_date=None,
        price=Decimal(150),
        monthly_period="calendar",
        first_period="prorated",
        due_day=5,
        payment_timing="advance",
        version=1,
        currency="BOB",
    )
    p = rent_preview(
        c, RentGeneration(request_key=key(), expected_version=1, through=c.end_date)
    )
    assert p["periods"][0]["amount"] == expected


def test_generation_idempotence_and_missing_conditions(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    result = call(
        admin,
        u,
        f"/contracts/{c['id']}/generate",
        expected_version=c["version"],
        through="2031-01-01",
    )
    assert (
        result["obligation_ids"] == [oid] and len(state(admin, u)["obligations"]) == 1
    )
    assert state(admin, u)["summary"][0]["received"] == "0.00"
    c2 = rent(
        admin,
        u,
        unit_id=u["second"]["id"],
        mode="weekly",
        end_date="2031-01-10",
        weekly_partial_allowed=True,
    )
    bad = admin.post(
        "/api/v1" + u["base"] + f"/contracts/{c2['id']}/generate",
        json={"request_key": key(), "expected_version": 1, "through": "2031-01-31"},
    )
    assert bad.status_code == 422 and len(state(admin, u)["obligations"]) == 1


@pytest.mark.parametrize(
    "mode,included", [("daily", True), ("monthly", True), ("anticretico", True)]
)
def test_services_exemptions_and_owner_part(admin, fin, mode, included):
    u = fin
    rent(
        admin,
        u,
        mode=mode,
        services_included=included,
        end_date="2031-01-20",
        price=None if mode == "anticretico" else "100",
    )
    r, d, result = services(admin, u)
    assert result["obligation_ids"] == []
    s = state(admin, u)
    assert s["expenses"][0]["total"] == "300.00" and s["expenses"][0]["paid"] == "0.00"


def test_partial_multiple_payments_advance_and_void(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    r, d, imp = services(admin, u)
    service = imp["obligation_ids"][0]
    first = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "200"}],
        **cash(u, 200),
    )
    call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[
            {"obligation_id": oid, "amount": "300"},
            {"obligation_id": service, "amount": "150"},
        ],
        surplus="credit",
        **cash(u, 600),
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "800.00"
        and s["summary"][0]["credit_available"] == "150.00"
    )
    assert (
        s["summary"][0]["pending"] == "0.00"
        and s["summary"][0]["services_recovered"] == "150.00"
    )
    call(
        admin,
        u,
        f"/movements/{first['movement_id']}/void",
        reason="Importe registrado por error",
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "600.00"
        and s["summary"][0]["pending"] == "200.00"
    )
    credit = next(p for p in s["movements"] if p["available"] == "150.00")
    call(
        admin,
        u,
        "/apply",
        applications=[
            {"source_movement_id": credit["id"], "obligation_id": oid, "amount": "150"}
        ],
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "600.00"
        and s["summary"][0]["pending"] == "50.00"
    )


def test_surplus_explicit_and_no_overapplication(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    for amount, applied, surplus in [
        ("600", "500", "reject"),
        ("600", "600", "credit"),
    ]:
        response = admin.post(
            "/api/v1" + u["base"] + "/receive",
            json={
                "request_key": key(),
                "person_id": u["tenant"]["id"],
                "surplus": surplus,
                "applications": [{"obligation_id": oid, "amount": applied}],
                **cash(u, amount),
            },
        )
        assert response.status_code in {409, 422}
    assert state(admin, u)["movements"] == []
    result = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        surplus="credit",
        applications=[{"obligation_id": oid, "amount": "500"}],
        **cash(u, 600),
    )
    assert result["available"] == "100.00"
    result2 = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        surplus="advance",
        **cash(u, 300),
    )
    call(
        admin,
        u,
        f"/obligations/{oid}/adjust",
        new_total="1000",
        reason="Prórroga económica aprobada",
    )
    call(
        admin,
        u,
        "/apply",
        applications=[
            {
                "source_movement_id": result2["movement_id"],
                "obligation_id": oid,
                "amount": "300",
            }
        ],
    )
    assert state(admin, u)["summary"][0]["received"] == "900.00"


def test_guarantee_apply_refund_and_duplicate(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    g = call(
        admin,
        u,
        "/guarantees",
        person_id=u["tenant"]["id"],
        contract_id=c["id"],
        conditions="Garantía reembolsable al finalizar",
        **cash(u, 500),
    )
    assert state(admin, u)["summary"][0]["received"] == "0.00"
    call(
        admin,
        u,
        "/apply",
        applications=[
            {
                "source_movement_id": g["movement_id"],
                "obligation_id": oid,
                "amount": "100",
            }
        ],
        authorize_guarantee=True,
        reason="Aplicación autorizada por el titular",
    )
    body = {
        "request_key": key(),
        "reason": "Devolución parcial aprobada",
        "beneficiary_person_id": u["tenant"]["id"],
        **cash(u, 400, payer_id=u["owner"]["id"]),
    }
    path = "/api/v1" + u["base"] + f"/movements/{g['movement_id']}/refund"
    first = admin.post(path, json=body)
    again = admin.post(path, json=body)
    assert (
        first.status_code == again.status_code == 201 and first.json() == again.json()
    )
    bad = admin.post(path, json={**body, "request_key": key(), "amount": "1"})
    assert bad.status_code == 409
    s = state(admin, u)
    assert (
        s["summary"][0]["guarantees_available"] == "0.00"
        and s["summary"][0]["disbursed"] == "0.00"
    )
    assert (
        s["summary"][0]["refunded"] == "400.00"
        and s["summary"][0]["pending"] == "400.00"
    )


def test_expense_and_partial_disbursements(admin, fin):
    u = fin
    e = call(
        admin,
        u,
        "/expenses",
        person_id=u["owner"]["id"],
        category_id=u["category"],
        currency="BOB",
        amount="250",
        description="Reparación de tubería",
        recorded_on="2031-01-05",
    )
    assert state(admin, u)["summary"][0]["disbursed"] == "0.00"
    for amount in ["100", "150"]:
        call(
            admin,
            u,
            f"/expenses/{e['expense_id']}/pay",
            **cash(u, amount, payer_id=u["owner"]["id"]),
        )
    s = state(admin, u)
    assert (
        s["summary"][0]["expenses_registered"] == "250.00"
        and s["summary"][0]["disbursed"] == "250.00"
    )
    assert s["expenses"][0]["pending"] == "0.00"


def test_provider_payment_and_recovery_are_separate(admin, fin):
    u = fin
    rental(admin, u)
    r, d, imp = services(admin, u)
    call(
        admin,
        u,
        f"/expenses/{imp['expense_id']}/pay",
        **cash(
            u, 300, payer_id=u["owner"]["id"], beneficiary_label="Empresa eléctrica"
        ),
    )
    s = state(admin, u)
    assert s["summary"][0]["services_recovered"] == "0.00"
    oid = imp["obligation_ids"][0]
    call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "150"}],
        **cash(u, 150, beneficiary_person_id=u["owner"]["id"]),
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["disbursed"] == "300.00"
        and s["summary"][0]["services_recovered"] == "150.00"
    )


def test_tenant_direct_payment_is_not_owner_cash(admin, fin):
    u = fin
    rental(admin, u)
    r, d, imp = services(admin, u)
    call(
        admin,
        u,
        f"/expenses/{imp['expense_id']}/pay",
        is_direct=True,
        applications=[{"obligation_id": imp["obligation_ids"][0], "amount": "150"}],
        **cash(u, 150, document_reference="Referencia externa del pago directo"),
    )
    s = state(admin, u)
    assert s["summary"][0]["received"] == s["summary"][0]["disbursed"] == "0.00"
    assert (
        s["summary"][0]["services_direct"] == "150.00"
        and s["expenses"][0]["paid"] == "150.00"
    )


def test_reduce_paid_obligation_releases_credit_without_new_cash(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    p = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "500"}],
        **cash(u, 500),
    )
    call(
        admin,
        u,
        f"/obligations/{oid}/adjust",
        new_total="300",
        reason="Corrección justificada del importe",
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "500.00"
        and s["summary"][0]["credit_available"] == "200.00"
    )
    assert (
        len(s["movements"]) == 1 and s["obligations"][0]["original_amount"] == "500.00"
    )
    assert len(s["movements"][0]["applications"]) == 2


def test_substituted_distribution_adjusts_without_changing_payment(admin, fin):
    u = fin
    rental(admin, u)
    r, d, imp = services(admin, u)
    oid = imp["obligation_ids"][0]
    call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "150"}],
        **cash(u, 150),
    )
    current = admin.get(f"/api/v1/utility-receipts/{r['id']}").json()
    corrected = admin.patch(
        f"/api/v1/utility-receipts/{r['id']}",
        json={
            **receipt_body(amount="200"),
            "expected_version": current["version"],
            "reason": "Recibo corregido por el proveedor",
        },
    )
    assert corrected.status_code == 200
    d2 = calculate(
        admin, corrected.json(), adjustment=True, reason="Ajuste del recibo corregido"
    )
    assert confirm(admin, d2).status_code == 200
    second = call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d2["id"],
        owner_person_id=u["owner"]["id"],
        reason="Sustitución de distribución aprobada",
    )
    assert second["obligation_ids"] == [oid]
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "150.00"
        and s["summary"][0]["credit_available"] == "50.00"
    )
    assert (
        s["obligations"][0]["total"] == "500.00"
        and s["obligations"][1]["total"] == "100.00"
    )


def test_currency_owner_scope_and_operator_limits(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    p = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        surplus="advance",
        **cash(u, 100, currency="USD"),
    )
    bad = admin.post(
        "/api/v1" + u["base"] + "/apply",
        json={
            "request_key": key(),
            "applications": [
                {
                    "source_movement_id": p["movement_id"],
                    "obligation_id": oid,
                    "amount": "100",
                }
            ],
        },
    )
    assert bad.status_code == 422
    a = user(admin, "operator", property_ids=[u["property"]["id"]])
    foreign = property_(admin, person(admin, "Otra propietaria"), "Casa ajena")
    login_as(admin, a)
    assert admin.get(f"/api/v1/properties/{foreign['id']}/finances").status_code == 404
    assert (
        admin.post(
            "/api/v1" + u["base"] + f"/movements/{p['movement_id']}/void",
            json={"request_key": key(), "reason": "No autorizado"},
        ).status_code
        == 403
    )
    assert len(state(admin, u)["summary"]) == 2


def test_payment_correction_retains_original_and_avoids_duplicate_reference(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    call(
        admin,
        u,
        f"/obligations/{oid}/adjust",
        new_total="1000",
        reason="Condición económica aprobada",
    )
    body = {
        "request_key": key(),
        "person_id": u["tenant"]["id"],
        "applications": [{"obligation_id": oid, "amount": "800"}],
        **cash(u, 800, reference="TRANSFER-001"),
    }
    path = "/api/v1" + u["base"] + "/receive"
    first = admin.post(path, json=body)
    assert first.status_code == 201
    assert admin.post(path, json=body).json() == first.json()
    assert admin.post(path, json={**body, "request_key": key()}).status_code == 409
    call(
        admin,
        u,
        f"/movements/{first.json()['movement_id']}/void",
        reason="Importe correcto es seiscientos",
    )
    call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "600"}],
        **cash(u, 600, reference="TRANSFER-001"),
    )
    s = state(admin, u)
    assert len(s["movements"]) == 2
    assert (
        s["movements"][0]["amount"] == "800.00"
        and s["movements"][0]["state"] == "voided"
    )
    assert (
        s["summary"][0]["received"] == "600.00"
        and s["summary"][0]["pending"] == "400.00"
    )


def test_early_finish_and_changed_contract_preserve_finance_history(
    admin, fin, monkeypatch
):
    from app.services import tenancy
    from datetime import datetime

    u = fin
    c, oid = rental(admin, u)
    call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "500"}],
        **cash(u, 500),
    )
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 15, 18))
    result = admin.post(
        f"/api/v1/contracts/{c['id']}/actions",
        json={
            "action": "finish",
            "expected_version": 1,
            "end_date": "2031-01-14",
            "reason": "Salida anticipada acordada",
        },
    )
    assert result.status_code == 200, result.text
    call(
        admin,
        u,
        f"/contracts/{c['id']}/generate",
        expected_version=result.json()["version"],
        through="2031-01-31",
        last_period_rule="proportional",
        reason="Ajuste proporcional de salida anticipada",
    )
    s = state(admin, u)
    assert (
        s["obligations"][0]["id"] == oid
        and s["obligations"][0]["original_amount"] == "500.00"
    )
    assert (
        s["obligations"][0]["total"] == "225.81"
        and s["summary"][0]["credit_available"] == "274.19"
    )


def test_guarantee_release_stays_guarantee_and_credit_refund_is_real(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    g = call(
        admin,
        u,
        "/guarantees",
        person_id=u["tenant"]["id"],
        contract_id=c["id"],
        conditions="Garantía y devolución pactadas",
        **cash(u, 500),
    )
    call(
        admin,
        u,
        "/apply",
        applications=[
            {
                "source_movement_id": g["movement_id"],
                "obligation_id": oid,
                "amount": "400",
            }
        ],
        authorize_guarantee=True,
        reason="Aplicación de garantía autorizada",
    )
    call(
        admin,
        u,
        f"/obligations/{oid}/adjust",
        new_total="300",
        reason="Reducción autorizada del importe",
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["guarantees_available"] == "200.00"
        and s["summary"][0]["credit_available"] == "0.00"
    )
    p = call(
        admin,
        u,
        "/receive",
        person_id=u["tenant"]["id"],
        surplus="advance",
        **cash(u, 100),
    )
    call(
        admin,
        u,
        f"/movements/{p['movement_id']}/refund",
        reason="Devolución real del anticipo",
        **cash(
            u, 100, payer_id=u["owner"]["id"], beneficiary_person_id=u["tenant"]["id"]
        ),
    )
    s = state(admin, u)
    assert (
        s["summary"][0]["received"] == "100.00"
        and s["summary"][0]["refunded"] == "100.00"
    )


def test_property_owner_reads_without_write_and_nested_ids_are_scoped(admin, fin):
    u = fin
    c, oid = rental(admin, u)
    owner = user(admin, "owner", person_id=u["owner"]["id"])
    other = property_(admin, person(admin, "Otra propietaria"), "Otra casa")
    login_as(admin, owner)
    assert admin.get("/api/v1" + u["base"]).status_code == 200
    assert (
        admin.post(
            "/api/v1" + u["base"] + "/receive",
            json={
                "request_key": key(),
                "person_id": u["tenant"]["id"],
                "surplus": "advance",
                **cash(u, 100),
            },
        ).status_code
        == 403
    )
    assert admin.get(f"/api/v1/properties/{other['id']}/finances").status_code == 404


def test_no_tax_routes_or_anticretic_capital(admin, fin):
    u = fin
    c = rent(admin, u, mode="anticretico", price=None)
    response = admin.post(
        "/api/v1" + u["base"] + f"/contracts/{c['id']}/generate",
        json={"request_key": key(), "expected_version": 1, "through": "2031-01-31"},
    )
    assert response.status_code == 422 and state(admin, u)["movements"] == []
    routes = [r.path.lower() for r in app.routes if hasattr(r, "path")]
    assert not any(
        any(
            word in p for word in ["/tax", "/invoice", "/fiscal", "/anticretic-capital"]
        )
        for p in routes
    )


def test_provider_can_be_paid_before_distribution_without_duplicate_expense(admin, fin):
    u = fin
    rental(admin, u)
    r = receipt(admin, u)
    result = call(
        admin,
        u,
        f"/receipts/{r['id']}/expense",
        expected_version=r["version"],
        owner_person_id=u["owner"]["id"],
    )
    assert result["obligations_created"] is False
    call(
        admin,
        u,
        f"/expenses/{result['expense_id']}/pay",
        **cash(u, 300, payer_id=u["owner"]["id"]),
    )
    s = state(admin, u)
    assert len(s["obligations"]) == 1 and s["summary"][0]["disbursed"] == "300.00"
    # La única obligación previa es alquiler; todavía no hay cobro por servicio.
    assert all(o["service_origin_id"] is None for o in s["obligations"])
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    result2 = call(
        admin,
        u,
        f"/receipts/{r['id']}/import",
        expected_distribution_id=d["id"],
        owner_person_id=u["owner"]["id"],
    )
    s = state(admin, u)
    assert result2["expense_id"] == result["expense_id"] and len(s["expenses"]) == 1
    assert (
        s["expenses"][0]["paid"] == "300.00"
        and s["summary"][0]["disbursed"] == "300.00"
    )


@pytest.mark.parametrize("scenario", ["receive", "refund", "same_key"])
@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_independent_concurrent_money(admin, fin, db, monkeypatch, scenario):
    u = fin
    c, oid = rental(admin, u)
    if scenario == "refund":
        g = call(
            admin,
            u,
            "/guarantees",
            person_id=u["tenant"]["id"],
            contract_id=c["id"],
            conditions="Garantía reembolsable",
            **cash(u, 500),
        )
        path = f"/movements/{g['movement_id']}/refund"
        body = {
            "reason": "Devolución autorizada",
            "beneficiary_person_id": u["tenant"]["id"],
            **cash(u, 400, payer_id=u["owner"]["id"]),
        }
    else:
        path = "/receive"
        body = {
            "person_id": u["tenant"]["id"],
            "applications": [{"obligation_id": oid, "amount": "400"}],
            **cash(u, 400),
        }
    original = f.lock_property
    barrier = Barrier(2)

    def locked(*args):
        barrier.wait(timeout=20)
        return original(*args)

    monkeypatch.setattr(f, "lock_property", locked)
    request_key = key()

    def run(index):
        with TestClient(app) as other:
            other.cookies.update(admin.cookies)
            return other.post(
                "/api/v1" + u["base"] + path,
                json={
                    **body,
                    "request_key": request_key if scenario == "same_key" else key(),
                },
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, [0, 1]))
    codes = sorted(r.status_code for r in results)
    assert codes == ([201, 201] if scenario == "same_key" else [201, 409]), [
        r.text for r in results
    ]
    if scenario == "same_key":
        assert results[0].json() == results[1].json()
    monkeypatch.setattr(f, "lock_property", original)
    s = state(admin, u)
    assert (
        s["summary"][0]["guarantees_available"] == "100.00"
        if scenario == "refund"
        else s["summary"][0]["received"] == "400.00"
    )
