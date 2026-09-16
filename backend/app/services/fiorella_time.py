# backend/app/services/fiorella_time.py
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

# República Dominicana usa UTC-04:00 todo el año.
# Usamos un offset fijo para no depender de zoneinfo/tzdata en Windows/IIS.
FIORELLA_TIMEZONE_NAME = "America/Santo_Domingo"
FIORELLA_TIMEZONE = timezone(
    timedelta(hours=-4),
    name=FIORELLA_TIMEZONE_NAME,
)


@dataclass(frozen=True)
class TemporalContext:
    now_iso: str
    date_iso: str
    time_local: str
    timezone: str
    date_from: str | None = None
    date_to: str | None = None
    label: str | None = None


_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize(
        "NFD",
        (text or "").lower(),
    )

    return "".join(
        ch
        for ch in normalized
        if unicodedata.category(ch) != "Mn"
    )


def now_local() -> datetime:
    """
    Fecha/hora oficial de Fiorella en República Dominicana.
    No depende de tzdata ni de ZoneInfo.
    """
    return datetime.now(
        FIORELLA_TIMEZONE,
    )


def official_time_context() -> TemporalContext:
    now = now_local()

    return TemporalContext(
        now_iso=now.isoformat(),
        date_iso=now.date().isoformat(),
        time_local=now.strftime("%H:%M:%S"),
        timezone=FIORELLA_TIMEZONE_NAME,
    )


def _month_range(
    year: int,
    month: int,
) -> tuple[date, date]:
    start = date(
        year,
        month,
        1,
    )

    if month == 12:
        next_month = date(
            year + 1,
            1,
            1,
        )
    else:
        next_month = date(
            year,
            month + 1,
            1,
        )

    end = next_month - timedelta(days=1)

    return start, end


def resolve_temporal_context(
    user_message: str,
) -> TemporalContext:
    """
    Resuelve expresiones temporales usando SIEMPRE la fecha oficial
    del backend.

    Soporta:
    - hoy
    - ayer
    - anteayer
    - esta semana
    - semana pasada
    - este mes / mes actual
    - mes pasado
    - este año / año actual
    - septiembre
    - septiembre 2026
    """

    now = now_local()
    today = now.date()

    normalized = _normalize(
        user_message,
    )

    date_from: date | None = None
    date_to: date | None = None
    label: str | None = None

    if re.search(
        r"\banteayer\b",
        normalized,
    ):
        target = today - timedelta(days=2)
        date_from = target
        date_to = target
        label = "anteayer"

    elif re.search(
        r"\bayer\b",
        normalized,
    ):
        target = today - timedelta(days=1)
        date_from = target
        date_to = target
        label = "ayer"

    elif re.search(
        r"\bhoy\b",
        normalized,
    ):
        date_from = today
        date_to = today
        label = "hoy"

    elif re.search(
        r"\b(esta semana|semana actual)\b",
        normalized,
    ):
        date_from = today - timedelta(
            days=today.weekday(),
        )
        date_to = today
        label = "esta semana"

    elif re.search(
        r"\bsemana pasada\b",
        normalized,
    ):
        this_monday = today - timedelta(
            days=today.weekday(),
        )

        date_from = this_monday - timedelta(
            days=7,
        )
        date_to = this_monday - timedelta(
            days=1,
        )
        label = "semana pasada"

    elif re.search(
        r"\b(este mes|mes actual)\b",
        normalized,
    ):
        date_from = today.replace(
            day=1,
        )
        date_to = today
        label = "este mes"

    elif re.search(
        r"\bmes pasado\b",
        normalized,
    ):
        first_this_month = today.replace(
            day=1,
        )

        last_previous_month = (
            first_this_month
            - timedelta(days=1)
        )

        date_from = last_previous_month.replace(
            day=1,
        )
        date_to = last_previous_month
        label = "mes pasado"

    elif re.search(
        r"\b(este ano|ano actual)\b",
        normalized,
    ):
        date_from = date(
            today.year,
            1,
            1,
        )
        date_to = today
        label = "este año"

    else:
        month_pattern = "|".join(
            sorted(
                _MONTHS.keys(),
                key=len,
                reverse=True,
            )
        )

        month_match = re.search(
            rf"\b({month_pattern})\b(?:\s+(?:de\s+)?(\d{{4}}))?",
            normalized,
        )

        if month_match:
            month_name = month_match.group(1)
            explicit_year = month_match.group(2)

            month = _MONTHS[
                month_name
            ]

            year = (
                int(explicit_year)
                if explicit_year
                else today.year
            )

            start, end = _month_range(
                year,
                month,
            )

            # Si es el mes actual, no consultamos fechas futuras.
            if (
                year == today.year
                and month == today.month
            ):
                end = today

            date_from = start
            date_to = end
            label = f"{month_name} {year}"

    return TemporalContext(
        now_iso=now.isoformat(),
        date_iso=today.isoformat(),
        time_local=now.strftime("%H:%M:%S"),
        timezone=FIORELLA_TIMEZONE_NAME,
        date_from=(
            date_from.isoformat()
            if date_from
            else None
        ),
        date_to=(
            date_to.isoformat()
            if date_to
            else None
        ),
        label=label,
    )


def apply_temporal_args(
    tool_name: str,
    args: dict,
    user_message: str,
) -> dict:
    """
    El backend corrige las fechas de las tools.

    Aunque el modelo envíe una fecha equivocada, si el usuario dijo
    hoy/ayer/este mes/etc. se reemplaza por la fecha oficial.
    """

    if tool_name not in {
    "search_punches",
    "export_punches_excel",
    }:
        return dict(args)

    temporal = resolve_temporal_context(
        user_message,
    )

    normalized = dict(args)

    if temporal.date_from:
        normalized["fecha_desde"] = (
            temporal.date_from
        )

    if temporal.date_to:
        normalized["fecha_hasta"] = (
            temporal.date_to
        )

    return normalized
