"""Conciliación, filtros, fechas históricas, permisos y PDF sobre SQLite/MySQL."""

from datetime import date, datetime, timedelta
from uuid import uuid4
from io import BytesIO
from pathlib import Path
import hashlib
import json
from decimal import Decimal
import pytest
from pypdf import PdfReader
from sqlalchemy import select, func, event, inspect
from sqlalchemy.orm import Session
from app.db.base import Base
from app.models import finances as m
from app.models.entities import User
from app.services import tenancy, finances as finance
from app.services import reminder_sources
from app.services import report_pdf
from app.services.report_projection import period
from app.schemas.reports import ReportFilters
from test_phase1 import db, client, admin, post, person, property_, user, login_as
from test_tenancy import home, contract_body
from test_utilities import utility, receipt, rent, calculate, confirm, configure
from test_finances import fin, rental as ordinary_rental, services, call, cash, state
from test_anticreticos import anti, save, deliver, restitution, call as capital_call


@pytest.fixture
def clock(monkeypatch):
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 2, 28, 16))

    def timestamp(mapper, connection, target):
        target.created_at = datetime(2031, 2, 15, 12)

    event.listen(m.FinanceOperation, "before_insert", timestamp)
    yield
    event.remove(m.FinanceOperation, "before_insert", timestamp)


