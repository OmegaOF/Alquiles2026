"""Condiciones y capital; los contratos y el dinero real no se duplican."""

from datetime import date
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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


class AnticreticoTerms(Base):
    __tablename__ = "anticretico_terms"
    contract_id: Mapped[int] = mapped_column(fk("contracts.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class AnticreticoRevision(Base):
    __tablename__ = "anticretico_revisions"
    __table_args__ = (
        UniqueConstraint("contract_id", "revision", name="uq_anticretico_revision"),
        CheckConstraint("agreed_capital > 0", name="ck_anticretico_agreed_capital"),
        Index("ix_anticretico_restitution_date", "restitution_on"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(fk("anticretico_terms.contract_id"))
    revision: Mapped[int] = mapped_column(Integer)
    agreed_capital: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    expected_delivery_on: Mapped[date | None] = mapped_column(Date)
    restitution_on: Mapped[date | None] = mapped_column(Date)
    allow_early_return: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0"
    )
    conditions: Mapped[str] = mapped_column(Text)
    document_reference: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"), unique=True)


class AnticreticoHolder(Base):
    __tablename__ = "anticretico_holders"
    __table_args__ = (
        CheckConstraint("assigned_amount >= 0", name="ck_anticretico_holder_amount"),
    )
    revision_id: Mapped[int] = mapped_column(
        fk("anticretico_revisions.id"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(fk("persons.id"), primary_key=True)
    assigned_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    beneficiary_person_id: Mapped[int | None] = mapped_column(fk("persons.id"))


class AnticreticoResponsible(Base):
    __tablename__ = "anticretico_responsibles"
    __table_args__ = (
        CheckConstraint(
            "assigned_amount >= 0", name="ck_anticretico_responsible_amount"
        ),
    )
    revision_id: Mapped[int] = mapped_column(
        fk("anticretico_revisions.id"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(fk("persons.id"), primary_key=True)
    assigned_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class AnticreticoMovement(Base):
    __tablename__ = "anticretico_movements"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('delivery','return')", name="ck_anticretico_movement_kind"
        ),
    )
    movement_id: Mapped[int] = mapped_column(
        fk("finance_movements.id"), primary_key=True
    )
    revision_id: Mapped[int] = mapped_column(fk("anticretico_revisions.id"))
    kind: Mapped[str] = mapped_column(String(20))


class AnticreticoAllocation(Base):
    __tablename__ = "anticretico_allocations"
    __table_args__ = (
        UniqueConstraint(
            "movement_id",
            "holder_id",
            "responsible_id",
            name="uq_anticretico_allocation_pair",
        ),
        CheckConstraint("amount > 0", name="ck_anticretico_allocation_amount"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    movement_id: Mapped[int] = mapped_column(fk("anticretico_movements.movement_id"))
    holder_id: Mapped[int] = mapped_column(fk("persons.id"))
    responsible_id: Mapped[int] = mapped_column(fk("persons.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))


class AnticreticoAdjustment(Base):
    __tablename__ = "anticretico_adjustments"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('settlement','reassignment','additional')",
            name="ck_anticretico_adjustment_kind",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    revision_id: Mapped[int] = mapped_column(fk("anticretico_revisions.id"))
    kind: Mapped[str] = mapped_column(String(20))
    effective_on: Mapped[date] = mapped_column(Date)
    document_reference: Mapped[str] = mapped_column(String(500))
    operation_id: Mapped[int] = mapped_column(fk("finance_operations.id"), unique=True)
    void_operation_id: Mapped[int | None] = mapped_column(
        fk("finance_operations.id"), unique=True
    )


class AnticreticoAdjustmentLine(Base):
    __tablename__ = "anticretico_adjustment_lines"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="ck_anticretico_adjustment_delta"),
    )
    adjustment_id: Mapped[int] = mapped_column(
        fk("anticretico_adjustments.id"), primary_key=True
    )
    holder_id: Mapped[int] = mapped_column(fk("persons.id"), primary_key=True)
    responsible_id: Mapped[int] = mapped_column(fk("persons.id"), primary_key=True)
    delta: Mapped[Decimal] = mapped_column(Numeric(14, 2))
