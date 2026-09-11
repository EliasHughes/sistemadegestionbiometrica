# backend/app/services/overtime.py
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

JORNADA_DEFAULT = 8.0
SABADO_BASE_DEFAULT = 4.0
NIGHT_START_DEFAULT = time(18, 0)
NIGHT_END_DEFAULT = time(6, 0)


def _r(value: float) -> float:
    return round(float(value or 0), 2)


def _as_time(value) -> time | None:
    if value is None:
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, datetime):
        return value.time()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text[:8], fmt).time()
        except ValueError:
            continue
    return None


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _empty(fecha: date | None, entrada: time | None, note: str) -> dict[str, Any]:
    return {
        "fecha": fecha.isoformat() if fecha else None,
        "entrada": entrada.strftime("%H:%M:%S") if entrada else None,
        "salida": None,
        "worked_hours": 0.0,
        "regular_hours": 0.0,
        "h15": 0.0,
        "h45": 0.0,
        "h100": 0.0,
        "h165": 0.0,
        "night_hours": 0.0,
        "extra_hours": 0.0,
        "saturday_premium_hours": 0.0,
        "weekday": fecha.weekday() if fecha else None,
        "bucket": "incomplete",
        "note": note,
    }


def _shift_bounds(day: date, entrada: time, salida: time) -> tuple[datetime, datetime, bool]:
    start = datetime.combine(day, entrada)
    end = datetime.combine(day, salida)
    overnight = False
    if end <= start:
        end = end + timedelta(days=1)
        overnight = True
    return start, end, overnight


def _night_minutes(start: datetime, end: datetime, night_start: time, night_end: time) -> int:
    total = 0
    cursor = start.replace(minute=0, second=0, microsecond=0)
    while cursor < end:
        slot_end = min(cursor + timedelta(minutes=1), end)
        minutes = int((slot_end - cursor).total_seconds() // 60)
        if minutes <= 0:
            cursor = slot_end
            continue
        ht = cursor.time()
        if night_start <= night_end:
            in_night = night_start <= ht < night_end
        else:
            in_night = ht >= night_start or ht < night_end
        if in_night:
            total += minutes
        cursor = slot_end
    return total


def classify_day_hours(
    day: date,
    worked_hours: float,
    night_hours: float,
    is_holiday: bool,
    jornada: float = JORNADA_DEFAULT,
    saturday_base: float = SABADO_BASE_DEFAULT,
    sabado_base: float | None = None,
) -> dict[str, float | str]:
    sat = SABADO_BASE_DEFAULT
    if sabado_base is not None:
        sat = float(sabado_base)
    else:
        sat = float(saturday_base)

    worked = max(0.0, float(worked_hours or 0))
    night = min(worked, max(0.0, float(night_hours or 0)))
    empty: dict[str, float | str] = {
        "h15": 0.0,
        "h45": 0.0,
        "h100": 0.0,
        "h165": 0.0,
        "regular_hours": 0.0,
        "bucket": "none",
    }
    if worked <= 0:
        return empty

    wd = day.weekday()

    if is_holiday:
        return {**empty, "h165": _r(worked), "bucket": "holiday_165"}
    if wd == 6:
        return {**empty, "h100": _r(worked), "bucket": "sunday_100"}
    if wd == 5:
        base = min(worked, sat)
        extra = max(0.0, worked - sat)
        return {**empty, "h100": _r(extra), "regular_hours": _r(base), "bucket": "saturday"}

    ordinary = min(worked, float(jornada))
    extra = max(0.0, worked - float(jornada))
    night_in_ordinary = min(night, ordinary)
    return {
        "h15": _r(night_in_ordinary),
        "h45": _r(extra),
        "h100": 0.0,
        "h165": 0.0,
        "regular_hours": _r(ordinary - night_in_ordinary),
        "bucket": "weekday",
    }


def calculate_day(
    fecha: date,
    entrada: time,
    salida: time | None,
    scheduled_hours: float = JORNADA_DEFAULT,
    is_holiday: bool = False,
    night_start: time | None = None,
    night_end: time | None = None,
    saturday_base_hours: float = SABADO_BASE_DEFAULT,
) -> dict[str, Any]:
    ns = night_start or NIGHT_START_DEFAULT
    ne = night_end or NIGHT_END_DEFAULT
    if not salida:
        row = _empty(fecha, entrada, "Sin hora de salida")
        row["is_holiday"] = is_holiday
        return row

    start_dt, end_dt, _overnight = _shift_bounds(fecha, entrada, salida)
    worked_min = max(0, int((end_dt - start_dt).total_seconds() // 60))
    night_total_min = _night_minutes(start_dt, end_dt, ns, ne)
    ordinary_end = min(end_dt, start_dt + timedelta(hours=float(scheduled_hours)))
    night_ordinary_min = _night_minutes(start_dt, ordinary_end, ns, ne)

    buckets = classify_day_hours(
        fecha,
        worked_min / 60.0,
        night_ordinary_min / 60.0,
        is_holiday,
        jornada=scheduled_hours,
        saturday_base=saturday_base_hours,
    )
    return {
        "fecha": fecha.isoformat(),
        "entrada": entrada.strftime("%H:%M:%S"),
        "salida": salida.strftime("%H:%M:%S"),
        "worked_hours": _r(worked_min / 60.0),
        "night_hours": _r(night_total_min / 60.0),
        "regular_hours": buckets["regular_hours"],
        "h15": buckets["h15"],
        "h45": buckets["h45"],
        "h100": buckets["h100"],
        "h165": buckets["h165"],
        "extra_hours": buckets["h45"],
        "saturday_premium_hours": buckets["h100"] if buckets["bucket"] == "saturday" else 0.0,
        "weekday": fecha.weekday(),
        "bucket": buckets["bucket"],
        "is_holiday": is_holiday,
        "note": "",
    }

def calculate_employee_day(
    codigo: str,
    nombre: str,
    fecha: date,
    punches: list[dict],
    is_holiday: bool = False,
    scheduled_hours: float = JORNADA_DEFAULT,
) -> dict[str, Any]:
    entradas: list[time] = []
    salidas: list[time] = []
    for p in punches:
        e = _as_time(p.get("entrada"))
        s = _as_time(p.get("salida"))
        if e:
            entradas.append(e)
        if s:
            salidas.append(s)
    if not entradas:
        row = _empty(fecha, None, "Sin entrada")
        row.update({"codigo": codigo, "nombre": nombre, "is_holiday": is_holiday})
        return row
    entrada = min(entradas)
    salida = max(salidas) if salidas else None
    row = calculate_day(fecha, entrada, salida, scheduled_hours=scheduled_hours, is_holiday=is_holiday)
    row["codigo"] = codigo
    row["nombre"] = nombre
    return row


def _parse_hhmm(value, default=None):
    parsed = _as_time(value)
    if parsed is not None:
        return parsed
    if default is None:
        return None
    if isinstance(default, time):
        return default
    return _as_time(default)


_parse_time = _as_time
_parse_date = _as_date
