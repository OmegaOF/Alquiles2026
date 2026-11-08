"""Filtros únicos para consultas, gráficos y PDF; dinero como Decimal/cadenas."""

from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

ReportKind = Literal[
    "economic",
    "properties",
    "owners",
    "units",
    "contracts",
    "collections",
    "services",
    "expenses",
    "capital",
    "comparison",
]


class ReportFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    property_id: int | None = Field(None, gt=0)
    owner_id: int | None = Field(None, gt=0)
    unit_id: int | None = Field(None, gt=0)
    contract_id: int | None = Field(None, gt=0)
    person_id: int | None = Field(None, gt=0)
    service_type_id: int | None = Field(None, gt=0)
    category_id: int | None = Field(None, gt=0)
    mode: Literal["daily", "weekly", "monthly", "anticretico", "mixed"] | None = None
    currency: str | None = Field(None, pattern=r"^[A-Z]{3}$")
    start_date: date | None = None
    end_date: date | None = None
    as_of: date | None = None
    month: int | None = Field(None, ge=1, le=12)
    year: int | None = Field(None, ge=1900, le=2200)
    state: (
        Literal[
            "pending",
            "partial",
            "paid",
            "overdue",
            "adjusted",
            "voided",
            "active",
            "finished",
            "draft",
            "cancelled",
        ]
        | None
    ) = None
    page: int = Field(1, ge=1, le=100000)
    page_size: int = Field(50, ge=1, le=200)
    paper: Literal["A4", "letter"] = "A4"
    expected_fingerprint: str | None = Field(None, pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def dates(self):
        if self.month and not self.year:
            raise ValueError("Seleccione un año para consultar el mes.")
        if self.year and (self.start_date or self.end_date):
            raise ValueError("Use mes/año o fechas personalizadas, no ambos.")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("La fecha final debe ser igual o posterior a la inicial.")
        return self
