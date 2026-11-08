"""0007 desde cero y con las 41 tablas previas pobladas, solo MySQL descartable."""

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
from test_migration_4 import OLD, NEW, seed_previous
from test_migration_2 import rows, reset

PREVIOUS = OLD | NEW
ADDED = {
    "anticretico_terms",
    "anticretico_revisions",
    "anticretico_holders",
    "anticretico_responsibles",
    "anticretico_movements",
    "anticretico_allocations",
    "anticretico_adjustments",
    "anticretico_adjustment_lines",
}


def migrate(url, target="0007_anticreticos", direction="upgrade"):
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), target
            )
        finally:
            get_settings.cache_clear()


@pytest.fixture
def migration_db5():
    url = os.getenv("PHASE5_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE5_MIGRATION_DATABASE_URL no configurada")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "mysql" and parsed.database.endswith("_test")
    engine = sa.create_engine(url)
    reset(engine)
    try:
        yield url, engine
    finally:
        reset(engine)
        migrate(url, "head")
        engine.dispose()


def seed_41(engine):
    seed_previous(engine)
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO contracts(id,unit_id,responsible_person_id,mode,status,start_date,end_date,currency,payment_timing,services_included) VALUES(51,21,2,'anticretico','active','2031-01-01','2032-01-31','EUR','advance',0)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO contract_owners(contract_id,person_id,share) VALUES(51,1,100)"
            )
        )
        for i in range(1, 11):
            c.execute(
                sa.text(
                    "INSERT INTO finance_operations(id,property_id,request_key,action,payload_hash,result,created_by,created_at) VALUES(:id,10,:key,'preserved','historical','{}',30,'2031-02-01 10:00:00')"
                ),
                {"id": i, "key": f"preserved_operation_{i}"},
            )
        statements = [
            "INSERT INTO finance_accounts(id,property_id,person_id,currency) VALUES(1,10,2,'BOB'),(2,10,1,'BOB')",
            "INSERT INTO finance_obligations(id,account_id,unit_id,rent_contract_id,period_start,period_end,original_amount,due_on,operation_id) VALUES(200,1,20,50,'2031-01-01','2031-01-31',1000,'2031-02-05',1)",
            "INSERT INTO finance_obligations(id,account_id,unit_id,service_origin_id,period_start,period_end,original_amount,due_on,operation_id) VALUES(201,1,20,120,'2031-01-01','2031-01-30',220,'2031-02-10',2)",
            "INSERT INTO finance_expenses(id,account_id,category_id,receipt_id,description,recorded_on,original_amount,operation_id) VALUES(210,2,4,90,'Gasto externo preservado','2031-01-31',300,3)",
            "INSERT INTO finance_expense_adjustments(expense_id,delta,operation_id) VALUES(210,10,4)",
            "INSERT INTO finance_movements(id,amount,occurred_on,method_id,payer_id,operation_id) VALUES(220,1000,'2031-02-01',1,2,5),(221,100,'2031-02-01',1,2,6),(222,100,'2031-02-01',1,1,7),(223,20,'2031-02-01',1,1,8)",
            "INSERT INTO finance_incoming(movement_id,account_id,category) VALUES(220,1,'collection')",
            "INSERT INTO finance_guarantees(movement_id,account_id,contract_id,conditions) VALUES(221,1,50,'Garantía ordinaria preservada')",
            "INSERT INTO finance_disbursements(movement_id,expense_id,is_direct) VALUES(222,210,0)",
            "INSERT INTO finance_refunds(movement_id,source_movement_id) VALUES(223,221)",
            "INSERT INTO finance_applications(source_movement_id,obligation_id,amount,operation_id) VALUES(220,200,1000,5)",
            "INSERT INTO finance_adjustments(obligation_id,delta,operation_id) VALUES(201,-20,9)",
            "INSERT INTO finance_utility_imports(distribution_id,operation_id) VALUES(100,10)",
            "INSERT INTO finance_utility_links(responsibility_id,obligation_id) VALUES(120,201)",
        ]
        for sql in statements:
            c.execute(sa.text(sql))


