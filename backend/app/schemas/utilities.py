from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import Field, model_validator
from app.schemas.registry import Input

Method = Literal["equal", "percentage", "occupants", "readings", "manual"]
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]
Quantity = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=6)]
BusinessDate = Annotated[date, Field(ge=date(1900, 1, 1), le=date(2199, 12, 31))]


class TypeInput(Input):
    name: str = Field(min_length=2, max_length=80)
    is_active: bool = True


class UnitPercentage(Input):
    unit_id: int = Field(gt=0)
    percentage: Decimal = Field(ge=0, le=100, max_digits=9, decimal_places=6)


class ConfigurationInput(Input):
    method: Method = "equal"
    unit_ids: list[int] = Field(default_factory=list, max_length=200)
    percentages: list[UnitPercentage] = Field(default_factory=list, max_length=200)
    economic_policy: Literal["occupant", "owner"] = "occupant"
    owner_person_id: int | None = Field(default=None, gt=0)
    provider_payer_id: int | None = Field(default=None, gt=0)
    reimbursement_person_id: int | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=3000)
    expected_version: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def consistent(self):
        if len(set(self.unit_ids)) != len(self.unit_ids) or any(
            i <= 0 for i in self.unit_ids
        ):
            raise ValueError("Seleccione cuartos distintos y válidos.")
        if self.method == "percentage" and self.unit_ids:
            if sorted(p.unit_id for p in self.percentages) != sorted(
                self.unit_ids
            ) or sum((p.percentage for p in self.percentages), Decimal(0)) != Decimal(
                100
            ):
                raise ValueError(
                    "Indique un porcentaje por cuarto; la suma debe ser exactamente 100%."
                )
        elif self.percentages:
            raise ValueError(
                "Los porcentajes solo corresponden al método por porcentajes y a sus cuartos."
            )
        return self


class AccountInput(Input):
    type_id: int = Field(gt=0)
    label: str = Field(min_length=2, max_length=160)
    provider: str = Field(min_length=2, max_length=160)
    account_number: str | None = Field(default=None, max_length=100)
    measurement_kind: Literal["individual", "shared"] = "shared"
    measure_unit: str | None = Field(default=None, max_length=30)
    start_date: BusinessDate
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=3000)
    configuration: ConfigurationInput


class AccountPatch(Input):
    label: str | None = Field(default=None, min_length=2, max_length=160)
    provider: str | None = Field(default=None, min_length=2, max_length=160)
    account_number: str | None = Field(default=None, max_length=100)
    type_id: int | None = Field(default=None, gt=0)
    measure_unit: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=3000)
    expected_version: int = Field(gt=0)


class MeterInput(Input):
    unit_id: int | None = Field(default=None, gt=0)
    serial: str = Field(min_length=1, max_length=100)
    installed_on: BusinessDate
    replaces_id: int | None = Field(default=None, gt=0)
    initial_value: Quantity | None = None
    notes: str | None = Field(default=None, max_length=3000)


class MeterRetire(Input):
    retired_on: BusinessDate
    expected_version: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=2000)


class ReadingInput(Input):
    recorded_on: BusinessDate
    value: Quantity
    notes: str | None = Field(default=None, max_length=3000)


class ReadingCorrection(ReadingInput):
    expected_version: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=2000)


class ReceiptInput(Input):
    external_reference: str | None = Field(default=None, max_length=120)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="BOB", pattern=r"^[A-Z]{3}$")
    issued_on: BusinessDate
    period_start: BusinessDate
    period_end: BusinessDate
    due_on: BusinessDate
    consumption: Quantity | None = None
    fixed_amount: Money = Decimal("0")
    document_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def dates_amount(self):
        if self.period_end < self.period_start:
            raise ValueError("El fin del periodo no puede ser anterior al inicio.")
        if self.period_start.year < 1900 or self.period_end.year > 2199:
            raise ValueError("Use fechas de consumo entre 1900 y 2199.")
        if self.due_on < self.issued_on:
            raise ValueError(
                "La fecha límite de pago no puede ser anterior a la emisión del recibo externo."
            )
        if self.fixed_amount > self.amount:
            raise ValueError(
                "El componente fijo no puede superar el importe del recibo."
            )
        if self.external_reference:
            self.external_reference = self.external_reference.upper()
        return self


class ReceiptCorrection(ReceiptInput):
    expected_version: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=2000)


class ManualSpace(Input):
    unit_id: int | None = Field(default=None, gt=0)
    amount: Money


class CalculationInput(Input):
    expected_version: int = Field(gt=0)
    configuration_id: int | None = Field(default=None, gt=0)
    manual_amounts: list[ManualSpace] = Field(default_factory=list, max_length=200)
    request_key: str | None = Field(
        default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )
    adjustment: bool = False
    reason: str | None = Field(default=None, max_length=2000)


class ResponsibilityInput(Input):
    allocation_id: int = Field(gt=0)
    kind: Literal["owner", "occupant"]
    person_id: int = Field(gt=0)
    contract_id: int | None = Field(default=None, gt=0)
    amount: Money


class AllocationCorrection(Input):
    allocation_id: int = Field(gt=0)
    amount: Money


class ResolutionInput(Input):
    expected_version: int = Field(gt=0)
    expected_receipt_version: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=2000)
    allocation_amounts: list[AllocationCorrection] = Field(
        default_factory=list, max_length=200
    )
    responsibilities: list[ResponsibilityInput] = Field(min_length=1, max_length=1000)


class ConfirmationInput(Input):
    expected_version: int = Field(gt=0)
    expected_receipt_version: int = Field(gt=0)
    reason: str | None = Field(default=None, max_length=2000)
