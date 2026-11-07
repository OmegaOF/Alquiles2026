"""Reglas de servicios y recibos, repetidas en SQLite y MySQL descartable."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from test_phase1 import db, client, admin, post, person, property_, user, login_as
from test_tenancy import home, contract_body
from app.main import app
from app.models.utilities import (
    UtilityReceipt,
    UtilityDistribution,
    UtilityCurrentDistribution,
    UtilityResponsibility,
    UtilityAllocation,
)
from app.services import utilities as registry
from app.services import utility_distribution as service


@pytest.fixture
def utility(admin, home):
    type_ = post(admin, "/utility-types", {"name": "Electricidad de prueba"})
    body = {
        "type_id": type_["id"],
        "label": "Electricidad compartida",
        "provider": "Proveedor de prueba",
        "account_number": "TEST-001",
        "measurement_kind": "shared",
        "measure_unit": "kWh",
        "start_date": "2020-01-01",
        "configuration": {
            "method": "equal",
            "unit_ids": [home["first"]["id"], home["second"]["id"]],
            "owner_person_id": home["owner"]["id"],
            "provider_payer_id": home["owner"]["id"],
            "reimbursement_person_id": home["owner"]["id"],
        },
    }
    account = post(
        admin, f"/properties/{home['property']['id']}/service-accounts", body
    )
    return {**home, "account": account, "account_body": body}


def receipt_body(**changes):
    body = {
        "external_reference": "REC-001",
        "amount": "300.00",
        "currency": "BOB",
        "issued_on": "2031-01-31",
        "period_start": "2031-01-01",
        "period_end": "2031-01-30",
        "due_on": "2031-02-10",
    }
    body.update(changes)
    return body


def receipt(admin, u, **changes):
    return post(
        admin,
        f"/service-accounts/{u['account']['id']}/receipts",
        receipt_body(**changes),
    )


def rent(admin, u, **changes):
    data = {
        "mode": "monthly",
        "start_date": "2031-01-01",
        "end_date": "2031-01-30",
        "monthly_period": "calendar",
        "first_period": "full",
        "due_day": 5,
        "services_included": False,
    }
    data.update(changes)
    if data["mode"] != "monthly":
        for key in ["monthly_period", "first_period", "due_day"]:
            data[key] = None
    if data["mode"] == "daily":
        data["services_included"] = True
    return post(admin, "/contracts", contract_body(u, **data))


def configure(admin, u, **changes):
    account = next(
        a
        for a in admin.get("/api/v1/service-accounts").json()
        if a["id"] == u["account"]["id"]
    )
    body = {
        key: value
        for key, value in account["configuration"].items()
        if key
        in [
            "method",
            "unit_ids",
            "percentages",
            "economic_policy",
            "owner_person_id",
            "provider_payer_id",
            "reimbursement_person_id",
            "notes",
        ]
    }
    body.update(changes)
    body["expected_version"] = account["version"]
    account = post(admin, f"/service-accounts/{account['id']}/configurations", body)
    u["account"] = account
    return account


def calculate(admin, r, **changes):
    current = admin.get(f"/api/v1/utility-receipts/{r['id']}").json()
    return post(
        admin,
        f"/utility-receipts/{r['id']}/calculate",
        {"expected_version": current["version"], "request_key": uuid4().hex, **changes},
    )


def confirm(admin, d):
    return admin.post(
        f"/api/v1/utility-distributions/{d['id']}/confirm",
        json={
            "expected_version": d["version"],
            "expected_receipt_version": d["receipt_version"],
        },
    )


def sum_kind(d, kind):
    return sum(
        (
            Decimal(r["amount"])
            for a in d["allocations"]
            for r in a["responsibilities"]
            if r["kind"] == kind
        ),
        Decimal(0),
    )


def test_individual_water_and_fixed_service_without_meter(admin, utility):
    u = utility
    water = post(admin, "/utility-types", {"name": "Agua de prueba"})
    body = {
        **u["account_body"],
        "type_id": water["id"],
        "label": "Agua individual",
        "account_number": "AGUA",
        "measure_unit": None,
        "measurement_kind": "individual",
        "configuration": {
            "method": "equal",
            "unit_ids": [u["first"]["id"]],
            "owner_person_id": u["owner"]["id"],
        },
    }
    a = post(admin, f"/properties/{u['property']['id']}/service-accounts", body)
    r = post(admin, f"/service-accounts/{a['id']}/receipts", receipt_body(amount="80"))
    d = calculate(admin, r)
    assert sum_kind(d, "owner") == 80 and d["payment_recorded"] is False
    assert admin.get(f"/api/v1/service-accounts/{a['id']}/meters").json() == []
    assert confirm(admin, d).status_code == 200
    assert (
        admin.patch(
            f"/api/v1/service-accounts/{a['id']}",
            json={"is_active": False, "expected_version": a["version"]},
        ).status_code
        == 200
    )
    assert admin.get(f"/api/v1/utility-receipts/{r['id']}").status_code == 200


@pytest.mark.parametrize(
    "days,expected", [(14, "70.00"), (15, "150.00"), (16, "150.00")]
)
def test_equal_distribution_fifteen_day_threshold(admin, utility, days, expected):
    u = utility
    rent(admin, u, end_date=f"2031-01-{days:02}")
    d = calculate(admin, receipt(admin, u))
    assert d["status"] == "calculated"
    assert sum_kind(d, "occupant") == Decimal(expected)
    assert sum_kind(d, "owner") == Decimal(300) - Decimal(expected)
    assert Decimal(d["assigned_total"]) == Decimal(d["responsibility_total"]) == 300


def test_required_300_example_two_rooms_14_and_15(admin, utility):
    u = utility
    rent(admin, u, end_date="2031-01-14")
    rent(admin, u, unit_id=u["second"]["id"], end_date="2031-01-15")
    d = calculate(admin, receipt(admin, u))
    assert sum_kind(d, "occupant") == 220 and sum_kind(d, "owner") == 80
    assert confirm(admin, d).status_code == 200


@pytest.mark.parametrize(
    "start,end,denominator,expected",
    [
        ("2031-02-01", "2031-02-28", 28, "75.00"),
        ("2032-02-01", "2032-02-29", 29, "72.41"),
        ("2031-04-01", "2031-04-30", 30, "70.00"),
        ("2031-01-01", "2031-01-31", 31, "67.74"),
    ],
)
def test_real_period_days(admin, utility, start, end, denominator, expected):
    u = utility
    rent(
        admin,
        u,
        start_date=start,
        end_date=(date.fromisoformat(start) + timedelta(days=13)).isoformat(),
    )
    r = receipt(
        admin,
        u,
        period_start=start,
        period_end=end,
        issued_on=end,
        due_on=(date.fromisoformat(end) + timedelta(days=10)).isoformat(),
    )
    d = calculate(admin, r)
    assert d["evidence"]["period_days"] == denominator
    assert sum_kind(d, "occupant") == Decimal(expected)
    assert Decimal(d["assigned_total"]) == Decimal(d["responsibility_total"]) == 300


@pytest.mark.parametrize(
    "mode,included",
    [("daily", True), ("weekly", True), ("monthly", True), ("anticretico", False)],
)
def test_daily_long_and_included_contracts(admin, utility, mode, included):
    u = utility
    rent(
        admin,
        u,
        mode=mode,
        end_date="2031-01-20",
        weekly_partial_allowed=True if mode == "weekly" else None,
        price=None if mode == "anticretico" else "100",
        services_included=included,
    )
    d = calculate(admin, receipt(admin, u))
    assert sum_kind(d, "occupant") == (150 if mode == "anticretico" else 0)
    assert d["payment_recorded"] is False


def test_owner_service_and_vacancy_never_becomes_tenant_responsibility(admin, utility):
    u = utility
    rent(admin, u)
    configure(admin, u, economic_policy="owner")
    d = calculate(admin, receipt(admin, u))
    assert sum_kind(d, "owner") == 300 and sum_kind(d, "occupant") == 0
    assert confirm(admin, d).status_code == 200


def test_percentages_and_configuration_history(admin, utility):
    u = utility
    first = u["account"]["configuration"]["id"]
    configure(
        admin,
        u,
        method="percentage",
        percentages=[
            {"unit_id": u["first"]["id"], "percentage": "30"},
            {"unit_id": u["second"]["id"], "percentage": "70"},
        ],
    )
    d = calculate(admin, receipt(admin, u))
    assert [Decimal(a["amount"]) for a in d["allocations"]] == [90, 210]
    history = admin.get(
        f"/api/v1/service-accounts/{u['account']['id']}/configurations"
    ).json()
    assert len(history) == 2 and history[0]["id"] == first
    invalid = admin.post(
        f"/api/v1/service-accounts/{u['account']['id']}/configurations",
        json={
            "method": "percentage",
            "unit_ids": [u["first"]["id"]],
            "percentages": [{"unit_id": u["first"]["id"], "percentage": 90}],
            "expected_version": u["account"]["version"],
        },
    )
    assert invalid.status_code == 422


def test_occupants_use_explicit_person_days(admin, utility):
    u = utility
    rent(admin, u, occupant_ids=[u["occupant"]["id"]])
    rent(admin, u, unit_id=u["second"]["id"])
    configure(admin, u, method="occupants")
    d = calculate(admin, receipt(admin, u))
    assert d["evidence"]["occupant_basis"] == "person_days"
    assert [Decimal(a["amount"]) for a in d["allocations"]] == [200, 100]


def meter(admin, u, unit, serial, initial="0", installed="2031-01-01", replaces=None):
    return post(
        admin,
        f"/service-accounts/{u['account']['id']}/meters",
        {
            "unit_id": unit,
            "serial": serial,
            "installed_on": installed,
            "initial_value": initial,
            "replaces_id": replaces,
        },
    )


def reading(admin, m, on, value):
    return post(
        admin,
        f"/utility-meters/{m['id']}/readings",
        {"recorded_on": on, "value": value},
    )


def test_meter_readings_distribution_fixed_and_variable(admin, utility):
    u = utility
    configure(admin, u, method="readings")
    a = meter(admin, u, u["first"]["id"], "A", "10")
    b = meter(admin, u, u["second"]["id"], "B", "100")
    reading(admin, a, "2031-01-30", "20")
    reading(admin, b, "2031-01-30", "130")
    d = calculate(admin, receipt(admin, u, fixed_amount="60", consumption="40"))
    assert [Decimal(a["amount"]) for a in d["allocations"]] == [90, 210]
    assert d["status"] == "calculated" and len(d["evidence"]["readings"]) == 4
    assert confirm(admin, d).status_code == 200
    assert (
        admin.post(
            f"/api/v1/utility-meters/{a['id']}/readings",
            json={"recorded_on": "2031-01-15", "value": "5"},
        ).status_code
        == 422
    )
    assert (
        admin.post(
            f"/api/v1/utility-meters/{a['id']}/readings",
            json={"recorded_on": "2031-01-15", "value": "25"},
        ).status_code
        == 422
    )
    assert (
        admin.post(
            f"/api/v1/utility-meters/{a['id']}/readings",
            json={"recorded_on": "2031-01-30", "value": "20"},
        ).status_code
        == 409
    )


def test_meter_replacement_preserves_segments(admin, utility):
    u = utility
    configure(admin, u, method="readings")
    a = meter(admin, u, u["first"]["id"], "OLD", "100")
    reading(admin, a, "2031-01-15", "150")
    new = meter(admin, u, u["first"]["id"], "NEW", "0", "2031-01-15", a["id"])
    reading(admin, new, "2031-01-30", "90")
    b = meter(admin, u, u["second"]["id"], "B")
    reading(admin, b, "2031-01-30", "140")
    d = calculate(admin, receipt(admin, u, consumption="280"))
    assert d["status"] == "calculated" and [
        Decimal(a["amount"]) for a in d["allocations"]
    ] == [150, 150]
    assert (
        len(admin.get(f"/api/v1/service-accounts/{u['account']['id']}/meters").json())
        == 3
    )
    assert len(admin.get(f"/api/v1/utility-meters/{a['id']}/readings").json()) == 2


def test_missing_readings_require_manual_review(admin, utility):
    u = utility
    configure(admin, u, method="readings")
    d = calculate(admin, receipt(admin, u))
    assert d["status"] == "needs_review" and confirm(admin, d).status_code == 409


def test_manual_base_allocation(admin, utility):
    u = utility
    configure(admin, u, method="manual")
    d = calculate(
        admin,
        receipt(admin, u),
        manual_amounts=[
            {"unit_id": u["first"]["id"], "amount": "100"},
            {"unit_id": u["second"]["id"], "amount": "200"},
        ],
        reason="Reparto específico del periodo",
    )
    assert d["status"] == "calculated" and [
        Decimal(a["amount"]) for a in d["allocations"]
    ] == [100, 200]


@pytest.mark.parametrize(
    "first_end,second_start,second_end,review",
    [
        ("2031-01-10", "2031-01-11", "2031-01-20", False),
        ("2031-01-15", "2031-01-16", "2031-01-30", True),
    ],
)
def test_successive_contracts_theoretical_and_review(
    admin, utility, first_end, second_start, second_end, review
):
    u = utility
    rent(admin, u, end_date=first_end)
    rent(
        admin,
        u,
        start_date=second_start,
        end_date=second_end,
        responsible_person_id=u["occupant"]["id"],
    )
    d = calculate(admin, receipt(admin, u))
    assert (d["status"] == "needs_review") is review
    assert Decimal(d["responsibility_total"]) == 300
    if review:
        assert confirm(admin, d).status_code == 409
        space = d["evidence"]["spaces"][0]
        assert Decimal(space["theoretical_total"]) == 300 and space["over_available"]
    else:
        assert sum_kind(d, "occupant") == 100 and sum_kind(d, "owner") == 200


def resolve_owner_only(admin, d, u):
    return admin.post(
        f"/api/v1/utility-distributions/{d['id']}/resolve",
        json={
            "expected_version": d["version"],
            "expected_receipt_version": d["receipt_version"],
            "reason": "El propietario asume los importes revisados",
            "responsibilities": [
                {
                    "allocation_id": a["id"],
                    "kind": "owner",
                    "person_id": u["owner"]["id"],
                    "amount": a["amount"],
                }
                for a in d["allocations"]
            ],
        },
    )


def test_manual_resolution_audited_and_daily_cannot_be_charged(admin, utility):
    u = utility
    daily = rent(admin, u, mode="daily", end_date="2031-01-20")
    configure(admin, u, owner_person_id=None)
    d = calculate(admin, receipt(admin, u))
    assert d["status"] == "needs_review"
    bad = admin.post(
        f"/api/v1/utility-distributions/{d['id']}/resolve",
        json={
            "expected_version": d["version"],
            "expected_receipt_version": d["receipt_version"],
            "reason": "Intento de gasto adicional",
            "responsibilities": [
                {
                    "allocation_id": a["id"],
                    "kind": "occupant",
                    "person_id": u["tenant"]["id"],
                    "contract_id": daily["id"],
                    "amount": a["amount"],
                }
                for a in d["allocations"]
            ],
        },
    )
    assert bad.status_code == 422
    result = resolve_owner_only(admin, d, u)
    assert result.status_code == 200, result.text
    reviewed = result.json()
    assert reviewed["evidence"]["manual_resolution"]["reason"]
    assert confirm(admin, reviewed).status_code == 200


def test_whole_house_is_a_single_space(admin, utility):
    u = utility
    rent(admin, u, unit_id=None, property_id=u["property"]["id"])
    d = calculate(admin, receipt(admin, u))
    assert len(d["allocations"]) == 1 and d["allocations"][0]["unit_id"] is None
    assert sum_kind(d, "occupant") == 300


def test_cent_rounding_is_deterministic_and_exact(admin, utility):
    u = utility
    rent(admin, u, end_date="2031-01-14")
    r = receipt(admin, u, amount="0.03")
    d = calculate(admin, r)
    assert [a["amount"] for a in d["allocations"]] == ["0.02", "0.01"]
    assert Decimal(d["responsibility_total"]) == Decimal("0.03")
    again = calculate(admin, r)
    assert [a["amount"] for a in again["allocations"]] == ["0.02", "0.01"]


def test_receipt_corrections_and_approved_history(admin, utility):
    u = utility
    r = receipt(admin, u)
    d = calculate(admin, r)
    assert confirm(admin, d).status_code == 200
    current = admin.get(f"/api/v1/utility-receipts/{r['id']}").json()
    blocked = admin.post(
        f"/api/v1/utility-receipts/{r['id']}/calculate",
        json={"expected_version": current["version"]},
    )
    assert blocked.status_code == 409
    correction = admin.patch(
        f"/api/v1/utility-receipts/{r['id']}",
        json={
            **receipt_body(amount="330"),
            "expected_version": current["version"],
            "reason": "Corrección del importe del recibo externo",
        },
    )
    assert correction.status_code == 200 and correction.json()["revision"] == 2
    adjusted = calculate(
        admin, r, adjustment=True, reason="Nueva distribución por importe corregido"
    )
    assert confirm(admin, adjusted).status_code == 200
    history = admin.get(f"/api/v1/utility-receipts/{r['id']}/history").json()
    assert (
        len(history["revisions"]) == 2
        and history["distributions"][0]["status"] == "superseded"
    )
    assert history["distributions"][0]["receipt"]["amount"] == "300.00"
    assert history["distributions"][1]["is_current"] is True


def test_edit_unconfirmed_receipt_and_duplicates(admin, utility):
    u = utility
    r = receipt(admin, u)
    assert (
        admin.post(
            f"/api/v1/service-accounts/{u['account']['id']}/receipts",
            json=receipt_body(),
        ).status_code
        == 409
    )
    changed = admin.patch(
        f"/api/v1/utility-receipts/{r['id']}",
        json={
            **receipt_body(amount="310"),
            "expected_version": r["version"],
            "reason": "Corrección antes de distribuir",
        },
    )
    assert changed.status_code == 200 and changed.json()["amount"] == "310.00"
    stale = admin.patch(
        f"/api/v1/utility-receipts/{r['id']}",
        json={
            **receipt_body(),
            "expected_version": r["version"],
            "reason": "Formulario anterior",
        },
    )
    assert stale.status_code == 409


@pytest.mark.parametrize("role", ["owner", "operator", "property_admin"])
def test_utility_permission_scope(admin, utility, role):
    u = utility
    r = receipt(admin, u)
    d = calculate(admin, r)
    another_owner = person(admin, "Otro propietario")
    other = property_(admin, another_owner, "Casa ajena a servicios")
    account = user(
        admin,
        role,
        u["owner"]["id"] if role == "owner" else None,
        [other["id"]] if role != "owner" else [],
    )
    login_as(admin, account)
    expected = 200 if role == "owner" else 404
    assert admin.get(f"/api/v1/utility-receipts/{r['id']}").status_code == expected
    assert admin.get(f"/api/v1/utility-distributions/{d['id']}").status_code == expected
    assert (
        admin.get(
            f"/api/v1/service-accounts/{u['account']['id']}/configurations"
        ).status_code
        == expected
    )
    assert confirm(admin, d).status_code == (403 if role == "owner" else 404)


@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_concurrent_confirmation_has_one_current(admin, utility, db, monkeypatch):
    u = utility
    d = calculate(admin, receipt(admin, u))
    barrier = Barrier(2)
    original = registry.lock_property

    def synchronize(session, account, property_id):
        barrier.wait(timeout=20)
        return original(session, account, property_id)

    monkeypatch.setattr(registry, "lock_property", synchronize)

    def run(_):
        with TestClient(app) as c:
            c.cookies.update(admin.cookies)
            return confirm(c, d).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, [0, 1]))
    assert sorted(results) == [200, 409], results
    with Session(db) as session:
        assert (
            session.scalar(select(func.count()).select_from(UtilityCurrentDistribution))
            == 1
        )


def test_new_occupation_after_calculation_requires_recalculation(admin, utility):
    u = utility
    r = receipt(admin, u)
    d = calculate(admin, r)
    rent(admin, u)
    assert confirm(admin, d).status_code == 409
    current = calculate(admin, r)
    assert (
        sum_kind(current, "occupant") == 150
        and confirm(admin, current).status_code == 200
    )


def test_early_exit_counts_only_real_14_days(admin, utility, monkeypatch):
    from app.services import tenancy

    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 1, 31, 12))
    u = utility
    c = rent(admin, u, owner_parties=[{"person_id": u["owner"]["id"], "share": 100}])
    assert (
        admin.post(
            f"/api/v1/contracts/{c['id']}/actions",
            json={
                "action": "finish",
                "end_date": "2031-01-14",
                "reason": "Salida real documentada",
            },
        ).status_code
        == 200
    )
    d = calculate(admin, receipt(admin, u))
    assert (
        sum_kind(d, "occupant") == 70
        and d["evidence"]["spaces"][0]["contracts"][0]["occupied_days"] == 14
    )


def test_changed_people_require_review_and_allow_historical_persons(admin, utility):
    u = utility
    c = rent(admin, u)
    assert (
        admin.patch(
            f"/api/v1/contracts/{c['id']}",
            json={"responsible_person_id": u["occupant"]["id"]},
        ).status_code
        == 200
    )
    d = calculate(admin, receipt(admin, u))
    assert d["status"] == "needs_review"
    a, b = d["allocations"]
    body = {
        "expected_version": d["version"],
        "expected_receipt_version": d["receipt_version"],
        "reason": "Responsables anteriores revisados con los contratos",
        "responsibilities": [
            {
                "allocation_id": a["id"],
                "kind": "occupant",
                "person_id": u["tenant"]["id"],
                "contract_id": c["id"],
                "amount": "100",
            },
            {
                "allocation_id": a["id"],
                "kind": "occupant",
                "person_id": u["occupant"]["id"],
                "contract_id": c["id"],
                "amount": "50",
            },
            {
                "allocation_id": b["id"],
                "kind": "owner",
                "person_id": u["owner"]["id"],
                "amount": "150",
            },
        ],
    }
    response = admin.post(f"/api/v1/utility-distributions/{d['id']}/resolve", json=body)
    assert response.status_code == 200, response.text
    assert confirm(admin, response.json()).status_code == 200


def test_coproprietors_are_not_automatically_split_by_ownership_percent(admin, utility):
    u = utility
    second = person(admin, "Segunda copropietaria")
    assert (
        admin.patch(
            f"/api/v1/properties/{u['property']['id']}",
            json={
                "owners": [
                    {"person_id": u["owner"]["id"], "share": 80},
                    {"person_id": second["id"], "share": 20},
                ]
            },
        ).status_code
        == 200
    )
    configure(admin, u, owner_person_id=None)
    d = calculate(admin, receipt(admin, u))
    assert d["status"] == "needs_review"
    assert all(
        r["person_id"] is None for a in d["allocations"] for r in a["responsibilities"]
    )
    assert confirm(admin, d).status_code == 409


def test_manual_review_cannot_increase_14_day_proportional_limit(admin, utility):
    u = utility
    c = rent(admin, u, end_date="2031-01-14")
    d = calculate(admin, receipt(admin, u))
    a, b = d["allocations"]
    body = {
        "expected_version": d["version"],
        "expected_receipt_version": d["receipt_version"],
        "reason": "Intento de incrementar el gasto proporcional",
        "responsibilities": [
            {
                "allocation_id": a["id"],
                "kind": "occupant",
                "person_id": u["tenant"]["id"],
                "contract_id": c["id"],
                "amount": "100",
            },
            {
                "allocation_id": a["id"],
                "kind": "owner",
                "person_id": u["owner"]["id"],
                "amount": "50",
            },
            {
                "allocation_id": b["id"],
                "kind": "owner",
                "person_id": u["owner"]["id"],
                "amount": "150",
            },
        ],
    }
    assert (
        admin.post(
            f"/api/v1/utility-distributions/{d['id']}/resolve", json=body
        ).status_code
        == 422
    )


def test_operator_registers_and_calculates_but_cannot_confirm_or_resolve(
    admin, utility
):
    u = utility
    account = user(admin, "operator", None, [u["property"]["id"]])
    login_as(admin, account)
    r = receipt(admin, u)
    d = calculate(admin, r)
    assert (
        confirm(admin, d).status_code == 403
        and resolve_owner_only(admin, d, u).status_code == 403
    )


def test_foreign_owner_cannot_read_receipt_or_distribution(admin, utility):
    u = utility
    r = receipt(admin, u)
    d = calculate(admin, r)
    owner = person(admin, "Titular de otra casa")
    property_(admin, owner, "Otra casa")
    account = user(admin, "owner", owner["id"])
    login_as(admin, account)
    for path in [
        f"/utility-receipts/{r['id']}",
        f"/utility-receipts/{r['id']}/history",
        f"/utility-distributions/{d['id']}",
        f"/service-accounts/{u['account']['id']}/meters",
    ]:
        assert admin.get("/api/v1" + path).status_code == 404


@pytest.mark.parametrize("db", ["mysql"], indirect=True)
@pytest.mark.parametrize("kind", ["receipt", "calculation"])
def test_mysql_double_requests_do_not_duplicate_records(
    admin, utility, db, monkeypatch, kind
):
    u = utility
    r = receipt(admin, u) if kind == "calculation" else None
    barrier = Barrier(2)
    original = registry.lock_property
    key = uuid4().hex

    def synchronize(session, account, property_id):
        barrier.wait(timeout=20)
        return original(session, account, property_id)

    monkeypatch.setattr(registry, "lock_property", synchronize)

    def run(_):
        with TestClient(app) as c:
            c.cookies.update(admin.cookies)
            path = (
                f"/api/v1/utility-receipts/{r['id']}/calculate"
                if r
                else f"/api/v1/service-accounts/{u['account']['id']}/receipts"
            )
            return c.post(
                path,
                json=(
                    {"expected_version": r["version"], "request_key": key}
                    if r
                    else receipt_body()
                ),
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, [0, 1]))
    assert sorted(results) == ([201, 201] if r else [201, 409]), results
    with Session(db) as session:
        assert (
            session.scalar(
                select(func.count()).select_from(
                    UtilityDistribution if r else UtilityReceipt
                )
            )
            == 1
        )