def report(admin, fin, kind="economic", **changes):
    params = {
        **dict(
            property_id=fin["property"]["id"],
            start_date="2031-02-01",
            end_date="2031-02-28",
        ),
        **changes,
    }
    r = admin.get("/api/v1/reports/" + kind, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def bob(result):
    return next(x for x in result["summary"] if x["currency"] == "BOB")


def rental(admin, fin, **changes):
    return ordinary_rental(
        admin,
        fin,
        owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
        **changes,
    )


def test_partial_payment_dashboard_report_and_pdf_agree(admin, fin, clock, monkeypatch):
    charts = []
    original_chart = report_pdf.VerticalBarChart

    def capture_chart():
        chart = original_chart()
        charts.append(chart)
        return chart

    monkeypatch.setattr(report_pdf, "VerticalBarChart", capture_chart)
    c, oid = rental(admin, fin)
    call(
        admin,
        fin,
        "/receive",
        person_id=fin["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "200"}],
        **cash(fin, 200),
    )
    result = report(admin, fin)
    group = bob(result)
    assert (
        group["obligations_total"],
        group["obligations_applied"],
        group["pending"],
    ) == ("500.00", "200.00", "300.00")
    assert group["cash_received"] == group["ordinary_received"] == "200.00"
    dash = admin.get(
        "/api/v1/dashboard",
        params=dict(
            property_id=fin["property"]["id"],
            start_date="2031-02-01",
            end_date="2031-02-28",
        ),
    ).json()
    assert (
        dash["summary"] == result["summary"]
        and dash["fingerprint"] == result["fingerprint"]
    )
    r = admin.get(
        "/api/v1/reports/economic/pdf",
        params={
            **{k: v for k, v in result["filters"].items() if v is not None},
            "expected_fingerprint": result["fingerprint"],
        },
    )
    assert r.status_code == 200, r.text
    reader = PdfReader(BytesIO(r.content))
    text = "\n".join(p.extract_text() for p in reader.pages)
    assert all(
        v in text for v in ["500.00", "200.00", "300.00", "BOB", result["fingerprint"]]
    )
    assert r.headers["X-Report-Fingerprint"] == result["fingerprint"]
    # En el PDF dibujado, la aplicación mínima de 200 debe tener altura visible;
    # la escala automática de ReportLab comenzaba en 200 y ocultaba esa barra.
    payments_chart = next(
        chart for chart in charts if chart.data == [[500.0], [200.0], [300.0]]
    )
    axis = payments_chart.valueAxis
    assert axis._valueMin <= 0 < 200 <= axis._valueMax
    assert axis.scale(200) > axis.scale(0)


@pytest.mark.parametrize(
    "kind",
    [
        "economic",
        "properties",
        "owners",
        "units",
        "contracts",
        "collections",
        "services",
        "expenses",
        "capital",
        "comparison",
    ],
)
def test_all_report_views_authorized_and_queries_do_not_write(
    admin, fin, clock, db, kind
):
    rental(admin, fin)
    with Session(db) as s:
        before = {
            t: s.scalar(select(func.count()).select_from(t))
            for t in Base.metadata.sorted_tables
        }
    result = report(admin, fin, kind)
    assert result["kind"] == kind
    assert bob(result)["pending"] == "500.00"
    pdf = admin.get(
        f"/api/v1/reports/{kind}/pdf",
        params={k: v for k, v in result["filters"].items() if v is not None},
    )
    assert pdf.status_code == 200, pdf.text
    assert PdfReader(BytesIO(pdf.content)).pages
    with Session(db) as s:
        after = {
            t: s.scalar(select(func.count()).select_from(t))
            for t in Base.metadata.sorted_tables
        }
    assert before == after


def test_multiple_owners_occupants_and_payment_applications_do_not_multiply_money(
    admin, fin, clock
):
    second_owner = person(admin, "Copropietaria ficticia")
    patch = admin.patch(
        f"/api/v1/properties/{fin['property']['id']}",
        json={
            "owners": [
                {"person_id": fin["owner"]["id"], "share": 60},
                {"person_id": second_owner["id"], "share": 40},
            ]
        },
    )
    assert patch.status_code == 200
    c, oid = rental(admin, fin, occupant_ids=[fin["occupant"]["id"]])
    # Dos aplicaciones a la misma deuda desde movimientos diferentes.
    for value in ["125", "75"]:
        call(
            admin,
            fin,
            "/receive",
            person_id=fin["tenant"]["id"],
            applications=[{"obligation_id": oid, "amount": value}],
            **cash(fin, value),
        )
    result = report(admin, fin, "owners")
    assert len(result["rows"]) == 2
    assert bob(result)["ordinary_received"] == "200.00"
    assert bob(result)["pending"] == "300.00"
    assert {r["ordinary_received"] for r in result["rows"]} == {"200.00"}
    assert all("sin atribución personal" in r["scope"] for r in result["rows"])


def test_separate_currencies_and_whole_house_not_allocated_to_units(admin, fin, clock):
    c, oid = rental(admin, fin, property_id=fin["property"]["id"], unit_id=None)
    call(
        admin,
        fin,
        "/receive",
        person_id=fin["tenant"]["id"],
        applications=[],
        surplus="advance",
        **cash(fin, "100", currency="USD"),
    )
    result = report(admin, fin)
    assert {g["currency"] for g in result["summary"]} == {"BOB", "USD"}
    assert bob(result)["pending"] == "500.00"
    usd = next(g for g in result["summary"] if g["currency"] == "USD")
    assert usd["ordinary_received"] == usd["advances_received"] == "100.00"
    unit = report(admin, fin, unit_id=fin["first"]["id"])
    assert not unit["summary"] and not unit["rows"]
    assert result["rows"][0]["unit_id"] is None


@pytest.mark.parametrize("role", ["owner", "property_admin", "operator"])
def test_role_scope_pdf_and_filter_idor(admin, fin, clock, role):
    own = person(admin, "Persona ajena")
    foreign = property_(admin, own, "Casa privada ajena")
    foreign_unit = post(
        admin,
        f"/properties/{foreign['id']}/units",
        {"code": "P", "name": "Privado", "unit_type": "cuarto"},
    )
    account = user(
        admin,
        role,
        fin["owner"]["id"] if role == "owner" else None,
        [fin["property"]["id"]] if role != "owner" else [],
    )
    login_as(admin, account)
    for suffix in ["", "/pdf"]:
        response = admin.get(
            "/api/v1/reports/economic" + suffix, params={"property_id": foreign["id"]}
        )
        assert response.status_code == 404
        response = admin.get(
            "/api/v1/reports/economic" + suffix, params={"unit_id": foreign_unit["id"]}
        )
        assert response.status_code == 404
    options = admin.get("/api/v1/reports/options").json()
    assert [x["id"] for x in options["properties"]] == [fin["property"]["id"]]
    assert own["id"] not in {x["id"] for x in options["people"]}


def test_historical_cutoff_reconstructs_adjustment_payment_and_later_void(
    admin, fin, clock, db, monkeypatch
):
    _, oid = rental(admin, fin)
    paid = call(
        admin,
        fin,
        "/receive",
        person_id=fin["tenant"]["id"],
        applications=[{"obligation_id": oid, "amount": "200"}],
        **cash(fin, 200),
    )
    call(
        admin,
        fin,
        f'/movements/{paid["movement_id"]}/void',
        reason="Corrección posterior documentada",
    )
    with Session(db) as s:
        move = s.get(m.FinanceMovement, paid["movement_id"])
        s.get(m.FinanceOperation, move.void_operation_id).created_at = datetime(
            2031, 3, 1, 12
        )
        s.commit()
    historical = report(admin, fin)
    assert bob(historical)["pending"] == "300.00"
    assert (
        historical["counts"]["units_occupied"] is not None
    )  # corte actual del reloj de prueba
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2031, 3, 31, 12))
    current = report(admin, fin, end_date="2031-03-31")
    assert bob(current)["pending"] == "500.00"
    assert bob(current)["ordinary_received"] == "0.00"
    past = report(admin, fin)
    assert past["counts"]["units_occupied"] is None
    assert any("No se puede reconstruir" in note for note in past["limitations"])


