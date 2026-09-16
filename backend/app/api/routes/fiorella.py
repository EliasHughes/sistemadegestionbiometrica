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
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.deps import (
    get_current_user,
    require_permission,
)
from app.services.database import fetch_all
from app.services.fiorella_audit import (
    recent as recent_audit,
)
from app.services.fiorella_memory import (
    list_conversations,
)
from app.services.fiorella_tools import (
    confirm_action,
)

# ============================================================
# LOGGING
# ============================================================

log = logging.getLogger(
    "fiorella.routes",
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    tags=["fiorella"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class ChatPayload(BaseModel):

    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
    )

    active_module: str = Field(
        default="/dashboard",
        max_length=200,
    )

    conversation_id: int | None = None


# ============================================================
# OPENROUTER CONFIG
# ============================================================

def _openrouter_api_key() -> str:

    return os.getenv(
        "OPENROUTER_API_KEY",
        "",
    ).strip()


def _openrouter_base_url() -> str:

    return os.getenv(
        "OPENROUTER_BASE_URL",
        "https://openrouter.ai/api/v1",
    ).strip()


def _model() -> str:

    return os.getenv(
        "FIORELLA_MODEL",
        "openrouter/free",
    ).strip()


def _load_openrouter_client():

    try:

        from openai import OpenAI

    except ImportError as exc:

        raise RuntimeError(
            "El paquete openai no está instalado. "
            "Ejecuta: python -m pip install openai"
        ) from exc

    api_key = _openrouter_api_key()

    if not api_key:

        raise RuntimeError(
            "OPENROUTER_API_KEY no está configurada."
        )

    return OpenAI(
        api_key=api_key,
        base_url=_openrouter_base_url(),
        timeout=45,
        max_retries=0,
        default_headers={
            "X-Title":
                "Fiorella - Sistema Biometrico",
        },
    )


# ============================================================
# CHAT
# ============================================================

@router.post("/chat")
async def chat(
    payload: ChatPayload,
    user: dict = Depends(
        get_current_user,
    ),
):

    message = (
        payload.message.strip()
    )

    if not message:

        return JSONResponse(
            status_code=422,
            content={
                "detail":
                    "El mensaje es obligatorio."
            },
        )

    try:

        from app.services.fiorella_agent_v3 import (
            procesar_mensaje_usuario,
        )

    except Exception as exc:

        log.exception(
            "No fue posible cargar "
            "fiorella_agent_v3."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Error cargando el agente "
                    f"de Fiorella: {exc}"
                )
            },
        )

    try:

        result = (
            await procesar_mensaje_usuario(
                user=user,
                message=message,
                active_module=(
                    payload.active_module
                    or "/dashboard"
                ),
                conversation_id=(
                    payload.conversation_id
                ),
            )
        )

        if not isinstance(
            result,
            dict,
        ):

            return JSONResponse(
                status_code=500,
                content={
                    "detail": (
                        "El agente devolvió "
                        "una respuesta inválida."
                    )
                },
            )

        return result

    except Exception as exc:

        log.exception(
            "Error procesando chat "
            "de Fiorella."
        )

        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Fiorella no pudo completar "
                    f"la solicitud: {exc}"
                )
            },
        )


# ============================================================
# CONFIRMACIONES
# ============================================================

@router.post(
    "/confirm/{action_id}",
)
def confirm(
    action_id: str,
    user: dict = Depends(
        get_current_user,
    ),
):

    try:

        return confirm_action(
            user,
            action_id,
        )

    except Exception as exc:

        log.exception(
            "Error confirmando acción %s",
            action_id,
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "No fue posible confirmar "
                    f"la acción: {exc}"
                )
            },
        )


# ============================================================
# CONVERSACIONES
# ============================================================

@router.get("/conversations")
def conversations(
    user: dict = Depends(
        get_current_user,
    ),
):

    uid = str(
        user.get("id")
        or user.get("usuario_id")
        or user.get("username")
        or user.get("email")
        or "unknown"
    )

    try:

        return {
            "items":
                list_conversations(
                    uid,
                )
        }

    except Exception as exc:

        log.exception(
            "Error consultando "
            "conversaciones."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Error consultando "
                    f"conversaciones: {exc}"
                )
            },
        )


# ============================================================
# AUDITORÍA
# ============================================================

@router.get("/audit")
def audit_log(
    user: dict = Depends(
        require_permission(
            "reports.read",
        )
    ),
):

    try:

        return {
            "items":
                recent_audit(
                    100,
                )
        }

    except Exception as exc:

        log.exception(
            "Error consultando auditoría."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Error consultando "
                    f"auditoría: {exc}"
                )
            },
        )


# ============================================================
# INCIDENTES
# ============================================================

@router.get("/incidents")
def incidents(
    user: dict = Depends(
        get_current_user,
    ),
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
                rows
        }

    except Exception as exc:

        log.exception(
            "Error consultando incidentes."
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Error consultando "
                    f"incidentes: {exc}"
                )
            },
        )


