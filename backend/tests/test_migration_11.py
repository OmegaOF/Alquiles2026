"""Migraciones reales: únicamente una URL explícita de MySQL descartable."""
import json
import os
import secrets
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy.dialects import mysql
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import utc_now
from app.core.config import get_settings
from app.core.security import COOKIE_NAME, hash_password, token_digest
from app.db.session import get_db
from app.main import app

BACKEND = Path(__file__).resolve().parents[1]
OLD = "0002_phase1"
NEW = "0003_identity"


def migrate(url, direction="upgrade", target=NEW):
    config = Config(str(BACKEND / "alembic.ini"))
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(config, target)
        finally:
            get_settings.cache_clear()


def reset(engine):
    metadata = sa.MetaData()
    metadata.reflect(engine)
    metadata.drop_all(engine)


@pytest.fixture
def migration_db():
    url = os.environ.get("PHASE11_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE11_MIGRATION_DATABASE_URL no configurada; se omiten migraciones MySQL descartables")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "mysql" and parsed.database.endswith("_test"), "La migración solo se prueba sobre MySQL explícito terminado en _test"
    engine = sa.create_engine(url)
    reset(engine)
    try:
        yield url, engine
    finally:
        # No dejar a las pruebas de regresión ni a alembic check un esquema parcial.
        reset(engine)
        migrate(url)
        engine.dispose()


def table_snapshot(engine, table):
    metadata = sa.MetaData()
    target = sa.Table(table, metadata, autoload_with=engine)
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(sa.select(target).order_by(*target.primary_key.columns)).mappings()]


def representative_data(engine):
    """Datos ficticios: identidades, aliases discrepantes y nombres no inequívocos."""
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO persons (id,full_name,is_owner) VALUES (10,'Titular canónico',1),(20,'Otra persona',1)"))
        connection.execute(sa.text("INSERT INTO properties (id,name,address,city) VALUES (100,'Casa uno','Calle de prueba','La Paz'),(200,'Casa dos','Calle de prueba','La Paz')"))
        connection.execute(sa.text("INSERT INTO property_owners (property_id,person_id,share) VALUES (100,10,100),(200,10,100)"))
        connection.execute(sa.text("INSERT INTO units (id,property_id,code,name,unit_type) VALUES (1001,100,'01','Cuarto uno','cuarto'),(1002,100,'02','Cuarto dos','cuarto'),(2001,200,'01','Cuarto uno','cuarto')"))
        connection.execute(sa.text("INSERT INTO users (id,username,full_name,password_hash,role,person_id,is_active) VALUES "
                                   "(1,'linked','Etiqueta anterior','hash_de_prueba_1','owner',10,1),"
                                   "(2,'same_name','Titular canónico','hash_de_prueba_2','operator',10,1),"
                                   "(3,'unlinked_a','Cuenta sin vínculo','hash_de_prueba_3','property_admin',NULL,1),"
                                   "(4,'unlinked_b','Cuenta sin vínculo','hash_de_prueba_4','general_admin',NULL,0)"))
        connection.execute(sa.text("INSERT INTO property_access (property_id,user_id) VALUES (100,3),(200,2)"))
        connection.execute(sa.text("INSERT INTO auth_sessions (id,token_hash,user_id,expires_at) VALUES (7,:token,1,'2027-01-01 00:00:00')"), {"token": "a" * 64})
        connection.execute(sa.text("INSERT INTO audit_events (id,actor_id,action,entity_type,entity_id,details) VALUES (8,1,'update','properties',100,:details)"),
                           {"details": json.dumps({"before": {"name": "Nombre previo"}, "after": {"name": "Casa uno"}}, ensure_ascii=False)})


def assert_new_structure(engine):
    inspector = sa.inspect(engine)
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    assert "full_name" not in columns
    assert columns["person_id"]["nullable"] is False
    assert columns["display_name"]["nullable"] is True
    assert isinstance(next(column for column in inspector.get_columns("audit_events") if column["name"] == "details")["type"], mysql.MEDIUMTEXT)
    foreign = next(key for key in inspector.get_foreign_keys("users") if key["constrained_columns"] == ["person_id"])
    assert foreign["referred_table"] == "persons"
    assert foreign["referred_columns"] == ["id"]
    assert foreign["options"].get("ondelete", "RESTRICT") in {"RESTRICT", "NO ACTION"}
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == NEW


