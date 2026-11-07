"""Operaciones exactas sobre importes; sin persistencia ni movimientos efectivos."""

from decimal import Decimal, ROUND_DOWN, localcontext

CENT = Decimal("0.01")


def apportion(total, weights):
    """Restos mayores, empate por orden estable de los participantes recibidos."""
    total = Decimal(total)
    if total < 0 or any(w < 0 for w in weights) or not weights:
        raise ValueError("Importes y pesos no válidos.")
    if sum(weights) == 0:
        weights = [Decimal(1)] * len(weights)
    with localcontext() as ctx:
        ctx.prec = 48
        raw = [total * w / sum(weights) for w in weights]
        floors = [x.quantize(CENT, rounding=ROUND_DOWN) for x in raw]
        remaining = int(total * 100) - sum(int(x * 100) for x in floors)
        order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - floors[i]), i))
        for i in order[:remaining]:
            floors[i] += CENT
    assert sum(floors) == total
    return floors, [i for i in order[:remaining]]


def occupied_days(start, end, period_start, period_end):
    first, last = max(start, period_start), min(end, period_end)
    return max(0, (last - first).days + 1)


def occupant_theory(assigned, days, period_days, eligible):
    if not eligible:
        return Decimal(0)
    if days >= 15:
        return assigned
    with localcontext() as ctx:
        ctx.prec = 48
        return assigned * Decimal(days) / Decimal(period_days)
