"""Contratos y reservas. Sin obligaciones ni movimientos económicos."""

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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.entities import TimestampMixin


class PropertyContact(Base):
    __tablename__ = "property_contacts"
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id", ondelete="RESTRICT"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT"), primary_key=True
    )


class Reservation(TimestampMixin, Base):
    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            "(property_id IS NOT NULL AND unit_id IS NULL) OR (property_id IS NULL AND unit_id IS NOT NULL)",
            name="ck_reservation_target",
        ),
        CheckConstraint("end_date >= start_date", name="ck_reservation_dates"),
        CheckConstraint(
            "mode IN ('daily','weekly','monthly','anticretico')",
            name="ck_reservation_mode",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','cancelled','expired','converted')",
            name="ck_reservation_status",
        ),
        Index("ix_reservation_property_dates", "property_id", "start_date", "end_date"),
        Index("ix_reservation_unit_dates", "unit_id", "start_date", "end_date"),
        Index("ix_reservation_expiry", "expires_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    # Exactamente uno: inmueble completo O unidad. No duplicar la casa de la unidad.
    property_id: Mapped[int | None] = mapped_column(
        ForeignKey("properties.id", ondelete="RESTRICT")
    )
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT")
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    mode: Mapped[str] = mapped_column(String(20))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint(
            "(property_id IS NOT NULL AND unit_id IS NULL) OR (property_id IS NULL AND unit_id IS NOT NULL)",
            name="ck_contract_target",
        ),
        CheckConstraint("end_date >= start_date", name="ck_contract_dates"),
        CheckConstraint(
            "mode IN ('daily','weekly','monthly','anticretico','mixed')",
            name="ck_contract_mode",
        ),
        CheckConstraint(
            "status IN ('draft','active','finished','cancelled')",
            name="ck_contract_status",
        ),
        CheckConstraint(
            "(mode IN ('daily','weekly','monthly') AND price IS NOT NULL AND price > 0) OR (mode IN ('anticretico','mixed') AND price IS NULL)",
            name="ck_contract_price",
        ),
        CheckConstraint(
            "mode != 'daily' OR services_included = 1", name="ck_daily_services"
        ),
        CheckConstraint(
            "mode != 'mixed' OR status IN ('draft','cancelled')", name="ck_mixed_draft"
        ),
        CheckConstraint(
            "due_day IS NULL OR (due_day >= 1 AND due_day <= 31)",
            name="ck_contract_due_day",
        ),
        CheckConstraint(
            "(status = 'finished' AND actual_end_date IS NOT NULL AND actual_end_date >= start_date AND actual_end_date <= end_date) OR (status != 'finished' AND actual_end_date IS NULL)",
            name="ck_contract_actual_end",
        ),
        Index("ix_contract_property_dates", "property_id", "start_date", "end_date"),
        Index("ix_contract_unit_dates", "unit_id", "start_date", "end_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int | None] = mapped_column(
        ForeignKey("properties.id", ondelete="RESTRICT")
    )
    unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("units.id", ondelete="RESTRICT")
    )
    responsible_person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT")
    )
    source_reservation_id: Mapped[int | None] = mapped_column(
        ForeignKey("reservations.id", ondelete="RESTRICT"), unique=True
    )
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    actual_end_date: Mapped[date | None] = mapped_column(Date)
    price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3))
    daily_count: Mapped[str | None] = mapped_column(String(20))
    weekly_partial_allowed: Mapped[bool | None] = mapped_column(Boolean)
    monthly_period: Mapped[str | None] = mapped_column(String(20))
    first_period: Mapped[str | None] = mapped_column(String(20))
    due_day: Mapped[int | None] = mapped_column(Integer)
    payment_timing: Mapped[str] = mapped_column(String(20))
    due_terms: Mapped[str | None] = mapped_column(Text)
    services_included: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0"
    )
    service_terms: Mapped[str | None] = mapped_column(Text)
    conditions: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    occupants: Mapped[list["ContractOccupant"]] = relationship(
        cascade="all, delete-orphan"
    )
    owners: Mapped[list["ContractOwner"]] = relationship(cascade="all, delete-orphan")


class ContractOccupant(Base):
    __tablename__ = "contract_occupants"
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("contracts.id", ondelete="RESTRICT"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT"), primary_key=True
    )


class ContractOwner(Base):
    """Firmantes acordados, conservados al activar; independientes del dueño actual."""

    __tablename__ = "contract_owners"
    __table_args__ = (
        CheckConstraint(
            "share IS NULL OR (share > 0 AND share <= 100)",
            name="ck_contract_owner_share",
        ),
    )
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("contracts.id", ondelete="RESTRICT"), primary_key=True
    )
    person_id: Mapped[int] = mapped_column(
        ForeignKey("persons.id", ondelete="RESTRICT"), primary_key=True
    )
    share: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