def test_money_entered_after_cut_not_falsely_shown_as_known_historical(
    admin, fin, clock
):
    rental(admin, fin)
    past = report(admin, fin, as_of="2031-02-14")
    assert past["summary"] == [] and not past["rows"]
    assert any("desconocidas al corte" in n for n in past["limitations"])


def test_expenses_recorded_partial_paid_and_non_cash_adjustment(admin, fin, clock):
    exp = call(
        admin,
        fin,
        "/expenses",
        person_id=fin["owner"]["id"],
        currency="BOB",
        amount="300",
        category_id=fin["category"],
        description="Reparación ficticia",
        recorded_on="2031-02-01",
    )
    call(
        admin,
        fin,
        f"/expenses/{exp['expense_id']}/pay",
        **cash(fin, 100, payer_id=fin["owner"]["id"]),
    )
    r = report(admin, fin, "expenses")
    g = bob(r)
    assert (g["expense_total"], g["expense_applied"], g["payable_pending"]) == (
        "300.00",
        "100.00",
        "200.00",
    )
    assert g["disbursed"] == g["cash_out"] == "100.00"
    assert g["cash_received"] == "0.00"
    call(
        admin,
        fin,
        f"/expenses/{exp['expense_id']}/adjust",
        new_total="50",
        reason="Corrección ficticia del importe registrado",
    )
    corrected = bob(report(admin, fin, "expenses"))
    assert corrected["provider_refund_pending"] == "50.00"
    assert Decimal(corrected["expense_total"]) + Decimal(
        corrected["provider_refund_pending"]
    ) == Decimal(corrected["expense_applied"]) + Decimal(corrected["payable_pending"])
    assert corrected["cash_received"] == "0.00" and corrected["cash_out"] == "100.00"


def test_advance_guarantee_credit_are_separate_and_pdf_staleness_rejected(
    admin, fin, clock
):
    c, oid = rental(admin, fin)
    advance = call(
        admin,
        fin,
        "/receive",
        person_id=fin["tenant"]["id"],
        applications=[],
        surplus="advance",
        **cash(fin, 300),
    )
    call(
        admin,
        fin,
        "/guarantees",
        person_id=fin["tenant"]["id"],
        contract_id=c["id"],
        conditions="Garantía ficticia",
        **cash(fin, 100),
    )
    before = report(admin, fin)
    g = bob(before)
    assert (g["ordinary_received"], g["guarantees_received"], g["cash_received"]) == (
        "300.00",
        "100.00",
        "400.00",
    )
    call(
        admin,
        fin,
        "/apply",
        applications=[
            {
                "source_movement_id": advance["movement_id"],
                "obligation_id": oid,
                "amount": "200",
            }
        ],
    )
    after = report(admin, fin)
    g = bob(after)
    assert (
        g["cash_received"] == "400.00"
        and g["credit_available"] == "100.00"
        and g["pending"] == "300.00"
    )
    r = admin.get(
        "/api/v1/reports/economic/pdf",
        params={
            **{k: v for k, v in before["filters"].items() if v is not None},
            "expected_fingerprint": before["fingerprint"],
        },
    )
    assert r.status_code == 409 and "cambiaron" in r.json()["detail"]


def test_capital_received_returned_and_noncash_never_become_rent(admin, anti, clock):
    save(admin, anti)
    deliver(admin, anti, 1000)
    restitution(admin, anti, 250)
    result = report(admin, anti, "capital")
    group = bob(result)
    assert group["ordinary_received"] == group["guarantees_received"] == "0.00"
    assert (
        group["capital_received"],
        group["capital_returned"],
        group["capital_pending"],
    ) == ("1000.00", "250.00", "750.00")
    # La entrega fue en enero; el periodo de flujos es febrero, el capital es acumulado.
    assert group["cash_received"] == group["capital_received_period"] == "0.00"
    assert group["cash_out"] == group["capital_returned_period"] == "250.00"


