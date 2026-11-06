"""Entradas estrictas: campos ajenos a la fase o al recurso se rechazan."""
from decimal import Decimal
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Role = Literal["general_admin", "property_admin", "owner", "operator"]

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    @field_validator("*", mode="before")
    @classmethod
    def trim_text(cls, value, info):
        return value.strip() if isinstance(value, str) and info.field_name != "password" else value

class PersonCreate(Input):
    full_name: str = Field(min_length=2, max_length=160)
    document: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    whatsapp: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=5000)
    is_owner: bool = False

    @field_validator("document")
    @classmethod
    def normalize_document(cls, value):
        return re.sub(r"\s+", "", value).upper() or None if value else None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        if not value:
            return None
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Escriba un correo electrónico válido.")
        return value

class PersonPatch(PersonCreate):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    is_owner: bool | None = None

class OwnerInput(Input):
    person_id: int = Field(gt=0)
    share: Decimal | None = Field(default=None, gt=0, le=100, max_digits=5, decimal_places=2)

class PropertyCreate(Input):
    name: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=2, max_length=500)
    zone: str | None = Field(default=None, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    is_active: bool = True
    owners: list[OwnerInput] = Field(min_length=1, max_length=100)
    manager_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("owners")
    @classmethod
    def validate_owners(cls, owners):
        ids = [owner.person_id for owner in owners]
        if len(ids) != len(set(ids)):
            raise ValueError("No repita un propietario en la misma propiedad.")
        if sum((owner.share or Decimal(0) for owner in owners), Decimal(0)) > 100:
            raise ValueError("Las participaciones no pueden superar el 100%.")
        return owners

class PropertyPatch(PropertyCreate):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    address: str | None = Field(default=None, min_length=2, max_length=500)
    city: str | None = Field(default=None, min_length=2, max_length=120)
    is_active: bool | None = None
    owners: list[OwnerInput] | None = Field(default=None, min_length=1, max_length=100)
    manager_ids: list[int] | None = Field(default=None, max_length=100)

    @field_validator("owners")
    @classmethod
    def validate_owners(cls, owners):
        return PropertyCreate.validate_owners(owners) if owners is not None else None

class UnitCreate(Input):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=160)
    unit_type: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    maintenance: bool = False
    is_enabled: bool = True
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value):
        return value.upper() if value else value

class UnitPatch(UnitCreate):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    unit_type: str | None = Field(default=None, min_length=2, max_length=80)
    maintenance: bool | None = None
    is_enabled: bool | None = None

class UserCreate(Input):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.@-]+$")
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    display_name: str | None = Field(default=None, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: Role
    person_id: int | None = Field(default=None, gt=0)
    is_active: bool = True
    property_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        return value.lower() if value else value

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value):
        return value or None

    @model_validator(mode="after")
    def validate_identity(self):
        if self.person_id is None and self.full_name is None:
            raise ValueError("Seleccione una persona o escriba el nombre completo para crearla.")
        if self.role == "owner" and self.person_id is None:
            raise ValueError("Las cuentas de propietario requieren una persona propietaria existente.")
        return self

class UserPatch(UserCreate):
    username: str | None = Field(default=None, min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.@-]+$")
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    password: str | None = Field(default=None, min_length=12, max_length=128)
    role: Role | None = None
    is_active: bool | None = None
    property_ids: list[int] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_identity(self):
        if "person_id" in self.model_fields_set and self.person_id is None:
            raise ValueError("La cuenta debe permanecer vinculada a una persona.")
        if "full_name" in self.model_fields_set and self.full_name is None:
            raise ValueError("El nombre completo no puede estar vacío.")
        return self

class LoginInput(Input):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)
