"""Migración 0006 en MySQL nuevo descartable, con todas las tablas previas."""

import os
from pathlib import Path
from unittest.mock import patch
import pytest
import sqlalchemy as sa
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from test_migration_3 import PREVIOUS, ADDED, seed_phase2
from test_migration_2 import rows, reset

OLD = PREVIOUS | ADDED
NEW = {
    "finance_methods",
    "finance_categories",
    "finance_accounts",
    "finance_operations",
    "finance_obligations",
    "finance_adjustments",
    "finance_expenses",
    "finance_expense_adjustments",
    "finance_movements",
    "finance_incoming",
    "finance_guarantees",
    "finance_disbursements",
    "finance_refunds",
    "finance_applications",
    "finance_utility_imports",
    "finance_utility_links",
}


def migrate(url, target="0006_finances", direction="upgrade"):
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), target
            )
        finally:
            get_settings.cache_clear()


@pytest.fixture
def migration_db4():
    url = os.environ.get("PHASE4_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE4_MIGRATION_DATABASE_URL no configurada")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "mysql" and parsed.database.endswith("_test")
    engine = sa.create_engine(url)
    reset(engine)
    try:
        yield url, engine
    finally:
        reset(engine)
        migrate(url,target='head')
        engine.dispose()


def seed_previous(engine):
    seed_phase2(engine)
    with engine.begin() as c:
        actor = c.scalar(sa.text("SELECT min(id) FROM users"))
        statements = [
            "INSERT INTO service_accounts(id,property_id,type_id,label,provider,measurement_kind,measure_unit,start_date) VALUES (60,10,1,'Electricidad histórica','Proveedor externo','shared','kWh','2030-01-01')",
            "INSERT INTO utility_meters(id,account_id,unit_id,serial,installed_on) VALUES(70,60,20,'Medidor histórico','2031-01-01')",
            "INSERT INTO meter_readings(id,meter_id,recorded_on,value) VALUES(71,70,'2031-01-01',100)",
            f"INSERT INTO utility_configurations(id,account_id,revision,method,economic_policy,owner_person_id,provider_payer_id,reimbursement_person_id,created_by) VALUES(80,60,1,'equal','occupant',1,1,1,{actor})",
            "INSERT INTO utility_configuration_units(configuration_id,unit_id) VALUES(80,20)",
            "INSERT INTO utility_receipts(id,account_id) VALUES(90,60)",
            f"INSERT INTO utility_receipt_revisions(id,receipt_id,revision,amount,currency,issued_on,period_start,period_end,due_on,created_by) VALUES(91,90,1,300,'BOB','2031-01-31','2031-01-01','2031-01-30','2031-02-10',{actor})",
            f"INSERT INTO utility_distributions(id,receipt_revision_id,configuration_id,request_key,status,evidence,created_by,confirmed_by,confirmed_at) VALUES(100,91,80,'historical_distribution','confirmed','{{}}',{actor},{actor},'2031-02-01 10:00:00')",
            "INSERT INTO utility_allocations(id,distribution_id,unit_id,amount,weight) VALUES(110,100,20,300,1)",
            "INSERT INTO utility_responsibilities(id,allocation_id,person_id,contract_id,amount) VALUES(120,110,2,50,220),(121,110,1,NULL,80)",
            "INSERT INTO utility_current_distributions(receipt_id,distribution_id) VALUES(90,100)",
        ]
        for sql in statements:
            c.execute(sa.text(sql))


def test_clean_mysql_finance_migration(migration_db4):
    url, engine = migration_db4
    migrate(url)
    inspector = sa.inspect(engine)
    assert len(OLD) == 25 and len(NEW) == 16
    assert set(inspector.get_table_names()) == OLD | NEW | {"alembic_version"}
    with engine.connect() as c:
        assert c.scalar(sa.text("SELECT count(*) FROM finance_methods")) == 5
        assert c.scalar(sa.text("SELECT count(*) FROM finance_categories")) == 7
        assert (
            c.scalar(sa.text("SELECT version_num FROM alembic_version"))
            == "0006_finances"
        )
    for table, column in [
        ("finance_movements", "amount"),
        ("finance_obligations", "original_amount"),
        ("finance_applications", "amount"),
    ]:
        typ = next(
            c["type"] for c in inspector.get_columns(table) if c["name"] == column
        )
        assert typ.precision == 14 and typ.scale == 2
    for table in NEW:
        for fk in inspector.get_foreign_keys(table):
            assert fk.get("options", {}).get("ondelete", "RESTRICT") in {
                "RESTRICT",
                "NO ACTION",
            }
    assert "person_id" not in {
        c["name"] for c in inspector.get_columns("finance_movements")
    }
    assert "currency" not in {
        c["name"] for c in inspector.get_columns("finance_obligations")
    }


def test_populated_upgrade_downgrade_preserves_25_previous_tables(migration_db4):
    url, engine = migration_db4
    migrate(url, "0005_utilities")
    seed_previous(engine)
    before = {table: rows(engine, table) for table in OLD}
    assert all(before.values()), "Every prior table must contain representative data"
    for direction, target in [
        ("upgrade", "0006_finances"),
        ("downgrade", "0005_utilities"),
        ("upgrade", "0006_finances"),
    ]:
        migrate(url, target, direction)
        assert all(rows(engine, t) == before[t] for t in OLD)


def test_mysql_finance_sql_constraints(migration_db4):
    url, engine = migration_db4
    migrate(url)
    seed_previous(engine)
    with engine.begin() as c:
        actor = c.scalar(sa.text("SELECT min(id) FROM users"))
        c.execute(
            sa.text(
                "INSERT INTO finance_accounts(id,property_id,person_id,currency) VALUES(1,10,2,'BOB')"
            )
        )
        c.execute(
            sa.text(
                f"INSERT INTO finance_operations(id,property_id,request_key,action,payload_hash,result,created_by,created_at) VALUES(1,10,'request_sql_test','test','hash','{{}}',{actor},'2031-01-01 10:00:00')"
            )
        )
    bad = [
        "INSERT INTO finance_accounts(property_id,person_id,currency) VALUES(10,2,'BOB')",
        "INSERT INTO finance_accounts(property_id,person_id,currency) VALUES(999999,2,'USD')",
        "INSERT INTO finance_movements(amount,occurred_on,method_id,payer_id,operation_id) VALUES(-1,'2031-01-01',1,2,1)",
        "INSERT INTO finance_applications(source_movement_id,obligation_id,amount,operation_id) VALUES(99999,99999,10,1)",
        "INSERT INTO finance_obligations(account_id,period_start,period_end,original_amount,due_on,operation_id) VALUES(1,'2031-01-01','2031-01-30',10,'2031-02-01',1)",
    ]
    for sql in bad:
        with pytest.raises(DBAPIError):
            with engine.begin() as c:
                c.execute(sa.text(sql))