def test_confirmed_services_without_recalculation_and_no_double_cash(admin, fin, clock):
    rental(admin, fin)
    r, d, result = services(admin, fin)
    debts = state(admin, fin)["obligations"]
    service = next(x for x in debts if x["service_origin_id"])
    call(
        admin,
        fin,
        "/receive",
        person_id=fin["tenant"]["id"],
        applications=[{"obligation_id": service["id"], "amount": "50"}],
        **cash(fin, 50),
    )
    output = report(admin, fin, "services", start_date="2031-01-01")
    row = output["rows"][0]
    assert row["amount"] == "300.00" and row["distribution_id"] == d["id"]
    assert Decimal(row["owner_responsibility"]) + Decimal(
        row["occupant_responsibility"]
    ) == Decimal("300")
    assert row["recovered"] == "50.00"
    assert (
        bob(output)["ordinary_received"] == bob(output)["services_recovered"] == "50.00"
    )
    assert bob(output)["cash_received"] == "50.00"


def test_partial_provider_payment_does_not_invent_zero_reimbursement(admin, fin, clock):
    rental(admin, fin)
    r, d, imported = services(admin, fin)
    eid = imported["expense_id"]
    call(
        admin,
        fin,
        f"/expenses/{eid}/pay",
        **cash(fin, 100, payer_id=fin["owner"]["id"]),
    )
    output = report(admin, fin, "services", start_date="2031-01-01")
    assert output["rows"][0]["reimbursement_pending"] is None
    assert bob(output)["recoveries_pending"] is None
    call(
        admin,
        fin,
        f"/expenses/{eid}/pay",
        **cash(fin, 200, payer_id=fin["owner"]["id"]),
    )
    full = report(admin, fin, "services", start_date="2031-01-01")
    assert bob(full)["recoveries_pending"] == bob(full)["service_pending"] == "150.00"


def test_direct_provider_payment_matches_filtered_tenant_and_keeps_invoice_total(
    admin, fin, clock
):
    rental(admin, fin)
    r, d, imported = services(admin, fin)
    debts = state(admin, fin)["obligations"]
    debt = next(o for o in debts if o["service_origin_id"])
    call(
        admin,
        fin,
        f"/expenses/{imported['expense_id']}/pay",
        is_direct=True,
        document_reference="Pago directo ficticio",
        applications=[{"obligation_id": debt["id"], "amount": "100"}],
        **cash(fin, 100),
    )
    result = report(
        admin, fin, "services", person_id=fin["tenant"]["id"], start_date="2031-01-01"
    )
    assert bob(result)["services_direct"] == bob(result)["provider_direct"] == "100.00"
    assert (
        bob(result)["ordinary_received"]
        == bob(result)["cash_received"]
        == bob(result)["cash_out"]
        == "0.00"
    )
    assert (
        result["rows"][0]["provider_paid"]
        == result["rows"][0]["direct_paid"]
        == "100.00"
    )
    assert result["rows"][0]["pending"] == "50.00"


def test_contract_report_includes_explicit_guarantee_refund(admin, fin, clock):
    c, oid = rental(admin, fin)
    guarantee = call(
        admin,
        fin,
        "/guarantees",
        person_id=fin["tenant"]["id"],
        contract_id=c["id"],
        conditions="Condiciones ficticias",
        **cash(fin, 100),
    )
    call(
        admin,
        fin,
        f"/movements/{guarantee['movement_id']}/refund",
        beneficiary_person_id=fin["tenant"]["id"],
        reason="Devolución parcial ficticia",
        **cash(fin, 50, payer_id=fin["owner"]["id"]),
    )
    result = report(admin, fin, contract_id=c["id"])
    assert bob(result)["guarantees_received"] == "100.00"
    assert bob(result)["refunded"] == bob(result)["cash_out"] == "50.00"
    assert bob(result)["guarantees_available"] == "50.00"


