"""Modelos de la fase 1. Sin contratos, ocupación ni movimientos financieros."""
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.core.clock import utc_now

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, server_default=func.now())

class Person(TimestampMixin, Base):
    __tablename__ = "persons"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160))
    document: Mapped[str | None] = mapped_column(String(80), unique=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    whatsapp: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    address: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('general_admin','property_admin','owner','operator')", name="ck_user_role"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30))
    person_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id", ondelete="RESTRICT"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    accesses: Mapped[list["PropertyAccess"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class Property(TimestampMixin, Base):
    __tablename__ = "properties"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(String(500))
    zone: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    owners: Mapped[list["PropertyOwner"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    accesses: Mapped[list["PropertyAccess"]] = relationship(back_populates="property", cascade="all, delete-orphan")

class PropertyOwner(Base):
    __tablename__ = "property_owners"
    __table_args__ = (CheckConstraint("share IS NULL OR (share > 0 AND share <= 100)", name="ck_owner_share"),)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="RESTRICT"), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="RESTRICT"), primary_key=True)
    share: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    property: Mapped[Property] = relationship(back_populates="owners")

class PropertyAccess(Base):
    __tablename__ = "property_access"
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="RESTRICT"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True)
    property: Mapped[Property] = relationship(back_populates="accesses")
    user: Mapped[User] = relationship(back_populates="accesses")

class Unit(TimestampMixin, Base):
    __tablename__ = "units"
    __table_args__ = (UniqueConstraint("property_id", "code", name="uq_unit_property_code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="RESTRICT"))
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(160))
    unit_type: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    maintenance: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    notes: Mapped[str | None] = mapped_column(Text)

class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, server_default=func.now())

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(40))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int] = mapped_column(Integer)
    details: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, server_default=func.now())
