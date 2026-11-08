from decimal import Decimal
from typing import Literal
from pydantic import Field, model_validator
from app.schemas.registry import Input
from app.schemas.utilities import BusinessDate
from app.schemas.finances import OperationInput, CashInput, Money, Nonnegative


class VersionedOperation(OperationInput):
    expected_version: int = Field(ge=0)
    expected_contract_version: int = Field(gt=0)


class HolderInput(Input):
    person_id: int = Field(gt=0)
    beneficiary_person_id: int | None = Field(default=None, gt=0)
    assigned_amount: Nonnegative


class ResponsibleInput(Input):
    person_id: int = Field(gt=0)
    assigned_amount: Nonnegative


class ConditionsInput(VersionedOperation):
    agreed_capital: Money
    expected_delivery_on: BusinessDate | None = None
    restitution_on: BusinessDate | None = None
    allow_early_return: bool = False
    conditions: str = Field(min_length=3, max_length=5000)
    document_reference: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=3000)
    holders: list[HolderInput] = Field(default_factory=list, max_length=100)
    responsibles: list[ResponsibleInput] = Field(default_factory=list, max_length=100)
    acknowledge_received_excess: bool = False

    @model_validator(mode="after")
    def explicit_parties(self):
        for name, parties in [
            ("titulares", self.holders),
            ("responsables", self.responsibles),
        ]:
            if len({p.person_id for p in parties}) != len(parties):
                raise ValueError(f"No repita personas entre los {name}.")
            if (
                parties
                and sum((p.assigned_amount for p in parties), Decimal(0))
                != self.agreed_capital
            ):
                raise ValueError(
                    f"Los importes de {name} deben sumar exactamente el capital acordado."
                )
        return self


class CapitalPart(Input):
    holder_id: int = Field(gt=0)
    responsible_id: int = Field(gt=0)
    amount: Money


class CapitalCash(CashInput):
    expected_version: int = Field(gt=0)
    expected_contract_version: int = Field(gt=0)
    beneficiary_person_id: int = Field(gt=0)
    allocations: list[CapitalPart] = Field(min_length=1, max_length=200)


class AdjustmentPart(Input):
    holder_id: int = Field(gt=0)
    responsible_id: int = Field(gt=0)
    delta: Decimal = Field(max_digits=14, decimal_places=2)


class CapitalAdjustmentInput(VersionedOperation):
    kind: Literal["settlement", "reassignment", "additional"]
    effective_on: BusinessDate
    document_reference: str = Field(min_length=3, max_length=500)
    reason: str = Field(min_length=3, max_length=3000)
    allocations: list[AdjustmentPart] = Field(min_length=1, max_length=200)


class CapitalReason(VersionedOperation):
    reason: str = Field(min_length=3, max_length=3000)
