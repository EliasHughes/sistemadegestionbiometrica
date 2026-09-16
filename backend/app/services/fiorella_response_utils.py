# backend/app/services/fiorella_response_utils.py
from __future__ import annotations

import json
import re
from typing import Any


_MARKDOWN_BOLD = re.compile(r"\*\*(.*?)\*\*", re.DOTALL)
_MARKDOWN_CODE = re.compile(r"`([^`]+)`")


def clean_user_text(text: str | None) -> str:
    value = (text or "").strip()

    if not value:
        return ""

    value = _MARKDOWN_BOLD.sub(r"\1", value)
    value = _MARKDOWN_CODE.sub(r"\1", value)

    return value.strip()


def _find_count(result: Any) -> int | None:
    if not isinstance(result, dict):
        return None

    for key in ("count", "total", "total_registros", "records", "cantidad"):
        value = result.get(key)

        if isinstance(value, bool):
            continue

        if isinstance(value, int):
            return value

        if isinstance(value, str) and value.isdigit():
            return int(value)

    for key in ("items", "data", "rows", "resultados"):
        value = result.get(key)

        if isinstance(value, list):
            return len(value)

    return None


def _result_ok(result: Any) -> bool:
    if not isinstance(result, dict):
        return True

    if "ok" not in result:
        return not bool(result.get("error"))

    return bool(result.get("ok"))


def fallback_from_tool_results(
    tool_results: list[dict[str, Any]],
) -> str:
    if not tool_results:
        return (
            "La consulta se procesó, pero no recibí datos "
            "suficientes para elaborar una respuesta."
        )

    last = tool_results[-1]

    name = str(last.get("tool") or last.get("name") or "herramienta")
    args = last.get("arguments") or {}
    result = last.get("result")

    if not _result_ok(result):
        error = result.get("error") if isinstance(result, dict) else None
        return (
            f"No pude completar la consulta con {name}. "
            + (f"Detalle: {error}" if error else "")
        ).strip()

    count = _find_count(result)

    if name == "search_punches":
        query = str(args.get("query") or "").strip()
        fecha_desde = str(args.get("fecha_desde") or "").strip()
        fecha_hasta = str(args.get("fecha_hasta") or "").strip()

        periodo = ""

        if fecha_desde and fecha_hasta:
            periodo = f" entre {fecha_desde} y {fecha_hasta}"
        elif fecha_desde:
            periodo = f" desde {fecha_desde}"
        elif fecha_hasta:
            periodo = f" hasta {fecha_hasta}"

        sujeto = (
            f" para el código o búsqueda {query}"
            if query
            else ""
        )

        if count is not None:
            if count > 0:
                return (
                    f"Sí. Encontré {count} registro"
                    f"{'s' if count != 1 else ''} de ponches"
                    f"{sujeto}{periodo}."
                )

            return (
                f"No encontré registros de ponches"
                f"{sujeto}{periodo}."
            )

    if name == "search_employee":
        query = str(args.get("query") or "").strip()

        if count is not None:
            return (
                f"Encontré {count} resultado"
                f"{'s' if count != 1 else ''}"
                + (f" para {query}." if query else ".")
            )

    if name == "device_health" and isinstance(result, dict):
        offline = (
            result.get("offline")
            or result.get("offline_count")
            or result.get("relojes_offline")
        )

        online = (
            result.get("online")
            or result.get("online_count")
            or result.get("relojes_online")
        )

        if isinstance(offline, int) or isinstance(online, int):
            parts: list[str] = []

            if isinstance(online, int):
                parts.append(f"{online} en línea")

            if isinstance(offline, int):
                parts.append(f"{offline} fuera de línea")

            if parts:
                return "Estado de relojes: " + ", ".join(parts) + "."

    if count is not None:
        return (
            f"La herramienta {name} se ejecutó correctamente "
            f"y devolvió {count} registro"
            f"{'s' if count != 1 else ''}."
        )

    if isinstance(result, dict):
        message = (
            result.get("message")
            or result.get("respuesta")
            or result.get("detail")
        )

        if isinstance(message, str) and message.strip():
            return clean_user_text(message)

    return f"La herramienta {name} se ejecutó correctamente."


def compact_tool_result(
    value: Any,
    max_chars: int = 12000,
) -> str:
    try:
        text = json.dumps(
            value,
            ensure_ascii=False,
            default=str,
        )
    except Exception:
        text = str(value)

    if len(text) <= max_chars:
        return text

    return text[:max_chars] + "...[resultado truncado]"
