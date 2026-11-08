from typing import Literal
from datetime import date
from pydantic import Field, model_validator
from app.schemas.registry import Input
from app.schemas.finances import OperationInput, Money
from app.schemas.utilities import BusinessDate

Kind = Literal[
    "rent",
    "service",
    "recovery",
    "provider",
    "expense",
    "contract",
    "capital",
    "report",
]
Purpose = Literal["payments", "contracts", "capital", "reports"]


class Versioned(OperationInput):
    expected_version: int = Field(ge=0)


class TypePreferenceInput(Input):
    kind: Kind
    is_enabled: bool = True
    allow_whatsapp: bool = True


class PreferenceInput(Versioned):
    lead_days: list[int] = Field(min_length=1, max_length=20)
    snooze_days: int = Field(ge=1, le=30)
    recipient_user_ids: list[int] = Field(default_factory=list, max_length=100)
    types: list[TypePreferenceInput] = Field(min_length=8, max_length=8)

    @model_validator(mode="after")
    def no_duplicates(self):
        if len(set(self.lead_days)) != len(self.lead_days) or any(
            d < 0 or d > 365 for d in self.lead_days
        ):
            raise ValueError("Indique días distintos entre 0 y 365.")
        if (
            len(set(self.recipient_user_ids)) != len(self.recipient_user_ids)
            or len({t.kind for t in self.types}) != 8
        ):
            raise ValueError("No repita destinatarios ni tipos de aviso.")
        return self


class TemplateInput(Versioned):
    kind: Kind
    name: str = Field(min_length=3, max_length=100)
    body: str = Field(min_length=10, max_length=4000)
    is_active: bool = True


class ConsentInput(Versioned):
    person_id: int = Field(gt=0)
    purpose: Purpose
    number: str = Field(min_length=7, max_length=40)
    bolivia_local: bool = False
    accepted_on: BusinessDate
    method: str = Field(min_length=3, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    explicitly_accepted: Literal[True]


class RevokeConsent(Versioned):
    reason: str = Field(min_length=3, max_length=1000)


class NoticeAction(Versioned):
    expected_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    action: Literal["reviewed", "snoozed", "reopened"]
    until_on: BusinessDate | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def until_matches(self):
        if (self.action == "snoozed") != (self.until_on is not None):
            raise ValueError("Indique una fecha solamente cuando posponga el aviso.")
        return self


class PrepareMessage(Versioned):
    expected_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    expected_proposal_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    recipient_id: int = Field(gt=0)
    text: str | None = Field(default=None, min_length=3, max_length=5000)


class MessageAction(Versioned):
    action: Literal[
        "authorize_open",
        "opened",
        "manual_sent",
        "not_sent",
        "correct_sent",
        "correct_not_sent",
    ]
    notes: str | None = Field(default=None, max_length=1000)
    authorization_operation_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def opening(self):
        if (self.action == "opened") != (self.authorization_operation_id is not None):
            raise ValueError(
                "Registre la apertura utilizando la autorización recién comprobada."
            )
        if self.action.startswith("correct_") and (
            not self.notes or len(self.notes.strip()) < 3
        ):
            raise ValueError(
                "Explique el motivo de la corrección; el evento anterior se conservará."
            )
        return self


class ReportInput(OperationInput):
    obligation_id: int | None = Field(default=None, gt=0)
    person_id: int | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    reporting_person_id: int = Field(gt=0)
    concept: str = Field(min_length=3, max_length=250)
    amount: Money
    reported_on: BusinessDate
    method_id: int = Field(gt=0)
    document_reference: str = Field(min_length=3, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def source(self):
        if self.obligation_id is not None:
            if self.person_id is not None or self.currency is not None:
                raise ValueError(
                    "La persona responsable y moneda se obtienen de la obligación; no las repita."
                )
        elif not self.person_id or not self.currency:
            raise ValueError(
                "Seleccione una obligación o indique persona responsable y moneda para el concepto."
            )
        return self


class ReportDecision(Versioned):
    action: Literal["pending", "verified", "rejected"]
    movement_id: int | None = Field(default=None, gt=0)
    reason: str = Field(min_length=3, max_length=1000)

    @model_validator(mode="after")
    def movement(self):
        if (self.action == "verified") != (self.movement_id is not None):
            raise ValueError(
                "Para verificar seleccione un movimiento real; no se vincula dinero al rechazar o revisar."
            )
        return self
