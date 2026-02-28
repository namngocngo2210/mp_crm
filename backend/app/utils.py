from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal


DATETIME_FMT = "%d-%m-%Y %H:%M:%S"
DATE_FMT = "%d-%m-%Y"
VN_TZ = timezone(timedelta(hours=7))


def fmt_datetime(v: datetime | None) -> str | None:
    if not v:
        return None
    # SQLite CURRENT_TIMESTAMP is UTC; normalize to UTC+7 for API output.
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(VN_TZ).strftime(DATETIME_FMT)


def fmt_date(v: date | None) -> str | None:
    if not v:
        return None
    return v.strftime(DATE_FMT)


def parse_date(v: str | None):
    if not v:
        return None
    return datetime.strptime(v, DATE_FMT).date()


def to_num(v):
    if isinstance(v, Decimal):
        return float(v)
    return v