def test_clean_mysql_applies_all_migrations(migration_db):
    url, engine = migration_db
    migrate(url)
    assert_new_structure(engine)
    assert set(sa.inspect(engine).get_table_names()) == {"persons", "users", "properties", "property_owners", "property_access", "units", "auth_sessions", "audit_events", "alembic_version"}
    assert table_snapshot(engine, "users") == []
    assert table_snapshot(engine, "persons") == []


def test_populated_upgrade_preserves_data_and_downgrade_is_lossless_for_names(migration_db):
    url, engine = migration_db
    migrate(url, target=OLD)
    representative_data(engine)
    old_users = {row["id"]: row for row in table_snapshot(engine, "users")}
    unchanged_tables = ["properties", "property_owners", "property_access", "units", "auth_sessions", "audit_events"]
    before = {name: table_snapshot(engine, name) for name in unchanged_tables}
    original_people = table_snapshot(engine, "persons")
    original_fk = sa.inspect(engine).get_foreign_keys("users")[0]["name"]
    migrate(url)
    assert_new_structure(engine)
    assert sa.inspect(engine).get_foreign_keys("users")[0]["name"] == original_fk
    users = {row["id"]: row for row in table_snapshot(engine, "users")}
    people = {row["id"]: row for row in table_snapshot(engine, "persons")}
    assert users[1]["person_id"] == users[2]["person_id"] == 10
    assert users[1]["display_name"] == "Etiqueta anterior"
    assert users[2]["display_name"] is None
    assert users[3]["person_id"] != users[4]["person_id"]
    assert users[3]["person_id"] not in {10, 20} and users[4]["person_id"] not in {10, 20}
    assert users[3]["display_name"] is users[4]["display_name"] is None
    assert people[users[3]["person_id"]]["full_name"] == people[users[4]["person_id"]]["full_name"] == "Cuenta sin vínculo"
    assert len(people) == 4
    assert [people[row["id"]] for row in original_people] == original_people
    for user_id, previous in old_users.items():
        assert {key: value for key, value in users[user_id].items() if key not in {"display_name", "person_id"}} == {
            key: value for key, value in previous.items() if key not in {"full_name", "person_id"}}
    for table, snapshot in before.items():
        assert table_snapshot(engine, table) == snapshot
    migrate(url, "downgrade", OLD)
    restored = {row["id"]: row for row in table_snapshot(engine, "users")}
    assert {id_: row["full_name"] for id_, row in restored.items()} == {id_: row["full_name"] for id_, row in old_users.items()}
    assert set(restored) == set(old_users)
    assert len(table_snapshot(engine, "persons")) == 4  # No borrar identidades creadas.
    for table, snapshot in before.items():
        assert table_snapshot(engine, table) == snapshot
    migrate(url)
    assert_new_structure(engine)
    assert len(table_snapshot(engine, "persons")) == 4


def test_migrated_mysql_preserves_foreign_keys_and_unique_constraints(migration_db):
    url, engine = migration_db
    migrate(url, target=OLD)
    representative_data(engine)
    migrate(url)
    statements = [
        "INSERT INTO users(username,password_hash,role,person_id) VALUES ('bad_null','x','operator',NULL)",
        "INSERT INTO users(username,password_hash,role,person_id) VALUES ('bad_fk','x','operator',999999)",
        "INSERT INTO users(username,password_hash,role,person_id) VALUES ('linked','x','operator',10)",
        "INSERT INTO units(property_id,code,name,unit_type) VALUES (100,'01','Duplicado','cuarto')",
        "INSERT INTO property_owners(property_id,person_id,share) VALUES (100,10,50)",
        "INSERT INTO property_access(property_id,user_id) VALUES (100,3)",
    ]
    for statement in statements:
        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                connection.execute(sa.text(statement))
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO units(property_id,code,name,unit_type) VALUES (200,'02','Permitido','cuarto')"))
    assert len(table_snapshot(engine, "units")) == 4