def test_capital_economic_state_is_distinct_from_occupation_state(admin, anti, clock):
    save(admin, anti)
    deliver(admin, anti, 1000)
    restitution(admin, anti, 250)
    partial = report(admin, anti, "capital", state="partial")
    assert (
        partial["rows"][0]["state"] == "partial"
        and partial["rows"][0]["contract_state"] == "active"
    )
    assert bob(partial)["capital_pending"] == "750.00"
    restitution(admin, anti, 750)
    paid = report(admin, anti, "capital", state="paid")
    assert paid["rows"][0]["state"] == "paid" and bob(paid)["capital_pending"] == "0.00"


def test_former_capital_holder_remains_in_historical_person_report(admin, anti, clock):
    save(admin, anti)
    deliver(admin, anti, 1000)
    restitution(admin, anti, 1000)
    save(
        admin,
        anti,
        reason="Sustitución ficticia después de la restitución completa",
        holders=[
            {
                "person_id": anti["occupant"]["id"],
                "beneficiary_person_id": anti["occupant"]["id"],
                "assigned_amount": "70000",
            }
        ],
    )
    result = report(admin, anti, "capital", person_id=anti["tenant"]["id"])
    assert (
        bob(result)["capital_received"] == bob(result)["capital_returned"] == "1000.00"
    )
    assert bob(result)["capital_pending"] == "0.00"
    assert result["rows"][0]["filtered_person"] == anti["tenant"]["full_name"]


def test_receipt_crossing_months_is_not_counted_twice_in_responsibility_series(
    admin, fin, clock
):
    rental(admin, fin)
    rec = receipt(
        admin,
        fin,
        period_start="2031-01-15",
        period_end="2031-02-14",
        issued_on="2031-02-14",
        due_on="2031-02-20",
    )
    dist = calculate(admin, rec)
    assert confirm(admin, dist).status_code == 200
    call(
        admin,
        fin,
        f"/receipts/{rec['id']}/import",
        expected_distribution_id=dist["id"],
        owner_person_id=fin["owner"]["id"],
    )
    result = report(admin, fin, "services", start_date="2031-01-01")
    points = [p for p in result["series"] if p["currency"] == "BOB"]
    assert sum(
        (
            Decimal(p["owner_service_responsibility"])
            + Decimal(p["occupant_service_responsibility"])
            for p in points
        ),
        Decimal(0),
    ) == Decimal("300")
    assert len(result["rows"]) == 1


def test_recovery_balance_includes_receipts_closed_before_the_flow_period(
    admin, fin, clock
):
    rental(admin, fin)
    rec, dist, imported = services(admin, fin)
    call(
        admin,
        fin,
        f"/expenses/{imported['expense_id']}/pay",
        **cash(fin, 300, payer_id=fin["owner"]["id"]),
    )
    result = report(admin, fin, "services")
    assert (
        result["rows"] == []
    )  # El recibo cerró en enero; se consultan flujos de febrero.
    assert (
        bob(result)["recoveries_pending"] == bob(result)["service_pending"] == "150.00"
    )


def test_confirmed_unimported_distribution_is_not_a_new_financial_obligation(
    admin, fin, clock
):
    rental(admin, fin)
    rec = receipt(admin, fin)
    dist = calculate(admin, rec)
    assert confirm(admin, dist).status_code == 200
    result = report(admin, fin, "services", start_date="2031-01-01")
    assert result["rows"][0]["pending_financial_import"] is True
    assert bob(result)["service_pending"] == "0.00"
    assert Decimal(bob(result)["owner_service_responsibility"]) + Decimal(
        bob(result)["occupant_service_responsibility"]
    ) == Decimal("300")


def test_attention_counter_reuses_locked_facts_without_changing_source_semantics(
    admin, fin, clock, db
):
    rental(admin, fin)
    with Session(db) as session:
        account = session.scalar(select(User).where(User.username == "admin_test"))
        notices, _, _ = reminder_sources.project(
            session, account, fin["property"]["id"]
        )
        expected = sum(x["requires_attention"] for x in notices)
    result = report(admin, fin)
    assert result["counts"]["reminders_attention"] == expected
    # Una llamada posterior por el camino normal conserva sus lecturas actuales.
    with Session(db) as session:
        assert "phase7_locked_facts" not in session.info
        account = session.scalar(select(User).where(User.username == "admin_test"))
        notices, _, _ = reminder_sources.project(
            session, account, fin["property"]["id"]
        )
        assert sum(x["requires_attention"] for x in notices) == expected


