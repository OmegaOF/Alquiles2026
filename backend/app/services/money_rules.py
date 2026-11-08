"""Medidas exactas compartidas por el libro vigente y las consultas de reportes.

La selección de hechos vigentes o a fecha de corte corresponde al llamador.
No escribe dinero ni consulta relaciones, y no utiliza números binarios flotantes.
"""

from decimal import Decimal

ZERO = Decimal("0.00")


def obligation_measure(original, adjustments, applications, due, end):
    total = original + sum((a.delta for a in adjustments), ZERO)
    paid = sum((a.amount for a in applications), ZERO)
    due = next((a.new_due_on for a in reversed(adjustments) if a.new_due_on), due)
    end = next(
        (a.new_period_end for a in reversed(adjustments) if a.new_period_end), end
    )
    return total, paid, total - paid, due, end


def expense_measure(original, voided, adjustments, payments):
    total = ZERO if voided else original + sum((a.delta for a in adjustments), ZERO)
    paid = sum((p.amount for p in payments), ZERO)
    return total, paid, max(total - paid, ZERO)


def capital_pending(received, returned, adjustments):
    return received + adjustments - returned
