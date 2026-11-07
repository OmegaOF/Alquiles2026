from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import Field, create_model, field_validator, model_validator
from app.schemas.registry import Input, OwnerInput, PersonCreate, PropertyCreate

Mode = Literal["daily", "weekly", "monthly", "anticretico", "mixed"]


class Target(Input):
    property_id: int | None = Field(default=None, gt=0)
    unit_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def single_target(self):
        if (self.property_id is None) == (self.unit_id is None):
            raise ValueError("Seleccione una casa completa o un cuarto, no ambos.")
        return self


class ContractInput(Target):
    responsible_person_id: int = Field(gt=0)
    occupant_ids: list[int] = Field(default_factory=list, max_length=100)
    owner_parties: list[OwnerInput] | None = Field(
        default=None, min_length=1, max_length=100
    )
    mode: Mode
    status: Literal["draft", "active"] = "draft"
    start_date: date
    end_date: date
    price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="BOB", pattern=r"^[A-Z]{3}$")
    daily_count: Literal["inclusive", "nights"] | None = None
    weekly_partial_allowed: bool | None = None
    monthly_period: Literal["anniversary", "calendar"] | None = None
    first_period: Literal["full", "prorated"] | None = None
    due_day: int | None = Field(default=None, ge=1, le=31)
    payment_timing: Literal["advance", "arrears", "custom"] = "advance"
    due_terms: str | None = Field(default=None, max_length=3000)
    services_included: bool = False
    service_terms: str | None = Field(default=None, max_length=3000)
    conditions: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=3000)
    expected_version: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_conditions(self):
        if self.owner_parties is not None:
            PropertyCreate.validate_owners(self.owner_parties)
        if self.end_date < self.start_date:
            raise ValueError("La salida no puede ser anterior a la entrada.")
        if self.start_date.year < 1900 or self.end_date.year > 2199:
            raise ValueError("Use fechas entre 1900 y 2199.")
        if len(set(self.occupant_ids)) != len(self.occupant_ids) or any(
            i <= 0 for i in self.occupant_ids
        ):
            raise ValueError("Revise los ocupantes: no pueden repetirse.")
        if self.responsible_person_id in self.occupant_ids:
            raise ValueError(
                "El responsable ya está incluido; no lo repita entre los ocupantes adicionales."
            )
        if self.mode in {"daily", "weekly", "monthly"} and self.price is None:
            raise ValueError("Escriba el precio acordado para la modalidad elegida.")
        if self.mode in {"anticretico", "mixed"} and self.price is not None:
            raise ValueError(
                "Esta modalidad no registra capital ni cálculos combinados en esta fase."
            )
        if self.mode == "mixed" and (self.status != "draft" or not self.conditions):
            raise ValueError(
                "Un contrato mixto solo puede guardarse como borrador, con condiciones para revisión."
            )
        if self.mode == "daily":
            self.daily_count = self.daily_count or "inclusive"
            if (
                "services_included" in self.model_fields_set
                and not self.services_included
            ):
                raise ValueError(
                    "El alquiler diario siempre incluye todos los servicios básicos."
                )
            self.services_included = True
            if self.daily_count == "nights" and self.end_date == self.start_date:
                raise ValueError("El conteo por noches requiere al menos una noche.")
        elif self.daily_count is not None:
            raise ValueError("El conteo diario solo corresponde a alquileres diarios.")
        if self.mode == "weekly":
            self.weekly_partial_allowed = self.weekly_partial_allowed or False
            if (
                not self.weekly_partial_allowed
                and ((self.end_date - self.start_date).days + 1) % 7
            ):
                raise ValueError(
                    "Seleccione semanas completas o habilite periodos semanales parciales."
                )
        elif self.weekly_partial_allowed is not None:
            raise ValueError(
                "La condición semanal solo corresponde al alquiler semanal."
            )
        if self.mode == "monthly":
            if not self.monthly_period or not self.first_period:
                raise ValueError(
                    "Indique el periodo mensual y la condición del primer cobro."
                )
            if self.payment_timing == "custom":
                self.due_day = None
            elif self.due_day is None:
                raise ValueError(
                    "Indique el día de vencimiento mensual o seleccione otro acuerdo escrito."
                )
        elif any(
            v is not None
            for v in (self.monthly_period, self.first_period, self.due_day)
        ):
            raise ValueError(
                "Las condiciones mensuales solo corresponden a alquileres mensuales."
            )
        if self.payment_timing == "custom" and not self.due_terms:
            raise ValueError("Describa los vencimientos pactados.")
        return self


class ReservationInput(Target):
    person_id: int = Field(gt=0)
    mode: Literal["daily", "weekly", "monthly", "anticretico"]
    start_date: date
    end_date: date
    status: Literal["pending", "confirmed"] = "pending"
    expires_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=3000)
    expected_version: int | None = Field(default=None, gt=0)

    @field_validator("expires_at")
    @classmethod
    def utc_expiry(cls, value):
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @model_validator(mode="after")
    def dates(self):
        if (
            self.end_date < self.start_date
            or self.start_date.year < 1900
            or self.end_date.year > 2199
        ):
            raise ValueError("Revise las fechas de entrada y salida.")
        return self


class ContractAction(Input):
    action: Literal["activate", "finish", "cancel", "extend"]
    end_date: date | None = None
    reason: str = Field(min_length=3, max_length=2000)
    expected_version: int | None = Field(default=None, gt=0)


class ReservationAction(Input):
    action: Literal["confirm", "cancel", "expire"]
    reason: str = Field(min_length=3, max_length=2000)
    expected_version: int | None = Field(default=None, gt=0)


class ContactInput(PersonCreate):
    is_owner: Literal[False] = False


class ContactLink(Input):
    person_id: int = Field(gt=0)


# PATCH se fusiona con los valores existentes y vuelve a pasar por el esquema
# completo: así se validan también las dependencias entre fechas y condiciones.
ContractPatch = create_model(
    "ContractPatch",
    __base__=Input,
    **{
        name: (field.annotation, None)
        for name, field in ContractInput.model_fields.items()
    }
)
ReservationPatch = create_model(
    "ReservationPatch",
    __base__=Input,
    **{
        name: (field.annotation, None)
        for name, field in ReservationInput.model_fields.items()
    }
)