def test_existing_session_and_real_password_work_after_upgrade(migration_db):
    url, engine = migration_db
    migrate(url, target=OLD)
    password = secrets.token_urlsafe(24)
    encoded = hash_password(password)
    token = secrets.token_urlsafe(32)
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO persons(id,full_name,is_owner) VALUES (10,'Identidad canónica',0)"))
        connection.execute(sa.text(
            "INSERT INTO users(id,username,full_name,password_hash,role,person_id) "
            "VALUES (11,'legacy_login','Alias anterior',:password_hash,'operator',10)"
        ), {"password_hash": encoded})
        connection.execute(sa.text(
            "INSERT INTO auth_sessions(id,token_hash,user_id,expires_at) VALUES (12,:digest,11,:expires)"
        ), {"digest": token_digest(token), "expires": utc_now() + timedelta(hours=1)})
    sessions_before = table_snapshot(engine, "auth_sessions")
    migrate(url)
    assert table_snapshot(engine, "users")[0]["password_hash"] == encoded
    assert table_snapshot(engine, "auth_sessions") == sessions_before

    def override():
        with Session(engine) as session:
            yield session

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    try:
        with TestClient(app, base_url="https://testserver") as client:
            client.cookies.set(COOKIE_NAME, token, path="/api")
            current = client.get("/api/v1/auth/me")
            assert current.status_code == 200, current.text
            assert current.json()["id"] == 11
            assert current.json()["full_name"] == "Identidad canónica"
            assert current.json()["display_name"] == "Alias anterior"
            logged_in = client.post("/api/v1/auth/login", json={"username": "legacy_login", "password": password})
            assert logged_in.status_code == 200, logged_in.text
            assert logged_in.json()["username"] == "legacy_login"
            assert client.get("/api/v1/auth/me").json()["id"] == 11
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override


def test_downgrade_refuses_to_truncate_large_audit_before_schema_changes(migration_db):
    url, engine = migration_db
    migrate(url)
    details = json.dumps({"historical": "x" * 70000})
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,details) VALUES (NULL,'migration_test','persons',1,:details)"), {"details": details})
    with pytest.raises(RuntimeError, match="65535"):
        migrate(url, "downgrade", OLD)
    assert_new_structure(engine)
    assert table_snapshot(engine, "audit_events")[0]["details"] == details


def test_backfill_failure_rolls_back_people_and_links_before_retry(migration_db):
    url, engine = migration_db
    migrate(url, target=OLD)
    representative_data(engine)
    people_before = table_snapshot(engine, "persons")
    links_before = {row["id"]: row["person_id"] for row in table_snapshot(engine, "users")}
    original_execute = sa.engine.Connection.execute

    inserted_people = 0

    def interrupt_second_person(connection, statement, *args, **kwargs):
        nonlocal inserted_people
        if getattr(statement, "is_insert", False) and statement.table.name == "persons":
            inserted_people += 1
            if inserted_people == 2:
                raise RuntimeError("Interrupción simulada dentro del backfill")
        return original_execute(connection, statement, *args, **kwargs)

    with patch.object(sa.engine.Connection, "execute", interrupt_second_person):
        with pytest.raises(RuntimeError, match="dentro del backfill"):
            migrate(url)
    assert inserted_people == 2
    assert table_snapshot(engine, "persons") == people_before
    assert {row["id"]: row["person_id"] for row in table_snapshot(engine, "users")} == links_before
    # La etiqueta guardada antes de crear la primera persona también se revierte.
    assert all(row["display_name"] is None for row in table_snapshot(engine, "users"))
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == OLD
    migrate(url)
    assert_new_structure(engine)
    assert len(table_snapshot(engine, "persons")) == 4


@pytest.mark.parametrize("after_drop", [False, True])
def test_upgrade_can_resume_after_interrupted_final_ddl(migration_db, after_drop):
    url, engine = migration_db
    migrate(url, target=OLD)
    representative_data(engine)
    original_drop = Operations.drop_column
    def interrupted(self, table, column, **kwargs):
        if table == "users" and column == "full_name":
            if after_drop:
                original_drop(self, table, column, **kwargs)
            raise RuntimeError("Interrupción simulada después del backfill confirmado")
        return original_drop(self, table, column, **kwargs)
    with patch.object(Operations, "drop_column", interrupted):
        with pytest.raises(RuntimeError, match="Interrupción simulada"):
            migrate(url)
    assert len(table_snapshot(engine, "persons")) == 4
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == OLD
    migrate(url)
    assert_new_structure(engine)
    assert len(table_snapshot(engine, "persons")) == 4
    users = {row["id"]: row for row in table_snapshot(engine, "users")}
    assert users[1]["display_name"] == "Etiqueta anterior"
    assert users[3]["person_id"] != users[4]["person_id"]
