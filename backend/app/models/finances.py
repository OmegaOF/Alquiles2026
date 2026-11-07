"""Obligaciones, dinero real y aplicaciones separados; sin procesos fiscales."""

from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.core.clock import utc_now


def fk(target):
    return ForeignKey(target, ondelete="RESTRICT")


class FinanceMethod(Base):
    __tablename__ = "finance_methods"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")


class FinanceCategory(Base):
    __tablename__ = "finance_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"
    __table_args__ = (
        UniqueConstraint(
            "property_id", "person_id", "currency", name="uq_finance_account_context"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(fk("properties.id"))
    person_id: Mapped[int] = mapped_column(fk("persons.id"))
    currency: Mapped[str] = mapped_column(String(3))


class FinanceOperation(Base):
    __tablename__ = "finance_operations"
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(fk("properties.id"))
    request_key: Mapped[str] = mapped_column(String(64), unique=True)
    action: Mapped[str] = mapped_column(String(40))
    payload_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[str] = mapped_column(Text().with_variant(MEDIUMTEXT(), "mysql"))
    created_by: Mapped[int] = mapped_column(fk("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class FinanceObligation(Base):
    __tablename__ = "finance_obligations"
    __table_args__ = (
        UniqueConstraint(
            "rent_contract_id",
            "period_start",
            "account_id",
            name="uq_finance_rent_period",
        ),
        CheckConstraint(
            "(rent_contract_id IS NOT NULL AND service_origin_id IS NULL) OR (rent_contract_id IS NULL AND service_origin_id IS NOT NULL)",
            name="ck_finance_obligation_origin",
        ),
        CheckConstraint(
            "original_amount >= 0 AND period_end >= period_start",
            name="ck_finance_obligation_amount_period",
        ),
        Index("ix_finance_obligation_due", "due_on"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(fk("finance_accounts.id"))
    unit_id: Mapped[int | None] = mapped_column(fk("units.id"))
    rent_contract_id: Mapped[int | None] = mapped_column(fk("contracts.id"))
    service_origin_id: Mapped[int | None] = mapped_column(
        fk("utility_responsibilities.id"), unique=True
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    original_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    due_on: Mapped[date] = mapped_column(Date)
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"))


class FinanceAdjustment(Base):
    __tablename__ = "finance_adjustments"
    __table_args__ = (
        UniqueConstraint(
            "operation_id", "obligation_id", name="uq_finance_adjustment_operation"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    obligation_id: Mapped[int] = mapped_column(fk("finance_obligations.id"))
    delta: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    new_due_on: Mapped[date | None] = mapped_column(Date)
    new_period_end: Mapped[date | None] = mapped_column(Date)
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"))


class FinanceExpense(Base):
    __tablename__ = "finance_expenses"
    __table_args__ = (
        CheckConstraint("original_amount > 0", name="ck_finance_expense_amount"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(fk("finance_accounts.id"))
    unit_id: Mapped[int | None] = mapped_column(fk("units.id"))
    category_id: Mapped[int] = mapped_column(fk("finance_categories.id"))
    receipt_id: Mapped[int | None] = mapped_column(
        fk("utility_receipts.id"), unique=True
    )
    description: Mapped[str] = mapped_column(String(250))
    recorded_on: Mapped[date] = mapped_column(Date)
    original_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    due_on: Mapped[date | None] = mapped_column(Date)
    document_reference: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"), unique=True)
    void_operation_id: Mapped[int | None] = mapped_column(
        fk("finance_operations.id"), unique=True
    )


class FinanceExpenseAdjustment(Base):
    __tablename__ = "finance_expense_adjustments"
    __table_args__ = (
        UniqueConstraint(
            "operation_id", "expense_id", name="uq_finance_expense_adjustment"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(fk("finance_expenses.id"))
    delta: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"))


class FinanceMovement(Base):
    __tablename__ = "finance_movements"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_finance_movement_amount"),
        Index("ix_finance_movement_date", "occurred_on"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    occurred_on: Mapped[date] = mapped_column(Date)
    method_id: Mapped[int] = mapped_column(fk("finance_methods.id"))
    payer_id: Mapped[int] = mapped_column(fk("persons.id"))
    beneficiary_person_id: Mapped[int | None] = mapped_column(fk("persons.id"))
    beneficiary_label: Mapped[str | None] = mapped_column(String(160))
    reference: Mapped[str | None] = mapped_column(String(160))
    document_reference: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"), unique=True)
    void_operation_id: Mapped[int | None] = mapped_column(
        fk("finance_operations.id"), unique=True
    )


class FinanceIncoming(Base):
    __tablename__ = "finance_incoming"
    __table_args__ = (
        CheckConstraint(
            "category IN ('collection','advance')", name="ck_finance_incoming_category"
        ),
    )
    movement_id: Mapped[int] = mapped_column(
        fk("finance_movements.id"), primary_key=True
    )
    account_id: Mapped[int] = mapped_column(fk("finance_accounts.id"))
    category: Mapped[str] = mapped_column(String(20))


class FinanceGuarantee(Base):
    __tablename__ = "finance_guarantees"
    movement_id: Mapped[int] = mapped_column(
        fk("finance_movements.id"), primary_key=True
    )
    account_id: Mapped[int] = mapped_column(fk("finance_accounts.id"))
    contract_id: Mapped[int] = mapped_column(fk("contracts.id"))
    conditions: Mapped[str] = mapped_column(Text)
    retained_operation_id: Mapped[int | None] = mapped_column(
        fk("finance_operations.id"), unique=True
    )


class FinanceDisbursement(Base):
    __tablename__ = "finance_disbursements"
    movement_id: Mapped[int] = mapped_column(
        fk("finance_movements.id"), primary_key=True
    )
    expense_id: Mapped[int] = mapped_column(fk("finance_expenses.id"))
    is_direct: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class FinanceRefund(Base):
    __tablename__ = "finance_refunds"
    movement_id: Mapped[int] = mapped_column(
        fk("finance_movements.id"), primary_key=True
    )
    source_movement_id: Mapped[int] = mapped_column(fk("finance_movements.id"))


class FinanceApplication(Base):
    __tablename__ = "finance_applications"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_finance_application_amount"),
        UniqueConstraint(
            "operation_id",
            "source_movement_id",
            "obligation_id",
            name="uq_finance_application_operation",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    source_movement_id: Mapped[int] = mapped_column(fk("finance_movements.id"))
    obligation_id: Mapped[int] = mapped_column(fk("finance_obligations.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    replaces_id: Mapped[int | None] = mapped_column(
        fk("finance_applications.id"), unique=True
    )
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"))
    void_operation_id: Mapped[int | None] = mapped_column(fk("finance_operations.id"))


class FinanceUtilityImport(Base):
    __tablename__ = "finance_utility_imports"
    distribution_id: Mapped[int] = mapped_column(
        fk("utility_distributions.id"), primary_key=True
    )
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"), unique=True)


class FinanceUtilityLink(Base):
    __tablename__ = "finance_utility_links"
    responsibility_id: Mapped[int] = mapped_column(
        fk("utility_responsibilities.id"), primary_key=True
    )
    obligation_id: Mapped[int] = mapped_column(fk("finance_obligations.id"))
