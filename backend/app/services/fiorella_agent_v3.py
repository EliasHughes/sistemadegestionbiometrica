# backend/app/services/fiorella_agent_v3.py
from __future__ import annotations

import logging
from typing import Any

from app.services.fiorella_audit import audit
from app.services.fiorella_config import (
    MAX_HISTORY,
    MODEL,
    development_mode,
    get_client,
)
from app.services.fiorella_memory import (
    get_or_create_conversation,
    load_history,
    save_message,
)
from app.services.fiorella_openrouter import (
    actual_model,
    generate,
    parse_response,
)
from app.services.fiorella_prompt import (
    SYSTEM_PROMPT,
    build_context_message,
)
from app.services.fiorella_tool_parser import (
    parse_text_tool_calls,
)
from app.services.fiorella_tool_runner import (
    run_native_tool_calls,
    run_text_tool_calls,
)

log = logging.getLogger("fiorella")


def _user_key(
    user: dict[str, Any],
) -> str:
    return str(
        user.get("id")
        or user.get("usuario_id")
        or user.get("username")
        or user.get("email")
        or "unknown"
    )


def _history_messages(
    history: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []

    for item in history:
        role = str(
            item.get(
                "role",
                "user",
            )
        )

        if role not in {
            "user",
            "assistant",
        }:
            continue

        content = str(
            item.get(
                "content",
                "",
            )
        ).strip()

        if content:
            messages.append(
                {
                    "role": role,
                    "content": content,
                }
            )

    return messages


async def procesar_mensaje_usuario(
    user: dict[str, Any],
    message: str,
    active_module: str = "/dashboard",
    conversation_id: int | None = None,
) -> dict[str, Any]:
    """
    Orquestador principal.

    El detalle de configuración, prompt, OpenRouter,
    definición/ejecución de tools y parsing vive
    en módulos separados.
    """

    if get_client() is None:
        return {
            "respuesta": (
                "Fiorella no tiene configurada "
                "la API de OpenRouter."
            ),
            "animacion": "alert",
            "action": None,
            "conversation_id": conversation_id,
            "tools_used": [],
            "provider": "openrouter",
        }

    uid = _user_key(
        user,
    )

    conversation_id = (
        get_or_create_conversation(
            uid,
            conversation_id,
            active_module,
        )
    )

    history = load_history(
        conversation_id,
        uid,
        MAX_HISTORY,
    )

    save_message(
        conversation_id,
        uid,
        "user",
        message,
    )

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        },
        *_history_messages(
            history,
        ),
        {
            "role": "user",
            "content": build_context_message(
                user,
                message,
                active_module,
            ),
        },
    ]

    tools_used: list[str] = []

    try:
        response = await generate(
            messages,
            use_tools=True,
        )

        if not response.choices:
            raise RuntimeError(
                "OpenRouter no devolvió choices."
            )

        assistant_message = (
            response.choices[0].message
        )

        native_calls = (
            getattr(
                assistant_message,
                "tool_calls",
                None,
            )
            or []
        )

        assistant_content = str(
            getattr(
                assistant_message,
                "content",
                "",
            )
            or ""
        )

        log.info(
            "Fiorella assistant response: "
            "content=%r tool_calls=%s",
            assistant_content,
            len(native_calls),
        )
        
        tool_action = None
        if native_calls:
            raw, final_response, tool_action = (
                await run_native_tool_calls(
                assistant_message=assistant_message,
                messages=messages,
                user=user,
                tools_used=tools_used,
                user_message=message,
            )
        )

            used_model = actual_model(
                final_response,
            )

        else:
            text_calls = parse_text_tool_calls(
                assistant_content,
            )

            if text_calls:
                raw, final_response, tool_action = (
                    await run_text_tool_calls(
                        assistant_content=assistant_content,
                        messages=messages,
                        user=user,
                        tools_used=tools_used,
                        user_message=message,
                    )
                )

                used_model = actual_model(
                    final_response,
                )

            else:
                raw = assistant_content
                used_model = actual_model(
                    response,
                )

        parsed = parse_response(
            raw,
        )

        result = {
            "respuesta": str(
                parsed.get(
                    "respuesta",
                    "Entendido.",
                )
            ),
            "animacion": str(
                parsed.get(
                    "animacion",
                    "point",
                )
            ),
            "action": (
                tool_action
                or parsed.get(
                    "action",
                )
            ),
            "conversation_id": conversation_id,
            "tools_used": tools_used,
            "provider": "openrouter",
            "requested_model": MODEL,
            "model_used": used_model,
        }

        save_message(
            conversation_id,
            uid,
            "assistant",
            result["respuesta"],
            (
                tools_used[0]
                if tools_used
                else None
            ),
            result,
        )

        try:
            audit(
                user,
                "chat",
                None,
                "ok",
                {
                    "message": message,
                    "module": active_module,
                },
                {
                    "provider": "openrouter",
                    "model": used_model,
                    "tools": tools_used,
                },
            )
        except Exception:
            log.exception(
                "No se pudo registrar auditoría del chat."
            )

        return result

    except Exception as exc:
        log.exception(
            "Fiorella OpenRouter FAILED: %s",
            exc,
        )

        try:
            audit(
                user,
                "chat",
                None,
                "error",
                {
                    "message": message,
                    "module": active_module,
                },
                {
                    "provider": "openrouter",
                    "error": str(exc),
                },
            )
        except Exception:
            log.exception(
                "No se pudo guardar auditoría del error."
            )

        return {
            "respuesta": (
                "No pude conectar con el servicio "
                "de inteligencia artificial en este momento. "
                "El sistema biométrico continúa operativo."
            ),
            "animacion": "alert",
            "action": None,
            "conversation_id": conversation_id,
            "tools_used": tools_used,
            "provider": "openrouter",
            "error": (
                str(exc)
                if development_mode()
                else None
            ),
        }


procesar_mensaje_usuario_v3 = procesar_mensaje_usuario
