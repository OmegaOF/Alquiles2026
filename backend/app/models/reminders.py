"""Atención y comunicaciones: sin otra contabilidad de importes o vencimientos."""

from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.models.finances import fk
from app.core.clock import utc_now


class ReminderOperation(Base):
    __tablename__ = "reminder_operations"
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(fk("properties.id"))
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    action: Mapped[str] = mapped_column(String(40))
    payload_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[str] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(fk("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class ReminderPreference(Base):
    __tablename__ = "reminder_preferences"
    __table_args__ = (
        CheckConstraint("snooze_days BETWEEN 1 AND 30", name="ck_reminder_snooze_days"),
    )
    property_id: Mapped[int] = mapped_column(fk("properties.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    snooze_days: Mapped[int] = mapped_column(Integer, default=7, server_default="7")
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)


class ReminderLeadDay(Base):
    __tablename__ = "reminder_lead_days"
    __table_args__ = (
        CheckConstraint("days BETWEEN 0 AND 365", name="ck_reminder_lead_day"),
    )
    property_id: Mapped[int] = mapped_column(
        fk("reminder_preferences.property_id"), primary_key=True
    )
    days: Mapped[int] = mapped_column(Integer, primary_key=True)


class ReminderTypePreference(Base):
    __tablename__ = "reminder_type_preferences"
    property_id: Mapped[int] = mapped_column(
        fk("reminder_preferences.property_id"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(30), primary_key=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean)
    allow_whatsapp: Mapped[bool] = mapped_column(Boolean)


class ReminderRecipient(Base):
    __tablename__ = "reminder_recipients"
    property_id: Mapped[int] = mapped_column(
        fk("reminder_preferences.property_id"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(fk("users.id"), primary_key=True)


class ReminderTemplate(Base):
    __tablename__ = "reminder_templates"
    __table_args__ = (
        UniqueConstraint("property_id", "kind", name="uq_reminder_template_kind"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(fk("properties.id"))
    kind: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)


class CommunicationConsent(Base):
    __tablename__ = "communication_consents"
    __table_args__ = (Index("ix_communication_consent_person", "person_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(fk("properties.id"))
    person_id: Mapped[int] = mapped_column(fk("persons.id"))
    purpose: Mapped[str] = mapped_column(String(30))
    number: Mapped[str] = mapped_column(String(15))
    accepted_on: Mapped[date] = mapped_column(Date)
    method: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)
    revoked_operation_id: Mapped[int | None] = mapped_column(
        fk("reminder_operations.id"), unique=True
    )


class CommunicationConsentHead(Base):
    __tablename__ = "communication_consent_heads"
    property_id: Mapped[int] = mapped_column(fk("properties.id"), primary_key=True)
    person_id: Mapped[int] = mapped_column(fk("persons.id"), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(30), primary_key=True)
    consent_id: Mapped[int] = mapped_column(
        fk("communication_consents.id"), unique=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class ReportedPayment(Base):
    __tablename__ = "reported_payments"
    __table_args__ = (
        CheckConstraint(
            "(obligation_id IS NOT NULL AND account_id IS NULL) OR (obligation_id IS NULL AND account_id IS NOT NULL)",
            name="ck_reported_payment_source",
        ),
        CheckConstraint("amount > 0", name="ck_reported_payment_amount"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    obligation_id: Mapped[int | None] = mapped_column(fk("finance_obligations.id"))
    account_id: Mapped[int | None] = mapped_column(fk("finance_accounts.id"))
    reporting_person_id: Mapped[int] = mapped_column(fk("persons.id"))
    concept: Mapped[str] = mapped_column(String(250))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    reported_on: Mapped[date] = mapped_column(Date)
    method_id: Mapped[int] = mapped_column(fk("finance_methods.id"))
    document_reference: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)


class PaymentReportDecision(Base):
    __tablename__ = "payment_report_decisions"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('pending','verified','rejected')", name="ck_report_decision_kind"
        ),
        CheckConstraint(
            "(kind = 'verified' AND movement_id IS NOT NULL) OR (kind <> 'verified' AND movement_id IS NULL)",
            name="ck_report_decision_movement",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(fk("reported_payments.id"))
    kind: Mapped[str] = mapped_column(String(20))
    movement_id: Mapped[int | None] = mapped_column(
        fk("finance_movements.id"), unique=True
    )
    reason: Mapped[str] = mapped_column(String(1000))
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)


class ReminderNotice(Base):
    __tablename__ = "reminder_notices"
    __table_args__ = (
        CheckConstraint(
            "(obligation_id IS NOT NULL) + (receipt_id IS NOT NULL) + (expense_id IS NOT NULL) + (contract_id IS NOT NULL) + (capital_contract_id IS NOT NULL) + (report_id IS NOT NULL) = 1",
            name="ck_reminder_notice_source",
        ),
        CheckConstraint(
            "(capital_contract_id IS NULL AND holder_id IS NULL AND responsible_id IS NULL) OR (capital_contract_id IS NOT NULL AND holder_id IS NOT NULL AND responsible_id IS NOT NULL)",
            name="ck_reminder_notice_capital_parties",
        ),
        UniqueConstraint(
            "capital_contract_id",
            "holder_id",
            "responsible_id",
            name="uq_reminder_capital_pair",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    obligation_id: Mapped[int | None] = mapped_column(
        fk("finance_obligations.id"), unique=True
    )
    receipt_id: Mapped[int | None] = mapped_column(
        fk("utility_receipts.id"), unique=True
    )
    expense_id: Mapped[int | None] = mapped_column(
        fk("finance_expenses.id"), unique=True
    )
    contract_id: Mapped[int | None] = mapped_column(fk("contracts.id"), unique=True)
    capital_contract_id: Mapped[int | None] = mapped_column(
        fk("anticretico_terms.contract_id")
    )
    holder_id: Mapped[int | None] = mapped_column(fk("persons.id"))
    responsible_id: Mapped[int | None] = mapped_column(fk("persons.id"))
    report_id: Mapped[int | None] = mapped_column(
        fk("reported_payments.id"), unique=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class ReminderAttentionEvent(Base):
    __tablename__ = "reminder_attention_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('reviewed','snoozed','reopened')",
            name="ck_reminder_attention_kind",
        ),
        CheckConstraint(
            "(kind = 'snoozed' AND until_on IS NOT NULL) OR (kind <> 'snoozed' AND until_on IS NULL)",
            name="ck_reminder_attention_until",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    notice_id: Mapped[int] = mapped_column(fk("reminder_notices.id"))
    kind: Mapped[str] = mapped_column(String(20))
    fingerprint: Mapped[str] = mapped_column(String(64))
    until_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(1000))
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)


class ReminderCommunication(Base):
    __tablename__ = "reminder_communications"
    __table_args__ = (
        CheckConstraint(
            "(template_id IS NOT NULL AND template_code IS NULL) OR (template_id IS NULL AND template_code IS NOT NULL)",
            name="ck_communication_template_source",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    notice_id: Mapped[int] = mapped_column(fk("reminder_notices.id"))
    consent_id: Mapped[int] = mapped_column(fk("communication_consents.id"))
    template_id: Mapped[int | None] = mapped_column(fk("reminder_templates.id"))
    template_code: Mapped[str | None] = mapped_column(String(60))
    template_version: Mapped[int] = mapped_column(Integer)
    final_text: Mapped[str] = mapped_column(Text)
    source_fingerprint: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)
    authorization_operation_id: Mapped[int | None] = mapped_column(
        fk("reminder_operations.id"), unique=True
    )


class ReminderCommunicationEvent(Base):
    __tablename__ = "reminder_communication_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('opened','manual_sent','not_sent','correct_sent','correct_not_sent')",
            name="ck_reminder_communication_event",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    communication_id: Mapped[int] = mapped_column(fk("reminder_communications.id"))
    kind: Mapped[str] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(String(1000))
    operation_id: Mapped[int] = mapped_column(fk("reminder_operations.id"), unique=True)
