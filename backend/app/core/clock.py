"""Instantes UTC sin zona en SQL: MySQL DATETIME no conserva tzinfo."""
from datetime import datetime, timezone

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