def test_clean_mysql_0007_and_normalized_structure(migration_db5):
    url, engine = migration_db5
    migrate(url)
    inspector = sa.inspect(engine)
    assert len(PREVIOUS) == 41 and len(ADDED) == 8
    assert set(inspector.get_table_names()) == PREVIOUS | ADDED | {"alembic_version"}
    for table in ADDED:
        for fk in inspector.get_foreign_keys(table):
            assert fk.get("options", {}).get("ondelete", "RESTRICT") in {
                "RESTRICT",
                "NO ACTION",
            }
    assert inspector.get_pk_constraint("anticretico_terms")["constrained_columns"] == [
        "contract_id"
    ]
    cols = {c["name"]: c for c in inspector.get_columns("anticretico_revisions")}
    assert "currency" not in cols and "property_id" not in cols
    assert (
        cols["agreed_capital"]["type"].precision == 14
        and cols["agreed_capital"]["type"].scale == 2
    )
    assert set(c["name"] for c in inspector.get_columns("anticretico_movements")) == {
        "movement_id",
        "revision_id",
        "kind",
    }
    with engine.connect() as c:
        assert (
            c.scalar(sa.text("SELECT version_num FROM alembic_version"))
            == "0007_anticreticos"
        )


def test_upgrade_downgrade_preserve_all_41_tables_and_legacy_contract(migration_db5):
    url, engine = migration_db5
    migrate(url, "0006_finances")
    seed_41(engine)
    before = {table: rows(engine, table) for table in PREVIOUS}
    assert all(before.values()), "Populate every previous table"
    for direction, target in [
        ("upgrade", "0007_anticreticos"),
        ("downgrade", "0006_finances"),
        ("upgrade", "0007_anticreticos"),
    ]:
        migrate(url, target, direction)
        assert all(rows(engine, t) == before[t] for t in PREVIOUS)
    from sqlalchemy.orm import Session
    from app.models.entities import User
    from app.services.anticreticos import listing

    with Session(engine) as s:
        result = listing(s, s.get(User, 30), 10)
        assert len(result["items"]) == 1
        assert (
            result["items"][0]["conditions"] is None
            and result["items"][0]["capital_received"] == "0.00"
        )
        assert result["items"][0]["contract"]["price"] is None


def test_mysql_capital_fk_uniques_and_checks(migration_db5):
    url, engine = migration_db5
    migrate(url)
    seed_41(engine)
    with engine.begin() as c:
        for i in [11, 12, 13]:
            c.execute(
                sa.text(
                    "INSERT INTO finance_operations(id,property_id,request_key,action,payload_hash,result,created_by,created_at) VALUES(:id,10,:key,'capital_test','historical','{}',30,'2031-02-01 10:00:00')"
                ),
                {"id": i, "key": f"capital_sql_{i}"},
            )
        for sql in [
            "INSERT INTO anticretico_terms(contract_id) VALUES(51)",
            "INSERT INTO anticretico_revisions(id,contract_id,revision,agreed_capital,conditions,operation_id) VALUES(300,51,1,70000,'Acuerdo de prueba',11)",
            "INSERT INTO finance_movements(id,amount,occurred_on,method_id,payer_id,operation_id) VALUES(500,1000,'2031-01-01',1,2,12)",
            "INSERT INTO anticretico_movements(movement_id,revision_id,kind) VALUES(500,300,'delivery')",
            "INSERT INTO anticretico_allocations(movement_id,holder_id,responsible_id,amount) VALUES(500,2,1,1000)",
            "INSERT INTO anticretico_adjustments(id,revision_id,kind,effective_on,document_reference,operation_id) VALUES(700,300,'settlement','2031-02-01','Referencia externa',13)",
        ]:
            c.execute(sa.text(sql))
    invalid = [
        "INSERT INTO anticretico_terms(contract_id) VALUES(999999)",
        "INSERT INTO anticretico_allocations(movement_id,holder_id,responsible_id,amount) VALUES(500,2,1,1000)",
        "INSERT INTO anticretico_allocations(movement_id,holder_id,responsible_id,amount) VALUES(500,1,2,-1)",
        "INSERT INTO anticretico_allocations(movement_id,holder_id,responsible_id,amount) VALUES(500,999999,1,10)",
        "INSERT INTO anticretico_adjustment_lines(adjustment_id,holder_id,responsible_id,delta) VALUES(700,2,1,0)",
    ]
    for sql in invalid:
        with pytest.raises(DBAPIError):
            with engine.begin() as c:
                c.execute(sa.text(sql))
