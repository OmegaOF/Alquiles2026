"""Servicios y responsabilidades; no contiene pagos ni emisión de documentos."""

from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.models.entities import TimestampMixin
from app.core.clock import utc_now


class UtilityType(Base):
    __tablename__ = "utility_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")


class ServiceAccount(TimestampMixin, Base):
    __tablename__ = "service_accounts"
    __table_args__ = (
        UniqueConstraint("property_id", "label", name="uq_service_account_label"),
        UniqueConstraint(
            "property_id",
            "provider",
            "account_number",
            name="uq_service_account_number",
        ),
        CheckConstraint(
            "measurement_kind IN ('individual','shared')",
            name="ck_service_account_kind",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id", ondelete="RESTRICT")
    )
    type_id: Mapped[int] = mapped_column(
        ForeignKey("utility_types.id", ondelete="RESTRICT")
    )
    label: Mapped[str] = mapped_column(String(160))
    provider: Mapped[str] = mapped_column(String(160))
    account_number: Mapped[str | None] = mapped_column(String(100))
    measurement_kind: Mapped[str] = mapped_column(String(20))
    measure_unit: Mapped[str | None] = mapped_column(String(30))
    start_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class UtilityMeter(Base):
    __tablename__ = "utility_meters"
    __table_args__ = (
        UniqueConstraint("account_id", "serial", name="uq_utility_meter_serial"),
        CheckConstraint(
            "retired_on IS NULL OR retired_on >= installed_on",
            name="ck_utility_meter_dates",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("service_accounts.id", ondelete="RESTRICT")
    )
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT")
    )
    serial: Mapped[str] = mapped_column(String(100))
    installed_on: Mapped[date] = mapped_column(Date)
    retired_on: Mapped[date | None] = mapped_column(Date)
    replaces_id: Mapped[int | None] = mapped_column(
        ForeignKey("utility_meters.id", ondelete="RESTRICT"), unique=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class MeterReading(TimestampMixin, Base):
    __tablename__ = "meter_readings"
    __table_args__ = (
        UniqueConstraint("meter_id", "recorded_on", name="uq_meter_reading_date"),
        CheckConstraint("value >= 0", name="ck_meter_reading_value"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    meter_id: Mapped[int] = mapped_column(
        ForeignKey("utility_meters.id", ondelete="RESTRICT")
    )
    recorded_on: Mapped[date] = mapped_column(Date)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class UtilityConfiguration(Base):
    __tablename__ = "utility_configurations"
    __table_args__ = (
        UniqueConstraint("account_id", "revision", name="uq_utility_config_revision"),
        CheckConstraint(
            "method IN ('equal','percentage','occupants','readings','manual')",
            name="ck_utility_config_method",
        ),
        CheckConstraint(
            "economic_policy IN ('occupant','owner')", name="ck_utility_config_policy"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("service_accounts.id", ondelete="RESTRICT")
    )
    revision: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    economic_policy: Mapped[str] = mapped_column(String(20))
    owner_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    provider_payer_id: Mapped[int | None] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    reimbursement_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, server_default=func.now()
    )


class UtilityConfigurationUnit(Base):
    __tablename__ = "utility_configuration_units"
    __table_args__ = (
        CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_utility_config_percentage",
        ),
    )
    configuration_id: Mapped[int] = mapped_column(
        ForeignKey("utility_configurations.id", ondelete="RESTRICT"), primary_key=True
    )
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT"), primary_key=True
    )
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))


class UtilityReceipt(TimestampMixin, Base):
    __tablename__ = "utility_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("service_accounts.id", ondelete="RESTRICT")
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class UtilityReceiptRevision(Base):
    __tablename__ = "utility_receipt_revisions"
    __table_args__ = (
        UniqueConstraint("receipt_id", "revision", name="uq_utility_receipt_revision"),
        CheckConstraint(
            "amount > 0 AND fixed_amount >= 0 AND fixed_amount <= amount",
            name="ck_utility_receipt_amount",
        ),
        CheckConstraint("period_end >= period_start", name="ck_utility_receipt_period"),
        CheckConstraint(
            "consumption IS NULL OR consumption >= 0",
            name="ck_utility_receipt_consumption",
        ),
        Index("ix_utility_receipt_period", "period_start", "period_end"),
        Index("ix_utility_receipt_reference", "external_reference"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("utility_receipts.id", ondelete="RESTRICT")
    )
    revision: Mapped[int] = mapped_column(Integer)
    external_reference: Mapped[str | None] = mapped_column(String(120))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3))
    issued_on: Mapped[date] = mapped_column(Date)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    due_on: Mapped[date] = mapped_column(Date)
    consumption: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    fixed_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0"
    )
    document_reference: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, server_default=func.now()
    )


class UtilityDistribution(Base):
    __tablename__ = "utility_distributions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('calculated','needs_review','confirmed','superseded')",
            name="ck_utility_distribution_status",
        ),
        CheckConstraint(
            "(confirmed_at IS NULL AND confirmed_by IS NULL AND status IN ('calculated','needs_review')) OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND status IN ('confirmed','superseded'))",
            name="ck_utility_distribution_confirmation",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_revision_id: Mapped[int] = mapped_column(
        ForeignKey("utility_receipt_revisions.id", ondelete="RESTRICT")
    )
    configuration_id: Mapped[int] = mapped_column(
        ForeignKey("utility_configurations.id", ondelete="RESTRICT")
    )
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    evidence: Mapped[str] = mapped_column(Text().with_variant(MEDIUMTEXT(), "mysql"))
    reason: Mapped[str | None] = mapped_column(Text)
    supersedes_id: Mapped[int | None] = mapped_column(
        ForeignKey("utility_distributions.id", ondelete="RESTRICT")
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, server_default=func.now()
    )
    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)


class UtilityAllocation(Base):
    __tablename__ = "utility_allocations"
    __table_args__ = (
        UniqueConstraint(
            "distribution_id", "unit_id", name="uq_utility_allocation_unit"
        ),
        CheckConstraint("amount >= 0", name="ck_utility_allocation_amount"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    distribution_id: Mapped[int] = mapped_column(
        ForeignKey("utility_distributions.id", ondelete="RESTRICT")
    )
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    weight: Mapped[Decimal] = mapped_column(Numeric(18, 6))


class UtilityResponsibility(Base):
    __tablename__ = "utility_responsibilities"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_utility_responsibility_amount"),
        CheckConstraint(
            "contract_id IS NULL OR person_id IS NOT NULL",
            name="ck_utility_responsibility_origin",
        ),
        UniqueConstraint(
            "allocation_id",
            "person_id",
            "contract_id",
            name="uq_utility_responsibility_person",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    allocation_id: Mapped[int] = mapped_column(
        ForeignKey("utility_allocations.id", ondelete="RESTRICT")
    )
    person_id: Mapped[int | None] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="RESTRICT")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class UtilityCurrentDistribution(Base):
    __tablename__ = "utility_current_distributions"
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("utility_receipts.id", ondelete="RESTRICT"), primary_key=True
    )
    distribution_id: Mapped[int] = mapped_column(
        ForeignKey("utility_distributions.id", ondelete="RESTRICT"), unique=True
    )
