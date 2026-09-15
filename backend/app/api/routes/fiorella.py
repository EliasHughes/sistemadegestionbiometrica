from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.deps import get_current_user, require_permission
from app.services.fiorella_audit import recent as recent_audit
from app.services.fiorella_memory import list_conversations
from app.services.fiorella_tools import confirm_action
from app.services.database import fetch_all


log = logging.getLogger("fiorella.routes")

router = APIRouter(tags=["fiorella"])


class ChatPayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    active_module: str = Field(default="/dashboard", max_length=200)
    conversation_id: int | None = None


def _gemini_api_key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


def _primary_model() -> str:
    return os.getenv("FIORELLA_MODEL", "gemini-3.8-flash").strip()


def _fallback_model() -> str:
    return os.getenv(
        "FIORELLA_FALLBACK_MODEL",
        "gemini-2.5-flash",
    ).strip()


def _load_genai():
    try:
        from google import genai
        from google.genai import types

        return genai, types

    except ImportError as exc:
        raise RuntimeError(
            "El paquete google-genai no está instalado. "
            "Ejecuta: python -m pip install google-genai"
        ) from exc


@router.post("/chat")
async def chat(
    payload: ChatPayload,
    user: dict = Depends(get_current_user),
):
    message = payload.message.strip()

    if not message:
        return JSONResponse(
            status_code=422,
            content={"detail": "El mensaje es obligatorio."},
        )

    try:
        from app.services.fiorella_agent_v3 import (
            procesar_mensaje_usuario,
        )

    except ModuleNotFoundError as exc:
        log.exception("Dependencia faltante en Fiorella.")

        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Fiorella no puede iniciar porque falta "
                    f"una dependencia: {exc}"
                )
            },
        )

    except Exception as exc:
        log.exception("No fue posible cargar fiorella_agent_v3.")

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Error cargando el agente de Fiorella: "
                    f"{exc}"
                )
            },
        )

    try:
        result = await procesar_mensaje_usuario(
            user=user,
            message=message,
            active_module=payload.active_module or "/dashboard",
            conversation_id=payload.conversation_id,
        )

        if not isinstance(result, dict):
            return JSONResponse(
                status_code=500,
                content={
                    "detail":
                        "El agente devolvió una respuesta inválida."
                },
            )

        return result

    except Exception as exc:
        log.exception("Error procesando chat de Fiorella.")

        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Fiorella no pudo completar la solicitud. "
                    f"Detalle: {exc}"
                )
            },
        )


@router.post("/confirm/{action_id}")
def confirm(
    action_id: str,
    user: dict = Depends(get_current_user),
):
    try:
        return confirm_action(
            user,
            action_id,
        )

    except Exception as exc:
        log.exception(
            "Error confirmando acción %s.",
            action_id,
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail":
                    f"No fue posible confirmar la acción: {exc}"
            },
        )


@router.get("/conversations")
def conversations(
    user: dict = Depends(get_current_user),
):
    uid = str(
        user.get("id")
        or user.get("username")
        or user.get("email")
        or "unknown"
    )

    try:
        return {
            "items":
                list_conversations(uid),
        }

    except Exception as exc:
        log.exception(
            "Error consultando conversaciones."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail":
                    f"Error consultando conversaciones: {exc}"
            },
        )


@router.get("/audit")
def audit_log(
    user: dict = Depends(
        require_permission("reports.read"),
    ),
):
    try:
        return {
            "items":
                recent_audit(100),
        }

    except Exception as exc:
        log.exception(
            "Error consultando auditoría."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail":
                    f"Error consultando auditoría: {exc}"
            },
        )