# ============================================================
# HEALTH SCAN LOCAL
# ============================================================

@router.post("/health-scan")
def health_scan(
    user: dict = Depends(
        require_permission(
            "devices.read",
        )
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
                "detail": (
                    "Error ejecutando "
                    f"health scan: {exc}"
                )
            },
        )


# ============================================================
# OPENROUTER HEALTH
# ============================================================

@router.get("/ai-health")
async def ai_health(
    user: dict = Depends(
        get_current_user,
    ),
):

    try:

        client = (
            _load_openrouter_client()
        )

    except Exception as exc:

        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "provider":
                    "openrouter",
                "model":
                    _model(),
                "detail":
                    str(exc),
            },
        )

    try:

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=_model(),
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Responde únicamente "
                        "con la palabra OK."
                    ),
                }
            ],
            temperature=0,
        )

        if not response.choices:

            raise RuntimeError(
                "OpenRouter respondió "
                "sin choices."
            )

        text = (
            response
            .choices[0]
            .message
            .content
            or ""
        )

        return {
            "ok": True,
            "provider":
                "openrouter",
            "requested_model":
                _model(),
            "model_used":
                getattr(
                    response,
                    "model",
                    None,
                ),
            "response":
                text,
        }

    except Exception as exc:

        log.exception(
            "OpenRouter health falló."
        )

        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "provider":
                    "openrouter",
                "model":
                    _model(),
                "error":
                    str(exc),
            },
        )


# ============================================================
# ANÁLISIS DE IMAGEN CON OPENROUTER
# ============================================================

@router.post("/analyze-image")
async def analyze_image(
    image: UploadFile = File(...),
    question: str = Form(
        "Analiza esta imagen y dime "
        "qué información relevante contiene."
    ),
    user: dict = Depends(
        get_current_user,
    ),
):

    data = await image.read()

    if not data:

        return JSONResponse(
            status_code=400,
            content={
                "detail":
                    "La imagen está vacía."
            },
        )

    if len(data) > (
        10 * 1024 * 1024
    ):

        return JSONResponse(
            status_code=413,
            content={
                "detail": (
                    "Imagen demasiado grande. "
                    "Máximo 10 MB."
                )
            },
        )

    mime_type = (
        image.content_type
        or "image/jpeg"
    )

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }

    if mime_type not in (
        allowed_types
    ):

        return JSONResponse(
            status_code=415,
            content={
                "detail": (
                    "Tipo de imagen "
                    f"no soportado: {mime_type}"
                )
            },
        )

    try:

        client = (
            _load_openrouter_client()
        )

    except Exception as exc:

        return JSONResponse(
            status_code=503,
            content={
                "detail":
                    str(exc)
            },
        )

    encoded = (
        base64.b64encode(
            data,
        ).decode(
            "ascii"
        )
    )

    data_url = (
        f"data:{mime_type};"
        f"base64,{encoded}"
    )

    try:

        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=_model(),
            messages=[
                {
                    "role":
                        "system",

                    "content": (
                        "Eres Fiorella, asistente "
                        "del Sistema de Gestión "
                        "Biométrica. Analiza imágenes "
                        "de forma profesional y "
                        "responde siempre en español."
                    ),
                },
                {
                    "role":
                        "user",

                    "content": [
                        {
                            "type":
                                "text",

                            "text":
                                question,
                        },
                        {
                            "type":
                                "image_url",

                            "image_url": {
                                "url":
                                    data_url
                            },
                        },
                    ],
                },
            ],
            temperature=0.15,
        )

        if not response.choices:

            raise RuntimeError(
                "OpenRouter respondió "
                "sin choices."
            )

        answer = (
            response
            .choices[0]
            .message
            .content
            or ""
        )

        return {
            "respuesta":
                answer,

            "animacion":
                "point",

            "provider":
                "openrouter",

            "requested_model":
                _model(),

            "model_used":
                getattr(
                    response,
                    "model",
                    None,
                ),
        }

    except Exception as exc:

        log.exception(
            "Error analizando imagen "
            "con OpenRouter."
        )

        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "OpenRouter no pudo "
                    "analizar la imagen: "
                    f"{exc}"
                )
            },
        )


# ============================================================
# VOZ
# ============================================================

@router.websocket("/live")
async def live(
    websocket: WebSocket,
):

    """
    OpenRouter/free no proporciona actualmente
    una API de audio bidireccional equivalente
    al antiguo Gemini Live utilizado aquí.

    Conservamos el endpoint para no romper
    clientes existentes, pero informamos que
    temporalmente la voz está deshabilitada.
    """

    await websocket.accept()

    await websocket.send_json(
        {
            "type":
                "unavailable",

            "provider":
                "openrouter",

            "message": (
                "El chat de texto de Fiorella "
                "está disponible. "
                "La voz en tiempo real está "
                "temporalmente deshabilitada "
                "durante la migración a OpenRouter."
            ),
        }
    )

    await websocket.close(
        code=1000,
    )