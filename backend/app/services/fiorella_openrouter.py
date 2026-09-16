# backend/app/services/fiorella_openrouter.py
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.services.fiorella_config import (
    AI_RETRIES,
    MODEL,
    get_client,
)
from app.services.fiorella_response_utils import clean_user_text
from app.services.fiorella_tool_registry import tool_definitions
from app.services.fiorella_tool_parser import strip_text_tool_calls

log = logging.getLogger("fiorella")


async def generate(
    messages: list[dict[str, Any]],
    use_tools: bool = True,
):
    client = get_client()

    if client is None:
        raise RuntimeError(
            "OPENROUTER_API_KEY no está configurada."
        )

    last_error: Exception | None = None

    for attempt in range(
        1,
        AI_RETRIES + 1,
    ):
        try:
            log.info(
                "Fiorella OpenRouter request model=%s attempt=%s/%s",
                MODEL,
                attempt,
                AI_RETRIES,
            )

            kwargs: dict[str, Any] = {
                "model": MODEL,
                "messages": messages,
                "temperature": 0.15,
            }

            if use_tools:
                kwargs["tools"] = tool_definitions()
                kwargs["tool_choice"] = "auto"

            response = await asyncio.to_thread(
                client.chat.completions.create,
                **kwargs,
            )

            log.info(
                "OpenRouter response model=%s choices=%s",
                getattr(response, "model", "unknown"),
                len(getattr(response, "choices", []) or []),
            )

            log.info(
                "Fiorella OpenRouter OK requested_model=%s actual_model=%s",
                MODEL,
                getattr(response, "model", "unknown"),
            )

            return response

        except Exception as exc:
            last_error = exc

            log.exception(
                "OpenRouter falló attempt=%s/%s error=%s",
                attempt,
                AI_RETRIES,
                exc,
            )

            if attempt < AI_RETRIES:
                await asyncio.sleep(
                    1.5 * attempt,
                )

    raise RuntimeError(
        "OpenRouter no respondió después "
        f"de {AI_RETRIES} intentos."
    ) from last_error


def parse_response(
    raw: str | None,
) -> dict[str, Any]:
    text = strip_text_tool_calls(
        raw or "",
    ).strip()

    if not text:
        return {
            "respuesta": (
                "La consulta se procesó, pero no recibí "
                "una respuesta utilizable."
            ),
            "animacion": "alert",
            "action": None,
        }

    if text.startswith("```"):
        lines = text.splitlines()

        if lines:
            lines = lines[1:]

        if (
            lines
            and lines[-1].strip().startswith("```")
        ):
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    if text.lower().startswith("json\n"):
        text = text[5:].strip()

    try:
        parsed = json.loads(text)

        if isinstance(parsed, dict):
            parsed["respuesta"] = clean_user_text(
                strip_text_tool_calls(
                    str(
                        parsed.get(
                            "respuesta",
                            "",
                        )
                    )
                )
            )

            if not parsed["respuesta"]:
                parsed["respuesta"] = (
                    "La solicitud fue procesada correctamente."
                )

            return parsed

    except Exception:
        pass

    return {
    "respuesta": clean_user_text(
        text
    ),
    "animacion": "point",
    "action": None,
}


def actual_model(
    response: Any,
) -> str:
    return str(
        getattr(
            response,
            "model",
            MODEL,
        )
    )