@router.get("/incidents")
def incidents(
    user: dict = Depends(get_current_user),
):
    try:
        rows = fetch_all(
            """
            SELECT TOP (100)
                id,
                fingerprint,
                severity,
                category,
                title,
                description,
                data_json,
                status,
                first_seen_at,
                last_seen_at,
                resolved_at
            FROM dbo.fiorella_incidents
            ORDER BY
                CASE severity
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    ELSE 4
                END,
                last_seen_at DESC
            """
        )

        return {
            "items":
                rows,
        }

    except Exception as exc:
        log.exception(
            "Error consultando incidentes."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail":
                    f"Error consultando incidentes: {exc}"
            },
        )


@router.post("/health-scan")
def health_scan(
    user: dict = Depends(
        require_permission("devices.read"),
    ),
):
    try:
        from app.services.fiorella_monitor import (
            run_health_scan,
        )

        return run_health_scan(
            user,
        )

    except Exception as exc:
        log.exception(
            "Error ejecutando health scan."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail":
                    f"Error ejecutando health scan: {exc}"
            },
        )


@router.get("/ai-health")
async def ai_health(
    user: dict = Depends(
        get_current_user,
    ),
):
    try:
        from openai import OpenAI

    except ImportError:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "provider": "openai",
                "detail":
                    "El paquete openai no está instalado.",
            },
        )

    api_key = os.getenv(
        "OPENAI_API_KEY",
        "",
    ).strip()

    if not api_key:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "provider": "openai",
                "detail":
                    "OPENAI_API_KEY no está configurada.",
            },
        )

    primary_model = os.getenv(
        "FIORELLA_MODEL",
        "gpt-5.6-luna",
    ).strip()

    fallback_model = os.getenv(
        "FIORELLA_FALLBACK_MODEL",
        "gpt-5.6-terra",
    ).strip()

    client = OpenAI(
        api_key=api_key,
    )

    results = []

    for model in (
        primary_model,
        fallback_model,
    ):
        if not model:
            continue

        try:
            response = await asyncio.to_thread(
                client.responses.create,
                model=model,
                input=(
                    "Responde únicamente con OK."
                ),
            )

            results.append(
                {
                    "model":
                        model,

                    "ok":
                        True,

                    "response":
                        response.output_text,
                }
            )

        except Exception as exc:
            log.exception(
                "OpenAI health falló model=%s",
                model,
            )

            results.append(
                {
                    "model":
                        model,

                    "ok":
                        False,

                    "error":
                        str(exc),
                }
            )

    return {
        "ok":
            any(
                item.get(
                    "ok",
                    False,
                )
                for item in results
            ),

        "provider":
            "openai",

        "models":
            results,
    }

@router.post("/analyze-image")
async def analyze_image(
    image: UploadFile = File(...),
    question: str = Form(
        "Analiza esta imagen y dime qué información "
        "relevante contiene."
    ),
    user: dict = Depends(get_current_user),
):
    api_key = _gemini_api_key()

    if not api_key:
        return JSONResponse(
            status_code=503,
            content={
                "detail":
                    "Gemini no está configurado."
            },
        )

    try:
        genai, types = _load_genai()

    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "detail":
                    str(exc)
            },
        )

    data = await image.read()

    if not data:
        return JSONResponse(
            status_code=400,
            content={
                "detail":
                    "La imagen está vacía."
            },
        )

    if len(data) > 10 * 1024 * 1024:
        return JSONResponse(
            status_code=413,
            content={
                "detail":
                    "Imagen demasiado grande. Máximo 10 MB."
            },
        )

    client = genai.Client(
        api_key=api_key,
    )

    mime_type = (
        image.content_type
        or "image/jpeg"
    )

    models = [
        _primary_model(),
        _fallback_model(),
    ]

    last_error: Exception | None = None

    for model in models:
        if not model:
            continue

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=[
                    types.Part.from_bytes(
                        data=data,
                        mime_type=mime_type,
                    ),
                    question,
                ],
            )

            return {
                "respuesta":
                    response.text
                    or "No pude analizar la imagen.",

                "animacion":
                    "point",

                "model_used":
                    model,
            }

        except Exception as exc:
            last_error = exc

            log.exception(
                "Falló análisis de imagen model=%s",
                model,
            )

    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "Gemini no pudo analizar la imagen. "
                f"Último error: {last_error}"
            )
        },
    )


