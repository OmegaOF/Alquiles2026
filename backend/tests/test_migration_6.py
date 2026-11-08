"""0008 en MySQL descartable: esquema, restricciones y conservación de 49 tablas."""

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
from test_migration_2 import rows, reset
from test_migration_5 import PREVIOUS, ADDED, seed_41

OLD = PREVIOUS | ADDED
NEW = {
    "reminder_operations",
    "reminder_preferences",
    "reminder_lead_days",
    "reminder_type_preferences",
    "reminder_recipients",
    "reminder_templates",
    "communication_consents",
    "communication_consent_heads",
    "reported_payments",
    "payment_report_decisions",
    "reminder_notices",
    "reminder_attention_events",
    "reminder_communications",
    "reminder_communication_events",
}


def migrate(url, target="0008_reminders", direction="upgrade"):
    with patch.dict(os.environ, {"DATABASE_URL": url}):
        get_settings.cache_clear()
        try:
            getattr(command, direction)(
                Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), target
            )
        finally:
            get_settings.cache_clear()


@pytest.fixture
def migration_db6():
    url = os.getenv("PHASE6_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("PHASE6_MIGRATION_DATABASE_URL no configurada")
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


def seed_49(engine):
    seed_41(engine)
    with engine.begin() as c:
        for i in [11, 12, 13]:
            c.execute(
                sa.text(
                    "INSERT INTO finance_operations(id,property_id,request_key,action,payload_hash,result,created_by,created_at) VALUES(:id,10,:key,'capital_fixture','historical','{}',30,'2031-02-01 10:00:00')"
                ),
                {"id": i, "key": f"capital_preserved_{i}"},
            )
        statements = [
            "INSERT INTO anticretico_terms(contract_id) VALUES(51)",
            "INSERT INTO anticretico_revisions(id,contract_id,revision,agreed_capital,restitution_on,conditions,operation_id) VALUES(300,51,1,70000,'2032-02-01','Acuerdo histórico de prueba',11)",
            "INSERT INTO anticretico_holders(revision_id,person_id,assigned_amount,beneficiary_person_id) VALUES(300,2,70000,2)",
            "INSERT INTO anticretico_responsibles(revision_id,person_id,assigned_amount) VALUES(300,1,70000)",
            "INSERT INTO finance_movements(id,amount,occurred_on,method_id,payer_id,beneficiary_person_id,operation_id) VALUES(500,1000,'2031-01-02',1,2,1,12)",
            "INSERT INTO anticretico_movements(movement_id,revision_id,kind) VALUES(500,300,'delivery')",
            "INSERT INTO anticretico_allocations(movement_id,holder_id,responsible_id,amount) VALUES(500,2,1,1000)",
            "INSERT INTO anticretico_adjustments(id,revision_id,kind,effective_on,document_reference,operation_id) VALUES(700,300,'settlement','2031-02-01','Acuerdo externo ficticio',13)",
            "INSERT INTO anticretico_adjustment_lines(adjustment_id,holder_id,responsible_id,delta) VALUES(700,2,1,-10)",
        ]
        for sql in statements:
            c.execute(sa.text(sql))


def test_mysql_clean_0008_normalized_structure_and_no_automatic_records(migration_db6):
    url, engine = migration_db6
    migrate(url)
    inspector = sa.inspect(engine)
    assert len(OLD) == 49 and len(NEW) == 14
    assert set(inspector.get_table_names()) == OLD | NEW | {"alembic_version"}
    for table in NEW:
        for fk in inspector.get_foreign_keys(table):
            assert fk.get("options", {}).get("ondelete", "RESTRICT") in {
                "RESTRICT",
                "NO ACTION",
            }
    assert inspector.get_pk_constraint("communication_consent_heads")[
        "constrained_columns"
    ] == ["property_id", "person_id", "purpose"]
    assert inspector.get_pk_constraint("reminder_lead_days")["constrained_columns"] == [
        "property_id",
        "days",
    ]
    notices = {c["name"] for c in inspector.get_columns("reminder_notices")}
    assert not notices & {
        "amount",
        "pending",
        "due_on",
        "currency",
        "property_id",
        "person_id",
    }
    communications = {
        c["name"] for c in inspector.get_columns("reminder_communications")
    }
    assert not communications & {
        "destination_number",
        "consent_version",
        "person_id",
        "property_id",
        "sent_at",
        "delivered_at",
        "read_at",
    }
    report = {c["name"]: c for c in inspector.get_columns("reported_payments")}
    assert (
        report["amount"]["type"].precision == 14 and report["amount"]["type"].scale == 2
    )
    assert not report.keys() & {"property_id", "currency", "responsible_person_id"}
    with engine.connect() as c:
        assert (
            c.scalar(sa.text("SELECT version_num FROM alembic_version"))
            == "0008_reminders"
        )
        assert all(c.scalar(sa.text(f"SELECT count(*) FROM {t}")) == 0 for t in NEW)
        assert c.scalar(sa.text("SELECT count(*) FROM finance_movements")) == 0
        assert c.scalar(sa.text("SELECT count(*) FROM finance_categories")) == 7
    migrate(url, "0007_anticreticos", "downgrade")
    assert set(sa.inspect(engine).get_table_names()) == OLD | {"alembic_version"}


def test_mysql_populated_49_tables_preserved_byte_for_byte_including_credentials_and_sessions(
    migration_db6,
):
    url, engine = migration_db6
    migrate(url, "0007_anticreticos")
    seed_49(engine)
    before = {t: rows(engine, t) for t in OLD}
    assert all(
        before.values()
    ), "Cada una de las 49 tablas debe contener datos representativos"
    for direction, target in [
        ("upgrade", "0008_reminders"),
        ("downgrade", "0007_anticreticos"),
        ("upgrade", "0008_reminders"),
    ]:
        migrate(url, target, direction)
        assert all(rows(engine, t) == before[t] for t in OLD)
    with engine.connect() as c:
        assert c.scalar(sa.text("SELECT count(*) FROM communication_consents")) == 0
        assert c.scalar(sa.text("SELECT count(*) FROM reported_payments")) == 0


def test_mysql_0008_foreign_keys_unique_keys_checks_and_immutable_history(
    migration_db6,
):
    url, engine = migration_db6
    migrate(url)
    seed_49(engine)
    with engine.begin() as c:
        for i in range(1, 25):
            c.execute(
                sa.text(
                    "INSERT INTO reminder_operations(id,property_id,request_key,action,payload_hash,result,created_by,created_at) VALUES(:id,10,:key,'sql_fixture','hash','{}',30,'2031-02-01 10:00:00')"
                ),
                {"id": i, "key": f"reminder_sql_{i}"},
            )
        for sql in [
            "INSERT INTO reminder_preferences(property_id,operation_id) VALUES(10,1)",
            "INSERT INTO reminder_lead_days(property_id,days) VALUES(10,7)",
            "INSERT INTO communication_consents(id,property_id,person_id,purpose,number,accepted_on,method,operation_id) VALUES(1,10,2,'payments','59171234567','2031-01-01','Aceptación ficticia',2)",
            "INSERT INTO communication_consent_heads(property_id,person_id,purpose,consent_id) VALUES(10,2,'payments',1)",
            "INSERT INTO reminder_notices(id,obligation_id) VALUES(1,200)",
            "INSERT INTO reported_payments(id,obligation_id,reporting_person_id,concept,amount,reported_on,method_id,document_reference,operation_id) VALUES(1,200,2,'Alquiler reportado',1000,'2031-02-01',1,'Referencia ficticia',3)",
            "INSERT INTO payment_report_decisions(report_id,kind,movement_id,reason,operation_id) VALUES(1,'verified',220,'Comprobación ficticia',4)",
            "INSERT INTO reminder_communications(id,notice_id,consent_id,template_code,template_version,final_text,source_fingerprint,operation_id) VALUES(1,1,1,'rent',1,'Texto histórico de prueba','hash',5)",
        ]:
            c.execute(sa.text(sql))
    invalid = [
        "INSERT INTO reminder_lead_days(property_id,days) VALUES(10,7)",
        "INSERT INTO reminder_lead_days(property_id,days) VALUES(10,366)",
        "INSERT INTO reminder_recipients(property_id,user_id) VALUES(10,99999)",
        "INSERT INTO communication_consent_heads(property_id,person_id,purpose,consent_id) VALUES(10,2,'payments',1)",
        "INSERT INTO communication_consent_heads(property_id,person_id,purpose,consent_id) VALUES(10,2,'capital',99999)",
        "INSERT INTO reminder_notices(obligation_id) VALUES(200)",
        "INSERT INTO reminder_notices(obligation_id,expense_id) VALUES(201,210)",
        "INSERT INTO reminder_notices(capital_contract_id,holder_id) VALUES(51,2)",
        "INSERT INTO reminder_notices(report_id) VALUES(99999)",
        "INSERT INTO reported_payments(obligation_id,account_id,reporting_person_id,concept,amount,reported_on,method_id,document_reference,operation_id) VALUES(200,1,2,'Inválido',1,'2031-02-01',1,'Ficticio',6)",
        "INSERT INTO reported_payments(account_id,reporting_person_id,concept,amount,reported_on,method_id,document_reference,operation_id) VALUES(1,2,'Inválido',-1,'2031-02-01',1,'Ficticio',7)",
        "INSERT INTO payment_report_decisions(report_id,kind,movement_id,reason,operation_id) VALUES(1,'verified',220,'Reutilización de comprobante',8)",
        "INSERT INTO payment_report_decisions(report_id,kind,reason,operation_id) VALUES(1,'verified','Sin movimiento real',9)",
        "INSERT INTO reminder_attention_events(notice_id,kind,fingerprint,operation_id) VALUES(1,'snoozed','hash',10)",
        "INSERT INTO reminder_communication_events(communication_id,kind,operation_id) VALUES(1,'delivered',11)",
        "DELETE FROM communication_consents WHERE id=1",
    ]
    for sql in invalid:
        with pytest.raises(DBAPIError):
            with engine.begin() as c:
                c.execute(sa.text(sql))
