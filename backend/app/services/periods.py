"""Periodos contractuales y conteos. No genera deudas ni calcula servicios."""

from calendar import monthrange
from datetime import date, timedelta


def month_anchor(start: date, offset: int) -> date:
    index = start.year * 12 + start.month - 1 + offset
    year, month = divmod(index, 12)
    month += 1
    return date(year, month, min(start.day, monthrange(year, month)[1]))


def periods(contract):
    start = contract.start_date
    end = contract.actual_end_date or contract.end_date
    contracted_days = (contract.end_date - start).days + 1
    days = (end - start).days + 1
    result = {
        "occupancy_days": days,
        "contracted_days": contracted_days,
        "counting": "inclusive",
        "billable_days": None,
        "full_weeks": None,
        "partial_days": None,
        "monthly_periods": [],
    }
    if contract.mode == "daily":
        result.update(
            counting=contract.daily_count,
            billable_days=(
                contracted_days
                if contract.daily_count == "inclusive"
                else contracted_days - 1
            ),
        )
    elif contract.mode == "weekly":
        result.update(full_weeks=contracted_days // 7, partial_days=contracted_days % 7)
    elif contract.mode == "monthly":
        index = 0
        cursor = start
        while cursor <= end:
            if contract.monthly_period == "calendar":
                full_start = cursor.replace(day=1)
                full_end = cursor.replace(day=monthrange(cursor.year, cursor.month)[1])
                next_start = full_end + timedelta(days=1)
            else:
                full_start = month_anchor(start, index)
                next_start = month_anchor(start, index + 1)
                full_end = next_start - timedelta(days=1)
            actual_end = min(end, full_end)
            denominator = (full_end - full_start).days + 1
            due = None
            if contract.payment_timing != "custom":
                earliest = (
                    cursor
                    if contract.payment_timing == "advance"
                    else actual_end + timedelta(days=1)
                )
                due = earliest.replace(
                    day=min(
                        contract.due_day, monthrange(earliest.year, earliest.month)[1]
                    )
                )
                if due < earliest:
                    next_month = month_anchor(earliest.replace(day=1), 1)
                    due = next_month.replace(
                        day=min(
                            contract.due_day,
                            monthrange(next_month.year, next_month.month)[1],
                        )
                    )
            result["monthly_periods"].append(
                {
                    "start": cursor.isoformat(),
                    "end": actual_end.isoformat(),
                    "full_start": full_start.isoformat(),
                    "full_end": full_end.isoformat(),
                    "occupied_days": (actual_end - cursor).days + 1,
                    "period_days": denominator,
                    "first_period_rule": contract.first_period if index == 0 else None,
                    "due_date": due.isoformat() if due else None,
                }
            )
            cursor = next_start
            index += 1
    return result
