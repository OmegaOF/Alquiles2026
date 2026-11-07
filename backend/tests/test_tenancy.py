"""Flujos y carreras reales de fase 2; usa las bases descartables de fase 1."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from test_phase1 import (
    db,
    client,
    admin,
    PASSWORD,
    person,
    property_,
    post,
    user,
    login_as,
)
from app.main import app
from app.models.entities import AuditEvent, Person, PropertyOwner, Unit
from app.models.tenancy import (
    Contract,
    ContractOccupant,
    ContractOwner,
    PropertyContact,
    Reservation,
)
from app.services import tenancy as service


@pytest.fixture
def home(admin):
    owner = person(admin, "Propietaria de contratos")
    prop = property_(admin, owner, "Casa de contratos")
    first = post(
        admin,
        f"/properties/{prop['id']}/units",
        {"code": "01", "name": "Cuarto primero", "unit_type": "cuarto"},
    )
    second = post(
        admin,
        f"/properties/{prop['id']}/units",
        {"code": "02", "name": "Cuarto segundo", "unit_type": "cuarto"},
    )
    tenant = post(
        admin,
        f"/properties/{prop['id']}/contacts",
        {"full_name": "Inquilino sin cuenta", "document": "TEN-100"},
    )
    occupant = post(
        admin, f"/properties/{prop['id']}/contacts", {"full_name": "Ocupante adicional"}
    )
    return {
        "owner": owner,
        "property": prop,
        "first": first,
        "second": second,
        "tenant": tenant,
        "occupant": occupant,
    }


def contract_body(home, **changes):
    body = {
        "property_id": None,
        "unit_id": home["first"]["id"],
        "responsible_person_id": home["tenant"]["id"],
        "occupant_ids": [],
        "mode": "daily",
        "status": "active",
        "start_date": "2031-01-01",
        "end_date": "2031-01-03",
        "price": "50.00",
        "currency": "BOB",
        "services_included": True,
    }
    body.update(changes)
    return body


def reserve_body(home, **changes):
    body = {
        "property_id": None,
        "unit_id": home["first"]["id"],
        "person_id": home["tenant"]["id"],
        "mode": "daily",
        "status": "pending",
        "start_date": "2031-01-01",
        "end_date": "2031-01-03",
    }
    body.update(changes)
    return body


def test_daily_count_and_services_long_stay(admin, home, db):
    created = post(
        admin,
        "/contracts",
        contract_body(
            home, end_date="2031-01-20", occupant_ids=[home["occupant"]["id"]]
        ),
    )
    assert created["periods"]["billable_days"] == 20
    assert (
        created["services_included"] is True
        and created["allows_service_charges"] is False
    )
    assert created["owners"][0]["person_id"] == home["owner"]["id"]
    with Session(db) as session:
        assert session.get(Person, home["tenant"]["id"]) is not None
        assert session.scalar(select(func.count()).select_from(ContractOccupant)) == 1
        assert session.scalar(select(func.count()).select_from(ContractOwner)) == 1
    bad = admin.post(
        "/api/v1/contracts",
        json=contract_body(home, unit_id=home["second"]["id"], services_included=False),
    )
    assert bad.status_code == 422


def test_multiple_occupants_and_database_relationship_keys(admin, home, db):
    another = post(
        admin,
        f"/properties/{home['property']['id']}/contacts",
        {"full_name": "Segundo ocupante sin cuenta"},
    )
    occupants = [home["occupant"]["id"], another["id"]]
    contract = post(admin, "/contracts", contract_body(home, occupant_ids=occupants))
    assert sorted(contract["occupant_ids"]) == sorted(occupants)
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(
                home, status="draft", occupant_ids=[home["tenant"]["id"]]
            ),
        ).status_code
        == 422
    )
    for model, existing, orphan in [
        (
            ContractOccupant,
            {"contract_id": contract["id"], "person_id": occupants[0]},
            {"contract_id": contract["id"], "person_id": 999999},
        ),
        (
            ContractOwner,
            {"contract_id": contract["id"], "person_id": home["owner"]["id"]},
            {"contract_id": 999999, "person_id": home["owner"]["id"]},
        ),
        (
            PropertyContact,
            {"property_id": home["property"]["id"], "person_id": home["tenant"]["id"]},
            {"property_id": 999999, "person_id": home["tenant"]["id"]},
        ),
    ]:
        for values in [existing, orphan]:
            with pytest.raises(IntegrityError):
                with Session(db) as session:
                    session.execute(model.__table__.insert().values(**values))
                    session.commit()


def test_exact_daily_and_nights_boundaries(admin, home):
    first = post(admin, "/contracts", contract_body(home))
    assert first["periods"]["billable_days"] == 3
    nights = post(
        admin,
        "/contracts",
        contract_body(home, unit_id=home["second"]["id"], daily_count="nights"),
    )
    assert (
        nights["periods"]["billable_days"] == 2
        and nights["periods"]["occupancy_days"] == 3
    )
    touching = admin.post(
        "/api/v1/contracts",
        json=contract_body(home, start_date="2031-01-03", end_date="2031-01-04"),
    )
    assert touching.status_code == 409
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(home, start_date="2031-01-04", end_date="2031-01-05"),
        ).status_code
        == 201
    )
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(
                home,
                daily_count="nights",
                start_date="2032-01-01",
                end_date="2032-01-01",
            ),
        ).status_code
        == 422
    )


def test_finished_monthly_period_uses_real_exit_and_keeps_agreed_term(
    admin, home, monkeypatch
):
    monkeypatch.setattr(service, "utc_now", lambda: datetime(2032, 2, 20, 16))
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="monthly",
            start_date="2032-02-01",
            end_date="2032-03-31",
            monthly_period="calendar",
            first_period="prorated",
            due_day=5,
            owner_parties=[{"person_id": home["owner"]["id"], "share": 100}],
        ),
    )
    result = admin.post(
        f"/api/v1/contracts/{obj['id']}/actions",
        json={
            "action": "finish",
            "end_date": "2032-02-15",
            "reason": "Salida anticipada en febrero bisiesto",
        },
    )
    assert result.status_code == 200, result.text
    periods = result.json()["periods"]
    assert periods["contracted_days"] == 60 and periods["occupancy_days"] == 15
    assert len(periods["monthly_periods"]) == 1
    assert (
        periods["monthly_periods"][0]["occupied_days"] == 15
        and periods["monthly_periods"][0]["period_days"] == 29
    )


def test_started_contract_does_not_rewrite_its_historical_space(admin, home):
    start = (service.today() - timedelta(days=3)).isoformat()
    end = (service.today() + timedelta(days=3)).isoformat()
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            start_date=start,
            end_date=end,
            owner_parties=[{"person_id": home["owner"]["id"], "share": 100}],
        ),
    )
    assert (
        admin.patch(
            f"/api/v1/contracts/{obj['id']}", json={"unit_id": home["second"]["id"]}
        ).status_code
        == 409
    )
    before = admin.get(
        f"/api/v1/properties/{home['property']['id']}/availability?start={start}&end={start}"
    ).json()
    assert (
        before["units"][0]["state"] == "occupied"
        and before["units"][1]["state"] == "available"
    )
    draft = post(admin, "/contracts", contract_body(home, status="draft"))
    assert (
        admin.patch(
            f"/api/v1/contracts/{draft['id']}", json={"unit_id": home["second"]["id"]}
        ).status_code
        == 200
    )


def test_link_person_is_idempotent_and_audits_the_property(admin, home, db):
    linked = person(admin, "Persona vinculada explícitamente")
    path = f"/api/v1/properties/{home['property']['id']}/contacts/link"
    assert admin.post(path, json={"person_id": linked["id"]}).status_code == 200
    assert admin.post(path, json={"person_id": linked["id"]}).status_code == 200
    with Session(db) as session:
        events = list(
            session.scalars(
                select(AuditEvent).where(AuditEvent.action == "link_contact")
            )
        )
        assert len(events) == 1
        import json

        assert json.loads(events[0].details) == {
            "property_id": home["property"]["id"],
            "person_id": linked["id"],
        }
        assert (
            session.get(PropertyContact, (home["property"]["id"], linked["id"]))
            is not None
        )


def test_whole_property_and_unit_conflicts_in_both_directions(admin, home):
    post(admin, "/contracts", contract_body(home))
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(home, property_id=home["property"]["id"], unit_id=None),
        ).status_code
        == 409
    )
    assert (
        admin.post(
            "/api/v1/contracts", json=contract_body(home, unit_id=home["second"]["id"])
        ).status_code
        == 201
    )
    whole = post(
        admin,
        "/contracts",
        contract_body(
            home,
            property_id=home["property"]["id"],
            unit_id=None,
            start_date="2032-01-01",
            end_date="2032-01-03",
        ),
    )
    assert whole["property_id"] == home["property"]["id"] and whole["unit_id"] is None
    assert (
        admin.post(
            "/api/v1/reservations",
            json=reserve_body(home, start_date="2032-01-02", end_date="2032-01-02"),
        ).status_code
        == 409
    )


def test_weekly_complete_and_partial(admin, home):
    weekly = post(
        admin,
        "/contracts",
        contract_body(home, mode="weekly", end_date="2031-01-07", price="300"),
    )
    assert (
        weekly["periods"]["full_weeks"] == 1 and weekly["periods"]["partial_days"] == 0
    )
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(
                home, mode="weekly", unit_id=home["second"]["id"], end_date="2031-01-09"
            ),
        ).status_code
        == 422
    )
    partial = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="weekly",
            unit_id=home["second"]["id"],
            end_date="2031-01-09",
            weekly_partial_allowed=True,
        ),
    )
    assert partial["periods"]["partial_days"] == 2


@pytest.mark.parametrize(
    "start,end,days",
    [
        ("2031-02-10", "2031-02-28", 28),
        ("2032-02-10", "2032-02-29", 29),
        ("2031-04-10", "2031-04-30", 30),
        ("2031-01-10", "2031-01-31", 31),
    ],
)
def test_monthly_calendar_actual_days(admin, home, start, end, days):
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="monthly",
            start_date=start,
            end_date=end,
            price="1200",
            monthly_period="calendar",
            first_period="prorated",
            due_day=31,
        ),
    )
    period = obj["periods"]["monthly_periods"][0]
    assert period["period_days"] == days and period["occupied_days"] == days - 9
    assert period["first_period_rule"] == "prorated"
    assert period["due_date"] == end


def test_anniversary_anchor_does_not_drift_and_first_complete(admin, home):
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="monthly",
            start_date="2031-01-31",
            end_date="2031-04-30",
            monthly_period="anniversary",
            first_period="full",
            due_day=5,
        ),
    )
    periods = obj["periods"]["monthly_periods"]
    assert [p["full_start"] for p in periods] == [
        "2031-01-31",
        "2031-02-28",
        "2031-03-31",
        "2031-04-30",
    ]
    assert periods[0]["period_days"] == 28 and periods[0]["first_period_rule"] == "full"
    assert periods[1]["period_days"] == 31


@pytest.mark.parametrize(
    "timing,expected", [("arrears", "2031-03-05"), ("custom", None)]
)
def test_monthly_due_rule_respects_payment_timing(admin, home, timing, expected):
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="monthly",
            start_date="2031-02-10",
            end_date="2031-02-28",
            monthly_period="calendar",
            first_period="prorated",
            due_day=None if timing == "custom" else 5,
            payment_timing=timing,
            due_terms="Fecha pactada por escrito" if timing == "custom" else None,
        ),
    )
    assert obj["periods"]["monthly_periods"][0]["due_date"] == expected


def test_historical_signers_are_explicit_and_not_reconstructed_from_current_owner(
    admin, home
):
    previous = person(admin, "Titular del contrato histórico")
    day = (service.today() - timedelta(days=60)).isoformat()
    body = contract_body(home, start_date=day, end_date=day)
    assert admin.post("/api/v1/contracts", json=body).status_code == 422
    old = post(
        admin,
        "/contracts",
        {**body, "owner_parties": [{"person_id": previous["id"], "share": 100}]},
    )
    assert old["owners"] == [{"person_id": previous["id"], "share": "100.00"}]
    assert (
        admin.get(f"/api/v1/properties/{home['property']['id']}").json()["owners"][0][
            "person_id"
        ]
        == home["owner"]["id"]
    )
    assert (
        admin.patch(
            f"/api/v1/contracts/{old['id']}",
            json={"owner_parties": [{"person_id": home["owner"]["id"], "share": 100}]},
        ).status_code
        == 409
    )
    history = admin.get(f"/api/v1/contracts/{old['id']}/history").json()
    assert history[0]["details"]["after"]["owners"][0]["person_id"] == previous["id"]


def test_drafts_do_not_block_and_activation_rechecks(admin, home):
    draft = post(admin, "/contracts", contract_body(home, status="draft"))
    post(admin, "/contracts", contract_body(home))
    response = admin.post(
        f"/api/v1/contracts/{draft['id']}/actions",
        json={"action": "activate", "reason": "Aprobar borrador"},
    )
    assert response.status_code == 409
    assert admin.get(f"/api/v1/contracts/{draft['id']}").json()["status"] == "draft"
    assert (
        admin.patch(
            f"/api/v1/contracts/{draft['id']}", json={"status": "active"}
        ).status_code
        == 422
    )

    assert (
        admin.patch(
            f"/api/v1/contracts/{draft['id']}",
            json={"start_date": "2031-01-04", "end_date": "2031-01-05"},
        ).status_code
        == 200
    )
    activated = admin.post(
        f"/api/v1/contracts/{draft['id']}/actions",
        json={"action": "activate", "reason": "Fechas revisadas disponibles"},
    )
    assert activated.status_code == 200 and activated.json()["status"] == "active"
    cancelled = admin.post(
        f"/api/v1/contracts/{draft['id']}/actions",
        json={"action": "cancel", "reason": "Cancelación antes de la entrada"},
    )
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert (
        admin.post(
            "/api/v1/reservations",
            json=reserve_body(home, start_date="2031-01-04", end_date="2031-01-05"),
        ).status_code
        == 201
    )


def test_reservation_confirm_convert_once_and_self_exclusion(admin, home, db):
    reservation = post(admin, "/reservations", reserve_body(home))
    assert (
        admin.post("/api/v1/reservations", json=reserve_body(home)).status_code == 409
    )
    body = contract_body(home)
    assert (
        admin.post(
            f"/api/v1/reservations/{reservation['id']}/convert", json=body
        ).status_code
        == 409
    )
    assert (
        admin.post(
            f"/api/v1/reservations/{reservation['id']}/actions",
            json={"action": "confirm", "reason": "Confirmación del inquilino"},
        ).status_code
        == 200
    )
    converted = post(admin, f"/reservations/{reservation['id']}/convert", body)
    assert (
        converted["source_reservation_id"] == reservation["id"]
        and converted["status"] == "active"
    )
    repeat = admin.post(f"/api/v1/reservations/{reservation['id']}/convert", json=body)
    assert repeat.status_code == 200 and repeat.json()["id"] == converted["id"]
    assert (
        admin.get(f"/api/v1/reservations/{reservation['id']}").json()[
            "effective_status"
        ]
        == "converted"
    )
    with Session(db) as session:
        assert session.scalar(select(func.count()).select_from(Contract)) == 1


def test_cancel_and_expire_release_reservations(admin, home, monkeypatch):
    reservation = post(admin, "/reservations", reserve_body(home))
    assert (
        admin.post(
            f"/api/v1/reservations/{reservation['id']}/actions",
            json={"action": "cancel", "reason": "Cambio de planes"},
        ).status_code
        == 200
    )
    expires = service.utc_now() + timedelta(hours=1)
    second = post(
        admin, "/reservations", reserve_body(home, expires_at=expires.isoformat())
    )
    future = expires + timedelta(hours=1)
    monkeypatch.setattr(service, "utc_now", lambda: future)
    assert (
        admin.get(f"/api/v1/reservations/{second['id']}").json()["effective_status"]
        == "expired"
    )
    assert (
        admin.post(
            f"/api/v1/reservations/{second['id']}/actions",
            json={"action": "expire", "reason": "Venció el plazo"},
        ).status_code
        == 200
    )
    assert admin.post("/api/v1/contracts", json=contract_body(home)).status_code == 201


def test_finish_early_keeps_occupants_and_original_owners(admin, home):
    today = service.today()
    original_end = today + timedelta(days=10)
    obj = post(
        admin,
        "/contracts",
        contract_body(
            home,
            start_date=(today - timedelta(days=10)).isoformat(),
            end_date=original_end.isoformat(),
            occupant_ids=[home["occupant"]["id"]],
            owner_parties=[{"person_id": home["owner"]["id"], "share": 100}],
        ),
    )
    owner = person(admin, "Nueva propietaria")
    assert (
        admin.patch(
            f"/api/v1/properties/{home['property']['id']}",
            json={"owners": [{"person_id": owner["id"], "share": 100}]},
        ).status_code
        == 200
    )
    actual = today - timedelta(days=2)
    response = admin.post(
        f"/api/v1/contracts/{obj['id']}/actions",
        json={
            "action": "finish",
            "end_date": actual.isoformat(),
            "reason": "Salida anticipada acordada",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["periods"]["occupancy_days"] == 9
    assert (
        result["periods"]["contracted_days"] == result["periods"]["billable_days"] == 21
    )
    assert result["owners"][0]["person_id"] == home["owner"]["id"] and result[
        "occupant_ids"
    ] == [home["occupant"]["id"]]
    assert (
        result["actual_end_date"] == actual.isoformat()
        and result["end_date"] == original_end.isoformat()
    )
    assert (
        admin.patch(
            f"/api/v1/contracts/{obj['id']}", json={"notes": "No modificar"}
        ).status_code
        == 409
    )
    assert (
        admin.post(
            "/api/v1/contracts",
            json=contract_body(
                home,
                start_date=(actual + timedelta(days=1)).isoformat(),
                end_date=original_end.isoformat(),
                owner_parties=[{"person_id": owner["id"], "share": 100}],
            ),
        ).status_code
        == 201
    )
    history = admin.get(f"/api/v1/contracts/{obj['id']}/history").json()
    assert history[-1]["action"] == "finish" and history[-1]["details"]["before"][
        "occupant_ids"
    ] == [home["occupant"]["id"]]
    occupancy = admin.get(
        f"/api/v1/properties/{home['property']['id']}/occupancy"
    ).json()
    assert any(c["id"] == obj["id"] and c["status"] == "finished" for c in occupancy)


def test_extensions_and_edits_recheck_availability_and_history(admin, home):
    first = post(
        admin, "/contracts", contract_body(home, occupant_ids=[home["occupant"]["id"]])
    )
    post(
        admin,
        "/reservations",
        reserve_body(home, start_date="2031-01-05", end_date="2031-01-06"),
    )
    assert (
        admin.post(
            f"/api/v1/contracts/{first['id']}/actions",
            json={
                "action": "extend",
                "end_date": "2031-01-05",
                "reason": "Prórroga acordada",
            },
        ).status_code
        == 409
    )
    assert (
        admin.post(
            f"/api/v1/contracts/{first['id']}/actions",
            json={
                "action": "extend",
                "end_date": "2031-01-04",
                "reason": "Prórroga acordada",
            },
        ).status_code
        == 200
    )
    result = admin.patch(
        f"/api/v1/contracts/{first['id']}",
        json={"occupant_ids": [], "notes": "Cambio de ocupantes"},
    )
    assert result.status_code == 200, result.text
    history = admin.get(f"/api/v1/contracts/{first['id']}/history").json()
    assert history[-1]["details"]["before"]["occupant_ids"] == [home["occupant"]["id"]]
    assert history[-1]["details"]["after"]["occupant_ids"] == []
    assert home["occupant"]["id"] in [
        p["id"]
        for p in admin.get(
            f"/api/v1/properties/{home['property']['id']}/contacts"
        ).json()
    ]


def test_maintenance_disabled_and_derived_availability(admin, home):
    unit = home["first"]
    assert (
        admin.patch(
            f"/api/v1/properties/{home['property']['id']}/units/{unit['id']}",
            json={"maintenance": True},
        ).status_code
        == 200
    )
    assert admin.post("/api/v1/contracts", json=contract_body(home)).status_code == 409
    assert (
        admin.post(
            "/api/v1/reservations",
            json=reserve_body(home, property_id=home["property"]["id"], unit_id=None),
        ).status_code
        == 409
    )
    assert (
        admin.post(
            "/api/v1/contracts", json=contract_body(home, unit_id=home["second"]["id"])
        ).status_code
        == 201
    )
    available = admin.get(
        f"/api/v1/properties/{home['property']['id']}/availability?start=2031-01-01&end=2031-01-03"
    ).json()
    assert (
        available["units"][0]["state"] == "maintenance"
        and available["units"][1]["state"] == "occupied"
    )
    assert (
        admin.patch(
            f"/api/v1/properties/{home['property']['id']}/units/{unit['id']}",
            json={"maintenance": False, "is_enabled": False},
        ).status_code
        == 200
    )
    assert (
        admin.post("/api/v1/reservations", json=reserve_body(home)).status_code == 409
    )


@pytest.mark.parametrize("role", ["owner", "operator", "property_admin"])
def test_tenancy_permission_scope_and_people_privacy(admin, home, role):
    other_owner = person(admin, "Propietario ajeno")
    other = property_(admin, other_owner, "Casa ajena")
    private = post(
        admin, f"/properties/{other['id']}/contacts", {"full_name": "Persona privada"}
    )
    foreign = post(
        admin,
        "/contracts",
        contract_body(
            home,
            unit_id=None,
            property_id=other["id"],
            responsible_person_id=private["id"],
        ),
    )
    foreign_reservation = post(
        admin,
        "/reservations",
        reserve_body(
            home,
            unit_id=None,
            property_id=other["id"],
            person_id=private["id"],
            start_date="2032-01-01",
            end_date="2032-01-03",
        ),
    )
    account = user(
        admin,
        role,
        home["owner"]["id"] if role == "owner" else None,
        [home["property"]["id"]] if role != "owner" else [],
    )
    login_as(admin, account)
    assert admin.get(f"/api/v1/contracts/{foreign['id']}").status_code == 404
    assert admin.get(f"/api/v1/contracts/{foreign['id']}/history").status_code == 404
    assert (
        admin.patch(
            f"/api/v1/contracts/{foreign['id']}", json={"notes": "Cambio ajeno"}
        ).status_code
        == 404
    )
    assert (
        admin.post(
            f"/api/v1/contracts/{foreign['id']}/actions",
            json={
                "action": "extend",
                "end_date": "2031-01-04",
                "reason": "Intento en casa ajena",
            },
        ).status_code
        == 404
    )
    assert (
        admin.get(f"/api/v1/reservations/{foreign_reservation['id']}").status_code
        == 404
    )
    assert admin.patch(
        f"/api/v1/reservations/{foreign_reservation['id']}",
        json={"notes": "Cambio ajeno"},
    ).status_code == (403 if role == "owner" else 404)
    assert (
        admin.get(f"/api/v1/properties/{other['id']}/availability").status_code == 404
    )
    assert admin.get(f"/api/v1/properties/{other['id']}/contacts").status_code == 404
    assert admin.get(f"/api/v1/properties/{other['id']}/occupancy").status_code == 404
    assert private["id"] not in [p["id"] for p in admin.get("/api/v1/persons").json()]
    response = admin.post("/api/v1/contracts", json=contract_body(home))
    assert response.status_code == (201 if role == "property_admin" else 403)
    draft = admin.post("/api/v1/contracts", json=contract_body(home, status="draft"))
    assert draft.status_code == (403 if role == "owner" else 201)
    if role == "operator":
        assert (
            admin.post(
                f"/api/v1/contracts/{draft.json()['id']}/actions",
                json={"action": "activate", "reason": "Intento sin permiso"},
            ).status_code
            == 403
        )
        assert (
            admin.post("/api/v1/reservations", json=reserve_body(home)).status_code
            == 201
        )
    if role != "owner":
        assert (
            admin.post(
                "/api/v1/contracts",
                json=contract_body(
                    home, status="draft", responsible_person_id=private["id"]
                ),
            ).status_code
            == 403
        )


def test_prepared_anticretico_and_mixed_without_finance(admin, home, db):
    anti = post(
        admin, "/contracts", contract_body(home, mode="anticretico", price=None)
    )
    assert anti["price"] is None and anti["status"] == "active"
    mixed = post(
        admin,
        "/contracts",
        contract_body(
            home,
            mode="mixed",
            status="draft",
            price=None,
            conditions="Condiciones por revisar",
        ),
    )
    assert mixed["status"] == "draft"
    assert (
        admin.post(
            f"/api/v1/contracts/{mixed['id']}/actions",
            json={"action": "activate", "reason": "Revisar combinación"},
        ).status_code
        == 409
    )
    from sqlalchemy import inspect

    assert not {"payments", "charges", "capital_returns", "bills"} & set(
        inspect(db).get_table_names()
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"end_date": "2030-01-01"},
        {"price": "-5"},
        {"property_id": 1, "unit_id": 1},
        {"occupant_ids": [1, 1]},
        {"mode": "unknown"},
        {"price": "NaN"},
    ],
)
def test_invalid_contract_input(admin, home, patch):
    assert (
        admin.post("/api/v1/contracts", json=contract_body(home, **patch)).status_code
        == 422
    )


def test_optimistic_version_and_no_physical_delete(admin, home):
    obj = post(admin, "/contracts", contract_body(home, status="draft"))
    assert (
        admin.patch(
            f"/api/v1/contracts/{obj['id']}",
            json={"notes": "Nueva versión", "expected_version": 1},
        ).status_code
        == 200
    )
    assert (
        admin.patch(
            f"/api/v1/contracts/{obj['id']}",
            json={"notes": "Versión vieja", "expected_version": 1},
        ).status_code
        == 409
    )
    assert admin.delete(f"/api/v1/contracts/{obj['id']}").status_code == 405


@pytest.mark.parametrize("db", ["mysql"], indirect=True)
@pytest.mark.parametrize("kind", ["contracts", "reservations", "whole_vs_room"])
def test_mysql_concurrent_conflicts_are_serialized(admin, home, db, monkeypatch, kind):
    barrier = Barrier(2)
    original = service.lock_property

    def synchronized(session, account, property_id):
        barrier.wait(timeout=15)
        return original(session, account, property_id)

    monkeypatch.setattr(service, "lock_property", synchronized)

    def run(index):
        with TestClient(app) as thread_client:
            thread_client.cookies.update(admin.cookies)
            if kind == "reservations":
                path, body = "/reservations", reserve_body(home)
            elif kind == "whole_vs_room" and index == 0:
                path, body = "/contracts", contract_body(
                    home, property_id=home["property"]["id"], unit_id=None
                )
            elif kind == "whole_vs_room":
                path, body = "/reservations", reserve_body(home)
            else:
                path, body = "/contracts", contract_body(home)
            return thread_client.post("/api/v1" + path, json=body).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, [0, 1]))
    assert sorted(results) == [201, 409], results
    with Session(db) as session:
        assert (
            session.scalar(select(func.count()).select_from(Contract))
            + session.scalar(select(func.count()).select_from(Reservation))
            == 1
        )


def test_daily_services_are_implicit_and_same_day_is_one_day(admin, home):
    body = contract_body(home, end_date="2031-01-01")
    body.pop("services_included")
    result = post(admin, "/contracts", body)
    assert (
        result["services_included"] is True and result["periods"]["billable_days"] == 1
    )


@pytest.mark.parametrize("db", ["mysql"], indirect=True)
def test_mysql_parallel_conversion_creates_only_one_contract(
    admin, home, db, monkeypatch
):
    import threading

    reservation = post(admin, "/reservations", reserve_body(home, status="confirmed"))
    barrier = Barrier(2)
    local = threading.local()
    original = service.lock_property

    def synchronize_once(session, account, property_id):
        if not getattr(local, "synchronized", False):
            local.synchronized = True
            barrier.wait(timeout=15)
        return original(session, account, property_id)

    monkeypatch.setattr(service, "lock_property", synchronize_once)

    def convert(_):
        with TestClient(app) as other:
            other.cookies.update(admin.cookies)
            response = other.post(
                f"/api/v1/reservations/{reservation['id']}/convert",
                json=contract_body(home),
            )
            assert response.status_code in (200, 201), response.text
            return response.status_code, response.json()["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(convert, [0, 1]))
    assert len({id for _, id in results}) == 1 and sorted(
        code for code, _ in results
    ) == [200, 201]
    with Session(db) as session:
        assert session.scalar(select(func.count()).select_from(Contract)) == 1
