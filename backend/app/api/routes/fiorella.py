from __future__ import annotations

import base64
import os

from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types

from app.core.deps import get_current_user, require_permission
from app.services.fiorella_agent_v3 import procesar_mensaje_usuario
from app.services.fiorella_audit import recent as recent_audit
from app.services.fiorella_memory import list_conversations
from app.services.fiorella_tools import confirm_action
from app.services.database import fetch_all


router = APIRouter(tags=["fiorella"])


@router.post("/chat")
async def chat(
    payload: dict,
    user: dict = Depends(get_current_user),
):
    message = str(payload.get("message") or "").strip()
    if not message:
        return JSONResponse(status_code=422, content={"detail": "message requerido"})

    return await procesar_mensaje_usuario(
        user=user,
        message=message,
        active_module=str(payload.get("active_module") or "/dashboard"),
        conversation_id=payload.get("conversation_id"),
    )


@router.post("/confirm/{action_id}")
def confirm(action_id: str, user: dict = Depends(get_current_user)):
    return confirm_action(user, action_id)


@router.get("/conversations")
def conversations(user: dict = Depends(get_current_user)):
    uid = str(user.get("id") or user.get("username") or user.get("email"))
    return {"items": list_conversations(uid)}


@router.get("/audit")
def audit_log(user: dict = Depends(require_permission("reports.read"))):
    return {"items": recent_audit(100)}


@router.get("/incidents")
def incidents(user: dict = Depends(get_current_user)):
    if not any(
        str(user.get("role", "")).lower() in {"admin", "super_admin"}
        for _ in [0]
    ) and not require_permission:
        pass
    rows = fetch_all(
        """
        SELECT TOP (100)
          id,fingerprint,severity,category,title,description,
          data_json,status,first_seen_at,last_seen_at,resolved_at
        FROM dbo.fiorella_incidents
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                       WHEN 'medium' THEN 3 ELSE 4 END,
          last_seen_at DESC
        """
    )
    return {"items": rows}


@router.post("/health-scan")
def health_scan(user: dict = Depends(require_permission("devices.read"))):
    from app.services.fiorella_monitor import run_health_scan
    return run_health_scan(user)


@router.post("/analyze-image")
async def analyze_image(
    image: UploadFile = File(...),
    question: str = Form("Analiza esta imagen y dime qué información relevante contiene."),
    user: dict = Depends(get_current_user),
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return JSONResponse(status_code=503, content={"detail": "Gemini no configurado"})

    data = await image.read()
    if len(data) > 10 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"detail": "Imagen demasiado grande"})

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=os.getenv("FIORELLA_MODEL", "gemini-3.8-flash"),
        contents=[
            types.Part.from_bytes(data=data, mime_type=image.content_type or "image/jpeg"),
            question,
        ],
    )
    return {
        "respuesta": response.text or "No pude analizar la imagen.",
        "animacion": "point",
    }


@router.websocket("/live")
async def live(websocket: WebSocket):
    # La autenticación de producción debe hacerse antes de aceptar la conexión
    # usando el mismo JWT que utiliza la aplicación. No se acepta API key del cliente.
    await websocket.accept()

    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("FIORELLA_LIVE_MODEL", "gemini-3.1-flash-live-preview")
    if not api_key:
        await websocket.send_json({"type": "error", "message": "Gemini no configurado"})
        await websocket.close()
        return

    client = genai.Client(api_key=api_key)

    try:
        async with client.aio.live.connect(
            model=model,
            config={
                "response_modalities": ["AUDIO"],
                "system_instruction": (
                    "Eres Fiorella, asistente virtual profesional del sistema "
                    "biométrico. Habla en español, sé breve y servicial."
                ),
            },
        ) as session:

            while True:
                message = await websocket.receive_json()
                kind = message.get("type")

                if kind == "text":
                    await session.send_realtime_input(text=str(message.get("text") or ""))

                elif kind == "audio":
                    raw = base64.b64decode(message.get("data") or "")
                    await session.send_realtime_input(
                        audio=types.Blob(data=raw, mime_type="audio/pcm;rate=16000")
                    )

                elif kind == "close":
                    break

                async for response in session.receive():
                    content = response.server_content
                    if content:
                        if content.input_transcription:
                            await websocket.send_json({
                                "type": "input_transcript",
                                "text": content.input_transcription.text,
                            })
                        if content.output_transcription:
                            await websocket.send_json({
                                "type": "output_transcript",
                                "text": content.output_transcription.text,
                            })
                        for part in content.model_turn.parts or []:
                            if getattr(part, "inline_data", None):
                                audio = part.inline_data.data
                                await websocket.send_json({
                                    "type": "audio",
                                    "mime_type": part.inline_data.mime_type,
                                    "data": base64.b64encode(audio).decode("ascii"),
                                })
                        if content.turn_complete:
                            await websocket.send_json({"type": "turn_complete"})

    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": "Error en sesión de voz"})
            await websocket.close()
        except Exception:
            pass
