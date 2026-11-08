"""Contenido y enlaces oficiales. No hay cliente de envío ni credenciales externas."""

from string import Formatter
from urllib.parse import quote
from typing import Protocol
from decimal import Decimal
import re
import phonenumbers
from fastapi import HTTPException
from app.services.finances import require

KINDS = {
    "rent": ("Alquiler", "payments"),
    "service": ("Servicio básico", "payments"),
    "recovery": ("Recuperación de servicio", "payments"),
    "provider": ("Servicio que debe pagar el propietario", "payments"),
    "expense": ("Pago de gasto registrado", "payments"),
    "contract": ("Finalización de contrato", "contracts"),
    "capital": ("Restitución de anticrético", "capital"),
    "report": ("Pago reportado pendiente de verificar", "reports"),
}
PURPOSES = {
    "payments": "Recordatorios de pagos y servicios",
    "contracts": "Coordinación de contratos",
    "capital": "Restitución de capital",
    "reports": "Revisión de pagos reportados",
}
FIELDS = {
    "nombre",
    "propiedad",
    "espacio",
    "concepto",
    "importe",
    "moneda",
    "vencimiento",
    "periodo",
    "capital_recibido",
    "capital_devuelto",
    "responsable",
}
DEFAULTS = {
    "rent": "Buen día, Sr./Sra. {nombre}.\nLe recordamos que se encuentra pendiente {moneda} {importe} correspondiente al alquiler de {espacio}, periodo {periodo}, con vencimiento el {vencimiento}.\nAgradeceremos revisar esta información y comunicarnos cualquier observación. Muchas gracias.",
    "service": "Buen día, Sr./Sra. {nombre}.\nSegún los registros, se encuentra pendiente {moneda} {importe} por {concepto} de {espacio}, periodo {periodo}, con vencimiento el {vencimiento}.\nMuchas gracias.",
    "recovery": "Buen día, Sr./Sra. {nombre}.\nSe encuentra pendiente recuperar {moneda} {importe} por {concepto} de {espacio}, periodo {periodo}, con vencimiento el {vencimiento}.\nAgradeceremos revisar esta información. Muchas gracias.",
    "provider": "Buen día, Sr./Sra. {nombre}.\nEl servicio {concepto} de {propiedad} tiene un saldo pendiente de pago al proveedor de {moneda} {importe}, con vencimiento el {vencimiento}.\nMuchas gracias.",
    "expense": "Buen día, Sr./Sra. {nombre}.\nEl gasto registrado {concepto} de {propiedad} tiene un saldo pendiente de pago de {moneda} {importe}, con vencimiento el {vencimiento}.\nMuchas gracias.",
    "contract": "Buen día, Sr./Sra. {nombre}.\nEl contrato de {espacio} tiene prevista su finalización para el {vencimiento}.\nLe agradeceremos comunicarse con la administración para revisar cualquier coordinación necesaria. Muchas gracias.",
    "capital": "Buen día, Sr./Sra. {nombre}.\nEl anticrético de {espacio} tiene prevista la restitución para el {vencimiento}.\nSegún los registros actuales, el capital pendiente de esta asignación es {moneda} {importe}.\nAgradeceremos revisar las condiciones del acuerdo. Muchas gracias.",
    "report": "Buen día, Sr./Sra. {nombre}.\nSe registró un reporte de pago de {moneda} {importe} por {concepto} de {propiedad}. Está pendiente de verificación; este aviso no confirma recepción de dinero.\nMuchas gracias.",
}


def validate_template(body):
    try:
        parts = list(Formatter().parse(body))
    except ValueError:
        require(False, "Revise las llaves de los campos de la plantilla.")
    require(
        all(
            field is None or (field in FIELDS and not spec and not conversion)
            for _, field, spec, conversion in parts
        ),
        "Utilice solamente los campos permitidos de la plantilla, sin instrucciones ni formatos adicionales.",
    )
    return {field for _, field, _, _ in parts if field}


def normalize_number(raw, bolivia_local=False):
    raw = raw.strip()
    require(
        bool(re.fullmatch(r"[+0-9() .-]+", raw)),
        "El número debe contener solamente dígitos y signos habituales de teléfono.",
    )
    require(
        "+" not in raw or (raw.startswith("+") and raw.count("+") == 1),
        "Escriba un único signo + al inicio del número internacional.",
    )
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("00"):
        raw = "+" + digits[2:]
    elif raw.startswith("+"):
        raw = "+" + digits
    elif bolivia_local and len(digits) == 8:
        raw = "+591" + digits
    else:
        raw = "+" + digits
    try:
        parsed = phonenumbers.parse(raw, None)
        valid = phonenumbers.is_valid_number(parsed) and not parsed.extension
    except phonenumbers.NumberParseException:
        valid = False
    require(
        valid,
        "El número internacional está incompleto o no es válido. Incluya el prefijo del país; para Bolivia puede elegir agregar 591.",
    )
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)[1:]


def contact_matches(person, number):
    for raw in [person.whatsapp, person.phone]:
        if not raw:
            continue
        try:
            if normalize_number(raw) == number:
                return True
        except HTTPException:
            pass
        # La aceptación explícita del número 591 autoriza interpretar su mismo
        # número local guardado; no se deduce un país al preparar otros mensajes.
        digits = re.sub(r"\D", "", raw)
        if (
            number.startswith("591")
            and len(number) == 11
            and len(digits) == 8
            and number[3:] == digits
        ):
            return True
    return False


def money(value):
    return (
        format(Decimal(value), ",.2f")
        .replace(",", "_")
        .replace(".", ",")
        .replace("_", ".")
    )


class LinkProvider(Protocol):
    """Frontera futura de integración; únicamente prepara enlaces manuales."""

    def build_link(self, number: str, text: str) -> str: ...


class ClickToChat:
    def build_link(self, number, text):
        number = normalize_number("+" + number)
        require(bool(text.strip()), "Escriba un mensaje antes de abrir WhatsApp.")
        return "https://wa.me/" + number + "?text=" + quote(text, safe="")


def render_message(template, event, person):
    fields = validate_template(template)
    values = {
        "nombre": person.full_name,
        "propiedad": event["property_name"],
        "espacio": event["target_label"],
        "concepto": event["concept"],
        "importe": money(event["amount"]) if event["amount"] is not None else None,
        "moneda": event["currency"],
        "vencimiento": (
            event["due_on"][8:10]
            + "/"
            + event["due_on"][5:7]
            + "/"
            + event["due_on"][:4]
            if event["due_on"]
            else None
        ),
        "periodo": event.get("period"),
        "capital_recibido": (
            money(event["capital_received"])
            if event.get("capital_received") is not None
            else None
        ),
        "capital_devuelto": (
            money(event["capital_returned"])
            if event.get("capital_returned") is not None
            else None
        ),
        "responsable": event.get("responsible_name"),
    }
    require(
        all(values.get(field) is not None for field in fields),
        "Faltan datos del origen para preparar un mensaje correcto. Revise la fecha, el periodo o las personas.",
    )
    return template.format_map(values)