@router.websocket("/live")
async def live(
    websocket: WebSocket,
):
    await websocket.accept()

    api_key = _gemini_api_key()

    model = os.getenv(
        "FIORELLA_LIVE_MODEL",
        "gemini-3.1-flash-live-preview",
    ).strip()

    if not api_key:
        await websocket.send_json(
            {
                "type": "error",
                "message":
                    "Gemini no está configurado.",
            }
        )

        await websocket.close()

        return

    try:
        genai, types = _load_genai()

    except Exception as exc:
        await websocket.send_json(
            {
                "type": "error",
                "message": str(exc),
            }
        )

        await websocket.close()

        return

    client = genai.Client(
        api_key=api_key,
    )

    try:
        async with client.aio.live.connect(
            model=model,
            config={
                "response_modalities": [
                    "AUDIO",
                ],
                "system_instruction": (
                    "Eres Fiorella, asistente virtual "
                    "del Sistema de Gestión Biométrica. "
                    "Habla siempre en español, de forma "
                    "profesional, clara y breve."
                ),
            },
        ) as session:

            while True:
                message = (
                    await websocket.receive_json()
                )

                kind = message.get(
                    "type"
                )

                if kind == "text":
                    text = str(
                        message.get("text")
                        or ""
                    ).strip()

                    if text:
                        await session.send_realtime_input(
                            text=text,
                        )

                elif kind == "audio":
                    encoded = message.get(
                        "data"
                    )

                    if not encoded:
                        continue

                    try:
                        raw = base64.b64decode(
                            encoded
                        )

                    except Exception:
                        await websocket.send_json(
                            {
                                "type": "error",
                                "message":
                                    "Audio inválido.",
                            }
                        )

                        continue

                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=raw,
                            mime_type=(
                                "audio/pcm;rate=16000"
                            ),
                        )
                    )

                elif kind == "close":
                    break

                async for response in (
                    session.receive()
                ):
                    content = getattr(
                        response,
                        "server_content",
                        None,
                    )

                    if not content:
                        continue

                    input_transcription = getattr(
                        content,
                        "input_transcription",
                        None,
                    )

                    if input_transcription:
                        await websocket.send_json(
                            {
                                "type":
                                    "input_transcript",

                                "text":
                                    input_transcription.text,
                            }
                        )

                    output_transcription = getattr(
                        content,
                        "output_transcription",
                        None,
                    )

                    if output_transcription:
                        await websocket.send_json(
                            {
                                "type":
                                    "output_transcript",

                                "text":
                                    output_transcription.text,
                            }
                        )

                    model_turn = getattr(
                        content,
                        "model_turn",
                        None,
                    )

                    if (
                        model_turn
                        and getattr(
                            model_turn,
                            "parts",
                            None,
                        )
                    ):
                        for part in (
                            model_turn.parts
                            or []
                        ):
                            inline_data = getattr(
                                part,
                                "inline_data",
                                None,
                            )

                            if (
                                inline_data
                                and inline_data.data
                            ):
                                await websocket.send_json(
                                    {
                                        "type":
                                            "audio",

                                        "mime_type":
                                            inline_data.mime_type,

                                        "data":
                                            base64.b64encode(
                                                inline_data.data
                                            ).decode(
                                                "ascii"
                                            ),
                                    }
                                )

                    if getattr(
                        content,
                        "turn_complete",
                        False,
                    ):
                        await websocket.send_json(
                            {
                                "type":
                                    "turn_complete",
                            }
                        )

    except WebSocketDisconnect:
        log.info(
            "WebSocket Fiorella desconectado."
        )

    except Exception as exc:
        log.exception(
            "Error en Gemini Live."
        )

        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "message": (
                        "Error en sesión de voz: "
                        f"{exc}"
                    ),
                }
            )

            await websocket.close()

        except Exception:
            pass