def test_selector_metadata_does_not_lock_or_rebuild_financial_history(
    admin, fin, clock, db
):
    rental(admin, fin)
    statements = []

    def collect(connection, cursor, statement, parameters, context, many):
        statements.append(statement)

    event.listen(db, "before_cursor_execute", collect)
    try:
        response = admin.get("/api/v1/reports/options")
    finally:
        event.remove(db, "before_cursor_execute", collect)
    assert response.status_code == 200, response.text
    assert len(statements) < 25
    assert not any(
        "finance_obligations" in sql
        or "finance_movements" in sql
        or "FOR UPDATE" in sql.upper()
        for sql in statements
    )
    assert response.json()["properties"][0]["id"] == fin["property"]["id"]


@pytest.mark.parametrize(
    "days,expected", [(14, "70.00"), (15, "150.00"), (16, "150.00")]
)
def test_reports_preserve_confirmed_14_15_16_day_rule(
    admin, fin, clock, days, expected
):
    rent(
        admin,
        fin,
        end_date=f"2031-01-{days:02}",
        owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
    )
    services(admin, fin)
    output = report(admin, fin, "services", start_date="2031-01-01")
    assert output["rows"][0]["occupant_responsibility"] == expected
    assert bob(output)["service_pending"] == expected


def test_reports_daily_over_15_days_has_no_additional_service_debt(admin, fin, clock):
    rent(
        admin,
        fin,
        mode="daily",
        end_date="2031-01-20",
        daily_count="inclusive",
        owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
    )
    services(admin, fin)
    output = report(admin, fin, "services", start_date="2031-01-01")
    assert output["rows"][0]["occupant_responsibility"] == "0.00"
    assert bob(output)["service_pending"] == "0.00"
    assert output["rows"][0]["owner_responsibility"] == "300.00"


def test_reported_payment_is_claim_not_cash(admin, fin, clock):
    _, oid = rental(admin, fin)
    post(
        admin,
        f"/properties/{fin['property']['id']}/reminders/payment-reports",
        {
            "request_key": uuid4().hex,
            "obligation_id": oid,
            "reporting_person_id": fin["tenant"]["id"],
            "concept": "Pago comunicado ficticio",
            "amount": "400",
            "reported_on": "2031-02-20",
            "method_id": fin["method"],
            "document_reference": "Comprobante ficticio pendiente de verificar",
        },
    )
    g = bob(report(admin, fin))
    assert (
        g["ordinary_received"] == g["cash_received"] == "0.00"
        and g["pending"] == "500.00"
    )


def test_non_cash_capital_agreement_does_not_create_received_or_returned_money(
    admin, anti, clock
):
    save(admin, anti)
    deliver(admin, anti, 1000)
    capital_call(
        admin,
        anti,
        "/adjustments",
        kind="settlement",
        effective_on="2031-02-15",
        document_reference="Acuerdo ficticio de reducción",
        reason="Reducción acordada",
        allocations=[
            {
                "holder_id": anti["tenant"]["id"],
                "responsible_id": anti["owner"]["id"],
                "delta": "-100",
            }
        ],
    )
    g = bob(report(admin, anti, "capital"))
    assert g["capital_received"] == "1000.00" and g["capital_adjustments"] == "-100.00"
    assert g["capital_pending"] == "900.00" and g["capital_returned"] == "0.00"
    assert g["cash_received"] == g["cash_out"] == "0.00"


def test_original_charge_unit_is_historical_fact_not_current_contract_copy(
    admin, fin, clock, monkeypatch, db
):
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2030, 1, 1, 12))
    c = rent(
        admin,
        fin,
        end_date="2031-02-28",
        owner_parties=[{"person_id": fin["owner"]["id"], "share": 100}],
    )
    first = call(
        admin,
        fin,
        f"/contracts/{c['id']}/generate",
        expected_version=c["version"],
        through="2031-01-01",
    )
    changed = admin.patch(
        f"/api/v1/contracts/{c['id']}",
        json={"expected_version": c["version"], "unit_id": fin["second"]["id"]},
    )
    assert changed.status_code == 200, changed.text
    second = call(
        admin,
        fin,
        f"/contracts/{c['id']}/generate",
        expected_version=changed.json()["version"],
        through="2031-02-01",
    )
    with Session(db) as session:
        charges = list(
            session.scalars(
                select(m.FinanceObligation)
                .where(m.FinanceObligation.rent_contract_id == c["id"])
                .order_by(m.FinanceObligation.period_start)
            )
        )
        assert [x.unit_id for x in charges] == [fin["first"]["id"], fin["second"]["id"]]
    assert first["obligation_ids"][0] == second["obligation_ids"][0]
    # Contrato idéntico, distintas unidades históricas válidas: no existe la DF contrato → unidad del cargo.
    monkeypatch.setattr(tenancy, "utc_now", lambda: datetime(2032, 3, 1, 12))
    history = report(
        admin, fin, "contracts", unit_id=fin["first"]["id"], start_date="2031-01-01"
    )
    assert history["rows"][0]["contract_id"] == c["id"]
    assert bob(history)["pending"] == "50.00"


