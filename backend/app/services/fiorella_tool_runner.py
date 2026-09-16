# backend/app/services/fiorella_tool_runner.py
from __future__ import annotations

import json
import logging
from typing import Any

from app.services.fiorella_openrouter import generate
from app.services.fiorella_response_utils import (
    compact_tool_result,
    fallback_from_tool_results,
)
from app.services.fiorella_tool_parser import parse_text_tool_calls
from app.services.fiorella_tool_registry import (
    audit_tool_call,
    execute_tool,
)

log = logging.getLogger("fiorella")


def _safe_json_arguments(
    raw_arguments: str | None,
) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_arguments or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


async def run_native_tool_calls(
    *,
    assistant_message: Any,
    messages: list[dict[str, Any]],
    user: dict[str, Any],
    tools_used: list[str],
) -> tuple[str, Any]:
    tool_calls = assistant_message.tool_calls or []

    messages.append(
        assistant_message.model_dump(
            exclude_none=True,
        )
    )

    tool_results: list[dict[str, Any]] = []

    for call in tool_calls:
        name = str(call.function.name)
        args = _safe_json_arguments(
            call.function.arguments or "{}"
        )

        result = execute_tool(
            name,
            args,
            user,
        )

        tools_used.append(name)

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

        messages.append(
            {
                "role": "tool",
                "tool_call_id": call.id,
                "content": compact_tool_result(result),
            }
        )

    final_response = await generate(
        messages,
        use_tools=False,
    )

    if not final_response.choices:
        raise RuntimeError(
            "OpenRouter no devolvió respuesta después de tools."
        )

    raw = (
        final_response
        .choices[0]
        .message
        .content
        or ""
    ).strip()

    if not raw:
        raw = fallback_from_tool_results(
            tool_results,
        )

        log.warning(
            "OpenRouter devolvió content vacío después de tools; "
            "se utilizó respuesta determinista."
        )

    return raw, final_response


async def run_text_tool_calls(
    *,
    assistant_content: str,
    messages: list[dict[str, Any]],
    user: dict[str, Any],
    tools_used: list[str],
) -> tuple[str, Any]:
    text_calls = parse_text_tool_calls(
        assistant_content,
    )

    if not text_calls:
        raise RuntimeError(
            "Se solicitó fallback textual sin tool calls."
        )

    tool_results: list[dict[str, Any]] = []

    for call in text_calls:
        log.warning(
            "Fiorella recibió tool_call textual tool=%s args=%s",
            call.name,
            call.arguments,
        )

        result = execute_tool(
            call.name,
            call.arguments,
            user,
        )

        tools_used.append(call.name)

        audit_tool_call(
            user,
            call.name,
            call.arguments,
            result,
        )

        tool_results.append(
            {
                "tool": call.name,
                "arguments": call.arguments,
                "result": result,
            }
        )

    messages.append(
        {
            "role": "assistant",
            "content": (
                "Necesito consultar una herramienta interna "
                "antes de responder."
            ),
        }
    )

    messages.append(
        {
            "role": "user",
            "content": (
                "RESULTADO INTERNO DE HERRAMIENTAS.\n"
                "Estos datos provienen del backend y son la fuente "
                "de verdad para responder.\n"
                "No muestres etiquetas tool_call ni XML.\n\n"
                + compact_tool_result(
                    tool_results,
                )
            ),
        }
    )

    final_response = await generate(
        messages,
        use_tools=False,
    )

    if not final_response.choices:
        raise RuntimeError(
            "OpenRouter no devolvió respuesta "
            "después del fallback de tools."
        )

    raw = (
        final_response
        .choices[0]
        .message
        .content
        or ""
    ).strip()

    if not raw:
        raw = fallback_from_tool_results(
            tool_results,
        )

        log.warning(
            "OpenRouter devolvió content vacío después del "
            "fallback textual; se utilizó respuesta determinista."
        )

    return raw, final_response
