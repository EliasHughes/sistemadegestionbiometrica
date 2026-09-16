from __future__ import annotations

import json
import logging
from typing import Any

from app.services.fiorella_openrouter import (
    generate,
)

from app.services.fiorella_response_utils import (
    compact_tool_result,
    fallback_from_tool_results,
)

from app.services.fiorella_time import (
    apply_temporal_args,
)

from app.services.fiorella_tool_parser import (
    parse_text_tool_calls,
)

from app.services.fiorella_tool_registry import (
    audit_tool_call,
    execute_tool,
)


log = logging.getLogger(
    "fiorella"
)


# ============================================================
# JSON ARGUMENTS
# ============================================================

def _safe_json_arguments(
    raw_arguments: str | None,
) -> dict[str, Any]:

    try:

        parsed = json.loads(
            raw_arguments
            or "{}"
        )

        if isinstance(
            parsed,
            dict,
        ):
            return parsed

    except Exception:
        pass

    return {}


# ============================================================
# TOOL CALL NATIVO
# ============================================================

async def run_native_tool_calls(
    *,
    assistant_message: Any,
    messages: list[
        dict[str, Any]
    ],
    user: dict[
        str,
        Any,
    ],
    tools_used: list[str],
    user_message: str,
) -> tuple[
    str,
    Any,
    dict[str, Any] | None,
]:

    tool_calls = (
        assistant_message.tool_calls
        or []
    )


    # Guardamos la llamada original
    messages.append(
        assistant_message.model_dump(
            exclude_none=True,
        )
    )


    tool_results: list[
        dict[str, Any]
    ] = []

    backend_action: dict[str, Any] | None = None


    for call in tool_calls:

        name = str(
            call.function.name
        )


        args = (
            _safe_json_arguments(
                call.function.arguments
                or "{}"
            )
        )


        # =====================================================
        # NORMALIZACIÓN TEMPORAL
        # =====================================================

        args = apply_temporal_args(
            name,
            args,
            user_message,
        )


        log.info(
            "Fiorella tool normalizada "
            "tool=%s args=%s",
            name,
            args,
        )


        # =====================================================
        # EJECUTAR
        # =====================================================

        result = execute_tool(
            name,
            args,
            user,
        )

        if (
         isinstance(result, dict)
         and isinstance(result.get("action"), dict)
            ):
            backend_action = result["action"]


        tools_used.append(
            name
        )


        audit_tool_call(
            user,
            name,
            args,
            result,
        )


        tool_results.append(
            {
                "tool": name,
                "arguments": args,
                "result": result,
            }
        )


        # =====================================================
        # RESPUESTA PARA OPENROUTER
        # =====================================================

        messages.append(
            {
                "role": "tool",
                "tool_call_id": (
                    call.id
                ),
                "content": (
                    compact_tool_result(
                        result
                    )
                ),
            }
        )


    # =========================================================
    # SEGUNDA LLAMADA AL MODELO
    # =========================================================

    final_response = (
        await generate(
            messages,
            use_tools=False,
        )
    )


    if not final_response.choices:

        # Tenemos resultado real:
        # no debemos fallar solo porque el LLM no respondió.

        fallback = (
            fallback_from_tool_results(
                tool_results
            )
        )

        return (
            fallback,
            final_response,
            backend_action,
        )


    raw = (
        final_response
        .choices[0]
        .message
        .content
        or ""
    ).strip()


    # =========================================================
    # MODELO RESPONDIÓ VACÍO
    # =========================================================

    if not raw:

        raw = (
            fallback_from_tool_results(
                tool_results
            )
        )


        log.warning(
            "OpenRouter respondió content vacío "
            "después de tools. "
            "Usando respuesta determinista."
        )


    return raw, final_response, backend_action


# ============================================================
# TOOL CALL TEXTUAL
# ============================================================

async def run_text_tool_calls(
    *,
    assistant_content: str,
    messages: list[
        dict[str, Any]
    ],
    user: dict[
        str,
        Any,
    ],
    tools_used: list[str],
    user_message: str,
) -> tuple[
    str,
    Any,
    dict[str, Any] | None,
]:

    text_calls = (
        parse_text_tool_calls(
            assistant_content
        )
    )


    if not text_calls:

        raise RuntimeError(
            "Fallback textual invocado "
            "sin tool calls."
        )


    tool_results: list[
        dict[str, Any]
    ] = []

    backend_action: dict[str, Any] | None = None


    for call in text_calls:

        args = apply_temporal_args(
            call.name,
            call.arguments,
            user_message,
        )


        log.warning(
            "Tool textual detectada "
            "tool=%s args=%s",
            call.name,
            args,
        )


        result = execute_tool(
            call.name,
            args,
            user,
        )

        if (
            isinstance(result, dict)
            and isinstance(result.get("action"), dict)
        ):
            backend_action = result["action"]


        tools_used.append(
            call.name
        )


        audit_tool_call(
            user,
            call.name,
            args,
            result,
        )


        tool_results.append(
            {
                "tool": (
                    call.name
                ),
                "arguments": args,
                "result": result,
            }
        )


    # =========================================================
    # CONTEXTO INTERNO
    # =========================================================

    messages.append(
        {
            "role": "assistant",
            "content": (
                "Necesito consultar datos "
                "internos antes de responder."
            ),
        }
    )


    messages.append(
        {
            "role": "user",
            "content": (
                "RESULTADO INTERNO DE HERRAMIENTAS.\n"
                "Estos datos vienen del backend "
                "y son la fuente de verdad.\n"
                "No muestres XML ni tool_call.\n\n"
                + compact_tool_result(
                    tool_results
                )
            ),
        }
    )


    final_response = (
        await generate(
            messages,
            use_tools=False,
        )
    )


    if not final_response.choices:

        return (
            fallback_from_tool_results(
                tool_results
            ),
            final_response,
            backend_action,
        )


    raw = (
        final_response
        .choices[0]
        .message
        .content
        or ""
    ).strip()


    if not raw:

        raw = (
            fallback_from_tool_results(
                tool_results
            )
        )


        log.warning(
            "OpenRouter devolvió content vacío "
            "después de tool textual."
        )


    return (
        raw,
        final_response,
        backend_action,
    )