@pytest.mark.parametrize("paper", ["A4", "letter"])
def test_long_pdf_readable_pages_headers_and_escaping(admin, fin, clock, db, paper):
    c, oid = rental(admin, fin)
    with Session(db) as s:
        original = s.get(m.FinanceObligation, oid)
        for i in range(1, 70):
            s.add(
                m.FinanceObligation(
                    account_id=original.account_id,
                    unit_id=original.unit_id,
                    rent_contract_id=c["id"],
                    period_start=date(2031, 2, 1) + timedelta(days=i),
                    period_end=date(2031, 2, 1) + timedelta(days=i),
                    original_amount=Decimal("10.00"),
                    due_on=date(2031, 3, 1),
                    operation_id=original.operation_id,
                )
            )
        s.commit()
    r = admin.get(
        "/api/v1/reports/collections/pdf",
        params={
            "property_id": fin["property"]["id"],
            "start_date": "2031-02-01",
            "end_date": "2031-02-28",
            "paper": paper,
        },
    )
    assert r.status_code == 200, r.text
    reader = PdfReader(BytesIO(r.content))
    assert len(reader.pages) >= 3
    assert all("Página " in p.extract_text() for p in reader.pages)
    assert sum("Referencia" in p.extract_text() for p in reader.pages) >= 2
    assert "Alquiler" in "\n".join(p.extract_text() for p in reader.pages)


@pytest.mark.parametrize(
    "year,month,end",
    [
        (2031, 2, "2031-02-28"),
        (2032, 2, "2032-02-29"),
        (2031, 4, "2031-04-30"),
        (2031, 1, "2031-01-31"),
    ],
)
def test_calendar_period_real_month_lengths(year, month, end):
    first, last, cut = period(ReportFilters(year=year, month=month))
    assert str(last) == end and first.day == 1


def test_strict_validation_unknown_filters_and_auth(client, admin, fin, clock):
    for params in [
        {"inventado": "1"},
        {"currency": "bob"},
        {"month": 2},
        {"start_date": "2031-03-01", "end_date": "2031-02-01"},
        {"as_of": "2099-01-01"},
    ]:
        assert admin.get("/api/v1/reports/economic", params=params).status_code == 422
    assert admin.get("/api/v1/reports/inventado").status_code == 422
    admin.post("/api/v1/auth/logout")
    assert admin.get("/api/v1/reports/economic/pdf").status_code == 401


def test_63_table_inventory_candidates_constraints_models_and_migrations_intact(db):
    root = Path(__file__).resolve().parents[2]
    inventory = json.loads((root / "docs/phase-7-verification/schema.json").read_text())
    assert len(inventory["tables"]) == len(Base.metadata.tables) == 63
    doc = (root / "docs/phase-7-normalization.md").read_text()
    for name, table in inventory["tables"].items():
        assert f"### `{name}`" in doc
        assert {c["name"] for c in table["columns"]} == set(
            Base.metadata.tables[name].columns.keys()
        )
        assert table["primary_key"] in table["candidate_keys_enforced"]
        assert all(
            not next(c for c in table["columns"] if c["name"] == field)["nullable"]
            for key in table["candidate_keys_enforced"]
            for field in key
        )
    for filename, info in inventory["historical_migrations"].items():
        assert (
            hashlib.sha256(
                (root / "backend/migrations/versions" / filename).read_bytes()
            ).hexdigest()
            == info["sha256"]
        )
    if db.dialect.name == "mysql":
        real = inspect(db)
        assert set(real.get_table_names()) == set(inventory["tables"]) | (
            {"alembic_version"}
            if "alembic_version" in real.get_table_names()
            else set()
        )
        for name, table in inventory["tables"].items():
            assert (
                real.get_pk_constraint(name)["constrained_columns"]
                == table["primary_key"]
            )
            assert len(real.get_foreign_keys(name)) == len(table["foreign_keys"])
