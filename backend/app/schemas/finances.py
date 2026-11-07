from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import Field, model_validator
from app.schemas.registry import Input
from app.schemas.utilities import BusinessDate

Money = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
Nonnegative = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class OperationInput(Input):
    request_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    reason: str | None = Field(default=None, min_length=3, max_length=3000)


class RentGeneration(OperationInput):
    expected_version: int = Field(gt=0)
    through: BusinessDate
    weekly_partial_rule: Literal["proportional", "full"] | None = None
    last_period_rule: Literal["proportional", "full"] | None = None
    due_on: BusinessDate | None = None
    accept_context_change: bool = False


class UtilityImport(OperationInput):
    expected_distribution_id: int = Field(gt=0)
    owner_person_id: int = Field(gt=0)


class ReceiptExpenseInput(OperationInput):
    expected_version: int = Field(gt=0)
    owner_person_id: int = Field(gt=0)


class PaymentPart(Input):
    obligation_id: int = Field(gt=0)
    amount: Money


class CashInput(OperationInput):
    amount: Money
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    occurred_on: BusinessDate
    method_id: int = Field(gt=0)
    payer_id: int = Field(gt=0)
    beneficiary_person_id: int | None = Field(default=None, gt=0)
    beneficiary_label: str | None = Field(default=None, max_length=160)
    reference: str | None = Field(default=None, max_length=160)
    document_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=3000)


class ReceiveInput(CashInput):
    person_id: int = Field(gt=0)
    surplus: Literal["reject", "credit", "advance"] = "reject"
    applications: list[PaymentPart] = Field(default_factory=list, max_length=200)


class GuaranteeInput(CashInput):
    person_id: int = Field(gt=0)
    contract_id: int = Field(gt=0)
    conditions: str = Field(min_length=3, max_length=3000)


class ExpenseInput(OperationInput):
    person_id: int = Field(gt=0)
    unit_id: int | None = Field(default=None, gt=0)
    category_id: int = Field(gt=0)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    amount: Money
    description: str = Field(min_length=3, max_length=250)
    recorded_on: BusinessDate
    due_on: BusinessDate | None = None
    document_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=3000)


class DisbursementInput(CashInput):
    is_direct: bool = False
    applications: list[PaymentPart] = Field(default_factory=list, max_length=200)


class RefundInput(CashInput):
    reason: str = Field(min_length=3, max_length=3000)


class ApplicationPart(PaymentPart):
    source_movement_id: int = Field(gt=0)


class ApplyInput(OperationInput):
    applications: list[ApplicationPart] = Field(min_length=1, max_length=200)
    authorize_guarantee: bool = False


class AdjustmentInput(OperationInput):
    new_total: Nonnegative
    new_due_on: BusinessDate | None = None
    reason: str = Field(min_length=3, max_length=3000)


class ReasonInput(OperationInput):
    reason: str = Field(min_length=3, max_length=3000)


class CatalogInput(Input):
    name: str = Field(min_length=2, max_length=80)
    is_active: bool = True
