"""Condiciones explícitas sobre los periodos de fase 2; dinero exacto."""

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP, localcontext
from app.services.periods import periods


def cents(value):
    with localcontext() as ctx:
        ctx.prec = 48
        return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rent_preview(contract, data):
    issues = []
    rows = []
    if contract.status not in {"active", "finished"}:
        return {
            "issues": ["El contrato debe estar vigente o finalizado."],
            "periods": [],
        }
    if contract.mode in {"anticretico", "mixed"} or contract.price is None:
        return {
            "issues": [
                "Este contrato no define una tarifa ordinaria de alquiler. No se genera capital de anticrético."
            ],
            "periods": [],
        }
    end = contract.actual_end_date or contract.end_date
    start = contract.start_date

    def add(a, b, value, due=None):
        if a > data.through:
            return
        if cents(value) > Decimal("999999999999.99"):
            issues.append(
                "El importe calculado supera el máximo admitido; revise el precio o el periodo."
            )
            return
        if due is None:
            due = data.due_on or (
                a if contract.payment_timing == "advance" else b + timedelta(days=1)
            )
            if contract.payment_timing == "custom" and data.due_on is None:
                issues.append(
                    "Indique la fecha de vencimiento pactada para las condiciones personalizadas."
                )
        rows.append(
            {
                "start": a.isoformat(),
                "end": b.isoformat(),
                "amount": str(cents(value)),
                "due_on": due.isoformat(),
            }
        )

    with localcontext() as ctx:
        ctx.prec = 48
        if contract.mode == "daily":
            # Fase 2 describe los días contratados; la salida anticipada efectiva
            # limita esta generación. No se altera el historial de fase 2.
            count = (end - start).days + (
                1 if contract.daily_count == "inclusive" else 0
            )
            add(start, end, contract.price * max(count, 0))
        elif contract.mode == "weekly":
            full, remainder = divmod((end - start).days + 1, 7)
            for i in range(full):
                a = start + timedelta(days=7 * i)
                add(a, a + timedelta(days=6), contract.price)
            if remainder and start + timedelta(days=7 * full) <= data.through:
                if (
                    not contract.weekly_partial_allowed
                    or data.weekly_partial_rule is None
                    or not data.reason
                ):
                    issues.append(
                        "El tramo semanal incompleto requiere una regla de importe expresamente pactada y un motivo."
                    )
                else:
                    value = (
                        contract.price
                        if data.weekly_partial_rule == "full"
                        else contract.price * remainder / Decimal(7)
                    )
                    add(start + timedelta(days=7 * full), end, value)
        else:
            for i, p in enumerate(periods(contract)["monthly_periods"]):
                from datetime import date

                a = date.fromisoformat(p["start"])
                b = date.fromisoformat(p["end"])
                if a > data.through:
                    continue
                final_short = p["end"] < p["full_end"]
                rule = (
                    data.last_period_rule
                    if final_short
                    else (contract.first_period if i == 0 else "full")
                )
                if final_short and (rule is None or not data.reason):
                    issues.append(
                        "El último periodo mensual incompleto requiere regla pactada y justificación."
                    )
                    continue
                value = contract.price
                if rule in {"proportional", "prorated"}:
                    value = (
                        value * Decimal(p["occupied_days"]) / Decimal(p["period_days"])
                    )
                due = (
                    date.fromisoformat(p["due_date"]) if p["due_date"] else data.due_on
                )
                add(a, b, value, due)
    return {
        "issues": list(dict.fromkeys(issues)),
        "periods": rows,
        "contract_version": contract.version,
        "currency": contract.currency,
    }
