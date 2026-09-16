from __future__ import annotations

import json
import re
from typing import Any


_BOLD_RE = re.compile(
    r"\*\*(.*?)\*\*",
    re.DOTALL,
)

_CODE_RE = re.compile(
    r"`([^`]+)`",
)


def clean_user_text(
    text: str | None,
) -> str:
    """
    Limpia formato que el chat actual no renderiza correctamente.
    """

    value = (
        text
        or ""
    ).strip()

    if not value:
        return ""

    value = _BOLD_RE.sub(
        r"\1",
        value,
    )

    value = _CODE_RE.sub(
        r"\1",
        value,
    )

    return value.strip()


def _extract_count(
    result: Any,
) -> int | None:
    """
    Intenta localizar el total independientemente de cómo
    la tool haya estructurado el resultado.
    """

    if not isinstance(
        result,
        dict,
    ):
        return None

    possible_keys = (
        "count",
        "total",
        "cantidad",
        "total_registros",
        "records",
    )

    for key in possible_keys:

        value = result.get(
            key
        )

        if isinstance(
            value,
            bool,
        ):
            continue

        if isinstance(
            value,
            int,
        ):
            return value

        if (
            isinstance(
                value,
                str,
            )
            and value.isdigit()
        ):
            return int(
                value
            )

    list_keys = (
        "items",
        "data",
        "rows",
        "resultados",
        "records_data",
    )

    for key in list_keys:

        value = result.get(
            key
        )

        if isinstance(
            value,
            list,
        ):
            return len(
                value
            )

    return None


def _result_ok(
    result: Any,
) -> bool:

    if not isinstance(
        result,
        dict,
    ):
        return True

    if "ok" in result:
        return bool(
            result.get(
                "ok"
            )
        )

    return not bool(
        result.get(
            "error"
        )
    )


def fallback_from_tool_results(
    tool_results: list[
        dict[str, Any]
    ],
) -> str:
    """
    Genera una respuesta determinista basada en datos reales
    cuando OpenRouter devuelve content vacío.
    """

    if not tool_results:

        return (
            "La consulta se procesó, "
            "pero no recibí datos suficientes."
        )

    last = tool_results[-1]

    tool_name = str(
        last.get(
            "tool"
        )
        or last.get(
            "name"
        )
        or "herramienta"
    )

    arguments = (
        last.get(
            "arguments"
        )
        or {}
    )

    result = last.get(
        "result"
    )


    # =========================================================
    # ERROR DE TOOL
    # =========================================================

    if not _result_ok(
        result
    ):

        error = None

        if isinstance(
            result,
            dict,
        ):
            error = result.get(
                "error"
            )

        return (
            f"No pude completar la operación "
            f"con {tool_name}."
            + (
                f" Detalle: {error}"
                if error
                else ""
            )
        )


    # =========================================================
    # TOTAL
    # =========================================================

    count = _extract_count(
        result
    )


    # =========================================================
    # SEARCH PUNCHES
    # =========================================================

    if tool_name == "search_punches":

        query = str(
            arguments.get(
                "query"
            )
            or ""
        ).strip()

        fecha_desde = str(
            arguments.get(
                "fecha_desde"
            )
            or ""
        ).strip()

        fecha_hasta = str(
            arguments.get(
                "fecha_hasta"
            )
            or ""
        ).strip()


        sujeto = ""

        if query:

            sujeto = (
                f" para el código "
                f"o búsqueda {query}"
            )


        periodo = ""

        if (
            fecha_desde
            and fecha_hasta
        ):

            if (
                fecha_desde
                == fecha_hasta
            ):

                periodo = (
                    f" del día "
                    f"{fecha_desde}"
                )

            else:

                periodo = (
                    f" entre "
                    f"{fecha_desde} "
                    f"y {fecha_hasta}"
                )


        if count is not None:

            if count == 0:

                return (
                    "No encontré registros "
                    f"de ponches{sujeto}"
                    f"{periodo}."
                )

            return (
                f"Encontré {count} "
                f"registro"
                f"{'s' if count != 1 else ''} "
                f"de ponches"
                f"{sujeto}"
                f"{periodo}."
            )


    # =========================================================
    # SEARCH EMPLOYEE
    # =========================================================

    if tool_name == "search_employee":

        query = str(
            arguments.get(
                "query"
            )
            or ""
        ).strip()

        if count is not None:

            return (
                f"Encontré {count} resultado"
                f"{'s' if count != 1 else ''}"
                + (
                    f" para {query}."
                    if query
                    else "."
                )
            )


    # =========================================================
    # DEVICE HEALTH
    # =========================================================

    if (
        tool_name
        == "device_health"
        and isinstance(
            result,
            dict,
        )
    ):

        online = (
            result.get(
                "online"
            )
            or result.get(
                "online_count"
            )
            or result.get(
                "relojes_online"
            )
        )

        offline = (
            result.get(
                "offline"
            )
            or result.get(
                "offline_count"
            )
            or result.get(
                "relojes_offline"
            )
        )


        parts: list[str] = []

        if isinstance(
            online,
            int,
        ):

            parts.append(
                f"{online} en línea"
            )

        if isinstance(
            offline,
            int,
        ):

            parts.append(
                f"{offline} fuera de línea"
            )

        if parts:

            return (
                "Estado actual de los relojes: "
                + ", ".join(
                    parts
                )
                + "."
            )


    # =========================================================
    # RESPUESTA PROPORCIONADA POR LA TOOL
    # =========================================================

    if isinstance(
        result,
        dict,
    ):

        for key in (
            "message",
            "respuesta",
            "detail",
        ):

            value = result.get(
                key
            )

            if (
                isinstance(
                    value,
                    str,
                )
                and value.strip()
            ):

                return clean_user_text(
                    value
                )


    # =========================================================
    # FALLBACK FINAL
    # =========================================================

    if count is not None:

        return (
            f"La operación {tool_name} "
            f"devolvió {count} registro"
            f"{'s' if count != 1 else ''}."
        )

    return (
        f"La herramienta {tool_name} "
        "se ejecutó correctamente."
    )


def compact_tool_result(
    value: Any,
    max_chars: int = 12000,
) -> str:
    """
    Evita enviar resultados gigantes a OpenRouter.
    """

    try:

        text = json.dumps(
            value,
            ensure_ascii=False,
            default=str,
        )

    except Exception:

        text = str(
            value
        )

    if len(
        text
    ) <= max_chars:

        return text

    return (
        text[
            :max_chars
        ]
        + "...[resultado truncado]"
    )