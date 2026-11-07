"""Migración 0004 sobre bases MySQL descartables vacías y con datos."""

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

OLD = "0003_identity"
NEW = "0004_tenancy"
OLD_TABLES = {
    "persons",
    "properties",
    "property_owners",
    "units",
    "users",
    "property_access",
    "auth_sessions",
    "audit_events",
}
NEW_TABLES = {
    "contracts",
    "contract_occupants",
    "contract_owners",
    "reservations",
    "property_contacts",
}


def migrate(url, target=NEW, direction="upgrade"):
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), target
            )
        finally:
            get_settings.cache_clear()


def reset(engine):
    metadata = sa.MetaData()
    metadata.reflect(engine)
    metadata.drop_all(engine)


@pytest.fixture
def migration_db2():
    url = os.environ.get("PHASE2_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE2_MIGRATION_DATABASE_URL no configurada")
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


def rows(engine, name):
    table = sa.Table(name, sa.MetaData(), autoload_with=engine)
    with engine.connect() as connection:
        return [
            dict(r)
            for r in connection.execute(
                sa.select(table).order_by(*table.primary_key.columns)
            ).mappings()
        ]


def seed_0003(engine):
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO persons(id,full_name,is_owner) VALUES (1,'Titular de prueba',1),(2,'Inquilino de prueba',0)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO properties(id,name,address,city) VALUES (10,'Casa preservada','Calle de prueba','La Paz')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO property_owners(property_id,person_id,share) VALUES (10,1,100)"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO units(id,property_id,code,name,unit_type) VALUES (20,10,'01','Cuarto preservado','cuarto'),(21,10,'02','Cuarto segundo','cuarto')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO users(id,username,person_id,password_hash,role) VALUES (30,'migration_test',1,'hash_ficticio_preservado','general_admin')"
            )
        )
        c.execute(
            sa.text("INSERT INTO property_access(property_id,user_id) VALUES (10,30)")
        )
        c.execute(
            sa.text(
                "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (:token,30,'2031-01-01')"
            ),
            {"token": "b" * 64},
        )
        c.execute(
            sa.text(
                "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,details) VALUES (30,'create','persons',1,:details)"
            ),
            {"details": '{"historical":true}'},
        )


def test_phase2_migration_from_clean_mysql(migration_db2):
    url, engine = migration_db2
    migrate(url)
    inspector = sa.inspect(engine)
    assert set(inspector.get_table_names()) == OLD_TABLES | NEW_TABLES | {
        "alembic_version"
    }
    columns = {x["name"]: x for x in inspector.get_columns("contracts")}
    assert columns["price"]["type"].scale == 2
    assert columns["property_id"]["nullable"] and columns["unit_id"]["nullable"]
    assert len(inspector.get_foreign_keys("contracts")) == 4
    assert inspector.get_pk_constraint("contract_occupants")["constrained_columns"] == [
        "contract_id",
        "person_id",
    ]
    assert inspector.get_pk_constraint("contract_owners")["constrained_columns"] == [
        "contract_id",
        "person_id",
    ]
    with engine.connect() as c:
        assert c.scalar(sa.text("SELECT version_num FROM alembic_version")) == NEW


def test_phase2_upgrade_and_downgrade_preserve_previous_phase_data(migration_db2):
    url, engine = migration_db2
    migrate(url, OLD)
    seed_0003(engine)
    before = {name: rows(engine, name) for name in OLD_TABLES}
    migrate(url)
    for name in OLD_TABLES:
        assert rows(engine, name) == before[name]
    migrate(url, OLD, "downgrade")
    assert set(sa.inspect(engine).get_table_names()) == OLD_TABLES | {"alembic_version"}
    for name in OLD_TABLES:
        assert rows(engine, name) == before[name]
    migrate(url)
    for name in OLD_TABLES:
        assert rows(engine, name) == before[name]


def test_phase2_sql_integrity_target_dates_prices_and_conversion_uniqueness(
    migration_db2,
):
    url, engine = migration_db2
    migrate(url, OLD)
    seed_0003(engine)
    migrate(url)
    base = "INSERT INTO contracts(property_id,unit_id,responsible_person_id,mode,status,start_date,end_date,price,currency,payment_timing,services_included) VALUES "
    invalid = [
        "(10,20,2,'daily','active','2031-01-01','2031-01-03',50,'BOB','advance',1)",
        "(NULL,NULL,2,'daily','active','2031-01-01','2031-01-03',50,'BOB','advance',1)",
        "(NULL,20,2,'daily','active','2031-01-03','2031-01-01',50,'BOB','advance',1)",
        "(NULL,20,2,'daily','active','2031-01-01','2031-01-03',-1,'BOB','advance',1)",
        "(NULL,20,2,'daily','active','2031-01-01','2031-01-03',NULL,'BOB','advance',1)",
        "(NULL,20,2,'daily','active','2031-01-01','2031-01-03',50,'BOB','advance',0)",
        "(NULL,999999,2,'daily','active','2031-01-01','2031-01-03',50,'BOB','advance',1)",
    ]
    for value in invalid:
        with pytest.raises(DBAPIError):
            with engine.begin() as c:
                c.execute(sa.text(base + value))
    with engine.begin() as c:
        c.execute(
            sa.text(
                "INSERT INTO reservations(id,unit_id,person_id,mode,status,start_date,end_date) VALUES (40,20,2,'daily','converted','2031-01-01','2031-01-03')"
            )
        )
        c.execute(
            sa.text(
                "INSERT INTO contracts(unit_id,responsible_person_id,source_reservation_id,mode,status,start_date,end_date,price,currency,payment_timing,services_included) VALUES (20,2,40,'daily','active','2031-01-01','2031-01-03',50,'BOB','advance',1)"
            )
        )
    with pytest.raises(DBAPIError):
        with engine.begin() as c:
            c.execute(
                sa.text(
                    "INSERT INTO contracts(unit_id,responsible_person_id,source_reservation_id,mode,status,start_date,end_date,price,currency,payment_timing,services_included) VALUES (21,2,40,'daily','draft','2031-01-01','2031-01-03',50,'BOB','advance',1)"
                )
            )
