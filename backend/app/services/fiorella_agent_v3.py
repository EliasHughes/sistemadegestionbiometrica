from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.services.fiorella_audit import audit
from app.services.fiorella_memory import get_or_create_conversation, load_history, save_message
from app.services import fiorella_tools as tools

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("FIORELLA_MODEL", "gemini-3.8-flash")
MAX_HISTORY = int(os.getenv("FIORELLA_MAX_HISTORY", "20"))

client = genai.Client(api_key=API_KEY) if API_KEY else None


SYSTEM_PROMPT = """
Eres Fiorella, la asistente virtual oficial del Sistema de Gestión Biométrica.

Eres un agente, no un chatbot pasivo.

CAPACIDADES:
- consultar información real del sistema;
- analizar métricas;
- explicar módulos;
- generar/preparar reportes;
- navegar la aplicación;
- consultar relojes ZKTeco;
- preparar acciones ZKTeco con confirmación;
- usar la base de conocimiento;
- trabajar con imágenes/documentos cuando se proporcionen.

REGLAS:
1. Responde en español.
2. Nunca inventes datos internos.
3. Para datos internos utiliza herramientas.
4. Nunca ejecutes SQL generado por el modelo.
5. Nunca reveles contraseñas, tokens, API keys, hashes ni secretos.
6. Una acción ZKTeco de escritura/borrado SIEMPRE requiere preview y confirmación.
7. Respeta permisos del usuario.
8. Si no tienes información suficiente, dilo.
9. Para preguntas sobre el uso de la aplicación, usa la Knowledge Base cuando esté disponible.
10. Cuando corresponda, devuelve una acción de UI además del texto.

Respuesta obligatoria:
{
  "respuesta": "texto",
  "animacion": "idle|point|walk|jump|think|alert",
  "action": null o {
      "type": "navigate|download_report|show_chart|confirm_action",
      "..."
  }
}
"""


def _user_key(user: dict[str, Any]) -> str:
    return str(user.get("id") or user.get("username") or user.get("email") or "unknown")


def _declarations():
    return [
        {
            "name": "punch_summary",
            "description": "Resumen de ponches de hoy.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "search_employee",
            "description": "Busca un empleado por nombre o código.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "search_punches",
            "description": "Consulta ponches por rango de fechas, reloj y empleado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fecha_desde": {"type": "string"},
                    "fecha_hasta": {"type": "string"},
                    "dispositivo": {"type": "string"},
                    "query": {"type": "string"},
                    "limit": {"type": "integer"},
                },
            },
        },
        {
            "name": "device_health",
            "description": "Consulta el estado operativo de los relojes.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "data_analysis",
            "description": "Analiza tendencias de ponches de los últimos días.",
            "parameters": {
                "type": "object",
                "properties": {"days": {"type": "integer"}},
            },
        },
        {
            "name": "navigate_to_module",
            "description": "Navega el frontend a un módulo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "module": {"type": "string"},
                },
                "required": ["module"],
            },
        },
        {
            "name": "zkteco_push_employee",
            "description": "Prepara sincronización de un colaborador a relojes. Nunca ejecuta directamente.",
            "parameters": {
                "type": "object",
                "properties": {
                    "codigo": {"type": "string"},
                    "dispositivos": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["codigo", "dispositivos"],
            },
        },
        {
            "name": "zkteco_clone_employee",
            "description": "Prepara clonación de un colaborador desde un reloj hacia otros.",
            "parameters": {
                "type": "object",
                "properties": {
                    "codigo": {"type": "string"},
                    "from_device": {"type": "string"},
                    "to_devices": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["codigo", "from_device", "to_devices"],
            },
        },
        {
            "name": "zkteco_delete_employee",
            "description": "Prepara eliminación de un colaborador de relojes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "codigo": {"type": "string"},
                    "dispositivos": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["codigo", "dispositivos"],
            },
        },
    ]


def _execute(name: str, args: dict[str, Any], user: dict[str, Any]):
    if name == "punch_summary":
        return tools.tool_punch_summary(user)
    if name == "search_employee":
        return tools.tool_search_employee(user, **args)
    if name == "search_punches":
        return tools.tool_search_punches(user, **args)
    if name == "device_health":
        return tools.tool_device_health(user)
    if name == "data_analysis":
        return tools.tool_data_analysis(user, **args)
    if name == "navigate_to_module":
        return tools.tool_navigation(user, **args)
    if name.startswith("zkteco_"):
        return tools.execute_zkteco_action(user, name, args)
    return {"ok": False, "error": "Herramienta desconocida."}


async def procesar_mensaje_usuario(
    user: dict[str, Any],
    message: str,
    active_module: str = "/dashboard",
    conversation_id: int | None = None,
) -> dict[str, Any]:
    if not client:
        return {
            "respuesta": "Fiorella no está configurada. Define GEMINI_API_KEY en el backend.",
            "animacion": "alert",
            "action": None,
        }

    uid = _user_key(user)
    conversation_id = get_or_create_conversation(uid, conversation_id, active_module)
    history = load_history(conversation_id, uid, MAX_HISTORY)
    save_message(conversation_id, uid, "user", message)

    contents = [
        {"role": h["role"], "parts": [{"text": h["content"]}]}
        for h in history
    ]
    contents.append({
        "role": "user",
        "parts": [{
            "text": (
                f"Usuario autenticado: {user.get('name') or user.get('username')}\n"
                f"Rol: {user.get('role')}\n"
                f"Módulo: {active_module}\n"
                f"Consulta: {message}"
            )
        }],
    })

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=[types.Tool(function_declarations=_declarations())],
                temperature=0.15,
            ),
        )

        calls = []
        for candidate in response.candidates or []:
            for part in candidate.content.parts or []:
                if getattr(part, "function_call", None):
                    calls.append(part.function_call)

        executed = []
        if calls:
            function_parts = []
            for call in calls:
                result = _execute(call.name, dict(call.args or {}), user)
                executed.append(call.name)
                audit(user, "tool_call", call.name, "ok" if result.get("ok", False) else "denied", dict(call.args or {}), result)
                function_parts.append(
                    types.Part.from_function_response(
                        name=call.name,
                        response=result,
                    )
                )

            response2 = client.models.generate_content(
                model=MODEL,
                contents=[
                    *contents,
                    response.candidates[0].content,
                    types.Content(role="user", parts=function_parts),
                ],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.15,
                    response_mime_type="application/json",
                ),
            )
            raw = response2.text or "{}"
        else:
            raw = response.text or "{}"

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {
                "respuesta": raw,
                "animacion": "idle",
                "action": None,
            }

        result = {
            "respuesta": parsed.get("respuesta", "Entendido."),
            "animacion": parsed.get("animacion", "point"),
            "action": parsed.get("action"),
            "conversation_id": conversation_id,
            "tools_used": executed,
        }
        save_message(conversation_id, uid, "assistant", result["respuesta"], executed[0] if executed else None, result)
        return result

    except Exception:
        audit(user, "chat", None, "error", {"message": message, "module": active_module}, None)
        return {
            "respuesta": "No pude completar la solicitud en este momento. Verifica la configuración de Gemini y la conexión del backend.",
            "animacion": "alert",
            "action": None,
            "conversation_id": conversation_id,
        }


procesar_mensaje_usuario_v3 = procesar_mensaje_usuario
