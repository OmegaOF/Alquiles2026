"""Migración real 0005, exclusivamente en MySQL descartable explícito."""

import os
from pathlib import Path
from unittest.mock import patch
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from app.core.config import get_settings
from test_migration_2 import OLD_TABLES, NEW_TABLES, seed_0003, rows, reset

PREVIOUS = OLD_TABLES | NEW_TABLES
ADDED = {
    "utility_types",
    "service_accounts",
    "utility_meters",
    "meter_readings",
    "utility_configurations",
    "utility_configuration_units",
    "utility_receipts",
    "utility_receipt_revisions",
    "utility_distributions",
    "utility_allocations",
    "utility_responsibilities",
    "utility_current_distributions",
}


def migrate(url, target="0005_utilities", direction="upgrade"):
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), target
            )
        finally:
            get_settings.cache_clear()


@pytest.fixture
def migration_db3():
    url = os.environ.get("PHASE3_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE3_MIGRATION_DATABASE_URL no configurada")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "mysql" and parsed.database.endswith("_test")
    engine = sa.create_engine(url)
    reset(engine)
    try:
        yield url, engine
    finally:
        reset(engine)
        migrate(url)
        engine.dispose()


def seed_phase2(engine):
    seed_0003(engine)
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO property_contacts(property_id,person_id) VALUES (10,2)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO reservations(id,unit_id,person_id,mode,status,start_date,end_date) VALUES (40,20,2,'monthly','converted','2031-01-01','2031-01-31')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO contracts(id,unit_id,responsible_person_id,source_reservation_id,mode,status,start_date,end_date,price,currency,payment_timing,services_included,monthly_period,first_period,due_day) VALUES (50,20,2,40,'monthly','active','2031-01-01','2031-01-31',1000,'BOB','advance',0,'calendar','full',5)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO contract_occupants(contract_id,person_id) VALUES (50,1)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO contract_owners(contract_id,person_id,share) VALUES (50,1,100)"
            )
        )


def test_clean_mysql_migration_0005_and_normalized_structure(migration_db3):
    url, engine = migration_db3
    migrate(url)
    inspector = sa.inspect(engine)
    assert set(inspector.get_table_names()) == PREVIOUS | ADDED | {"alembic_version"}
    assert len(PREVIOUS) == 13 and len(ADDED) == 12
    receipt_cols = {
        c["name"]: c for c in inspector.get_columns("utility_receipt_revisions")
    }
    assert (
        receipt_cols["amount"]["type"].precision == 14
        and receipt_cols["amount"]["type"].scale == 2
    )
    responsibility_cols = {
        c["name"] for c in inspector.get_columns("utility_responsibilities")
    }
    assert responsibility_cols == {
        "id",
        "allocation_id",
        "person_id",
        "contract_id",
        "amount",
    }
    assert inspector.get_pk_constraint("utility_current_distributions")[
        "constrained_columns"
    ] == ["receipt_id"]
    assert any(
        u["column_names"] == ["distribution_id"]
        for u in inspector.get_unique_constraints("utility_current_distributions")
    )
    for table in ADDED:
        for fk in inspector.get_foreign_keys(table):
            assert fk.get("options", {}).get("ondelete", "RESTRICT") in {
                "RESTRICT",
                "NO ACTION",
            }
    with engine.connect() as c:
        assert (
            c.scalar(sa.text("SELECT version_num FROM alembic_version"))
            == "0005_utilities"
        )
        assert c.scalar(sa.text("SELECT count(*) FROM utility_types")) == 6


def test_upgrade_downgrade_preserves_all_phase2_rows(migration_db3):
    url, engine = migration_db3
    migrate(url, "0004_tenancy")
    seed_phase2(engine)
    before = {table: rows(engine, table) for table in PREVIOUS}
    migrate(url)
    for table in PREVIOUS:
        assert rows(engine, table) == before[table]
    migrate(url, "0004_tenancy", "downgrade")
    assert set(sa.inspect(engine).get_table_names()) == PREVIOUS | {"alembic_version"}
    for table in PREVIOUS:
        assert rows(engine, table) == before[table]
    migrate(url)
    for table in PREVIOUS:
        assert rows(engine, table) == before[table]


def test_mysql_sql_restrictions_readings_and_current_confirmation(migration_db3):
    url, engine = migration_db3
    migrate(url, "0004_tenancy")
    seed_phase2(engine)
    migrate(url)
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO service_accounts(id,property_id,type_id,label,provider,measurement_kind,start_date) VALUES (60,10,1,'Electricidad de prueba','Proveedor','shared','2030-01-01')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO utility_meters(id,account_id,unit_id,serial,installed_on) VALUES (70,60,20,'TEST','2031-01-01')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO meter_readings(meter_id,recorded_on,value) VALUES (70,'2031-01-01',10)"
            )
        )
    invalid = [
        "INSERT INTO meter_readings(meter_id,recorded_on,value) VALUES (70,'2031-01-02',-1)",
        "INSERT INTO meter_readings(meter_id,recorded_on,value) VALUES (999999,'2031-01-02',10)",
        "INSERT INTO meter_readings(meter_id,recorded_on,value) VALUES (70,'2031-01-01',11)",
        "INSERT INTO service_accounts(property_id,type_id,label,provider,measurement_kind,start_date) VALUES (10,1,'Electricidad de prueba','Proveedor','shared','2030-01-01')",
    ]
    for statement in invalid:
        with pytest.raises(DBAPIError):
            with engine.begin() as c:
                c.execute(sa.text(statement))
