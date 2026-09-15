from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.services.fiorella_audit import audit
from app.services.fiorella_memory import (
    get_or_create_conversation,
    load_history,
    save_message,
)
from app.services import fiorella_tools as tools


# ============================================================
# CONFIGURACIÓN
# ============================================================

load_dotenv()

log = logging.getLogger("fiorella")


API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

PRIMARY_MODEL = os.getenv(
    "FIORELLA_MODEL",
    "gemini-3.8-flash",
).strip()

FALLBACK_MODEL = os.getenv(
    "FIORELLA_FALLBACK_MODEL",
    "gemini-2.5-flash",
).strip()

MAX_HISTORY = int(
    os.getenv(
        "FIORELLA_MAX_HISTORY",
        "20",
    )
)

GEMINI_RETRIES = max(
    1,
    int(
        os.getenv(
            "FIORELLA_GEMINI_RETRIES",
            "2",
        )
    ),
)


# ============================================================
# CLIENTE
# ============================================================

client: genai.Client | None = None


def get_client() -> genai.Client | None:
    """
    Crea el cliente Gemini de forma perezosa.

    Esto evita dejar una API key capturada incorrectamente
    durante el import si .env todavía no estaba cargado.
    """

    global client

    if client is not None:
        return client

    api_key = os.getenv(
        "GEMINI_API_KEY",
        "",
    ).strip()

    if not api_key:
        return None

    client = genai.Client(
        api_key=api_key,
    )

    return client


# ============================================================
# PROMPT PRINCIPAL
# ============================================================

SYSTEM_PROMPT = """
Eres Fiorella, la asistente virtual oficial del Sistema de Gestión Biométrica.

Tu función es ayudar a los usuarios autenticados a trabajar con los datos
reales y funcionalidades disponibles en el sistema.

CAPACIDADES:

- consultar información real del sistema;
- consultar resumen de ponches;
- consultar empleados;
- consultar relojes biométricos;
- consultar salud de dispositivos;
- analizar métricas;
- explicar los módulos de la aplicación;
- analizar tendencias;
- navegar a módulos;
- preparar operaciones ZKTeco;
- generar información para reportes;
- utilizar memoria conversacional.

REGLAS:

1. Responde siempre en español.

2. Nunca inventes información interna.

3. Cuando una pregunta solicite datos del sistema,
   utiliza las herramientas disponibles.

4. Nunca generes ni ejecutes SQL arbitrario proveniente del modelo.

5. Nunca reveles:
   - contraseñas;
   - tokens;
   - API keys;
   - hashes;
   - secretos;
   - cadenas de conexión.

6. Las operaciones de escritura o eliminación sobre relojes
   requieren confirmación.

7. Respeta los permisos del usuario.

8. Si una herramienta no puede obtener información,
   indícalo claramente.

9. Sé clara, breve y profesional.

10. Para datos del dashboard, relojes, ponches o empleados,
    utiliza una herramienta antes de responder.

FORMATO FINAL:

Devuelve JSON válido con esta estructura:

{
    "respuesta": "texto para el usuario",
    "animacion": "idle|point|walk|jump|think|alert",
    "action": null
}

Cuando sea necesario puedes devolver:

{
    "respuesta": "texto",
    "animacion": "point",
    "action": {
        "type": "navigate",
        "route": "/devices"
    }
}
"""


# ============================================================
# USUARIO
# ============================================================

def _user_key(
    user: dict[str, Any],
) -> str:

    return str(
        user.get("id")
        or user.get("username")
        or user.get("email")
        or "unknown"
    )


# ============================================================
# DECLARACIONES DE HERRAMIENTAS
# ============================================================

def _declarations() -> list[dict[str, Any]]:

    return [

        {
            "name": "punch_summary",
            "description": (
                "Obtiene un resumen real de los ponches "
                "registrados hoy en el sistema."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },

        {
            "name": "search_employee",
            "description": (
                "Busca empleados o colaboradores "
                "por nombre o código."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                    },
                    "limit": {
                        "type": "integer",
                    },
                },
                "required": [
                    "query",
                ],
            },
        },

        {
            "name": "search_punches",
            "description": (
                "Consulta registros de ponches por rango "
                "de fechas, dispositivo o empleado."
            ),
            "parameters": {
                "type": "object",
                "properties": {

                    "fecha_desde": {
                        "type": "string",
                    },

                    "fecha_hasta": {
                        "type": "string",
                    },

                    "dispositivo": {
                        "type": "string",
                    },

                    "query": {
                        "type": "string",
                    },

                    "limit": {
                        "type": "integer",
                    },
                },
            },
        },

        {
            "name": "device_health",
            "description": (
                "Consulta el estado operativo real "
                "de los relojes biométricos."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },

        {
            "name": "data_analysis",
            "description": (
                "Analiza tendencias de ponches "
                "de los últimos días."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                    },
                },
            },
        },

        {
            "name": "navigate_to_module",
            "description": (
                "Solicita al frontend navegar "
                "hacia un módulo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "module": {
                        "type": "string",
                    },
                },
                "required": [
                    "module",
                ],
            },
        },

        {
            "name": "zkteco_push_employee",
            "description": (
                "Prepara la sincronización de un colaborador "
                "hacia uno o varios relojes."
            ),
            "parameters": {
                "type": "object",
                "properties": {

                    "codigo": {
                        "type": "string",
                    },

                    "dispositivos": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                    },
                },
                "required": [
                    "codigo",
                    "dispositivos",
                ],
            },
        },

        {
            "name": "zkteco_clone_employee",
            "description": (
                "Prepara la clonación de un colaborador "
                "desde un reloj hacia otros."
            ),
            "parameters": {
                "type": "object",
                "properties": {

                    "codigo": {
                        "type": "string",
                    },

                    "from_device": {
                        "type": "string",
                    },

                    "to_devices": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                    },
                },
                "required": [
                    "codigo",
                    "from_device",
                    "to_devices",
                ],
            },
        },

        {
            "name": "zkteco_delete_employee",
            "description": (
                "Prepara la eliminación de un colaborador "
                "de uno o varios relojes."
            ),
            "parameters": {
                "type": "object",
                "properties": {

                    "codigo": {
                        "type": "string",
                    },

                    "dispositivos": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                    },
                },
                "required": [
                    "codigo",
                    "dispositivos",
                ],
            },
        },
    ]


# ============================================================
# EJECUTAR HERRAMIENTA
# ============================================================

def _execute(
    name: str,
    args: dict[str, Any],
    user: dict[str, Any],
) -> dict[str, Any]:

    try:

        if name == "punch_summary":
            return tools.tool_punch_summary(
                user,
            )

        if name == "search_employee":
            return tools.tool_search_employee(
                user,
                **args,
            )

        if name == "search_punches":
            return tools.tool_search_punches(
                user,
                **args,
            )

        if name == "device_health":
            return tools.tool_device_health(
                user,
            )

        if name == "data_analysis":
            return tools.tool_data_analysis(
                user,
                **args,
            )

        if name == "navigate_to_module":
            return tools.tool_navigation(
                user,
                **args,
            )

        if name.startswith(
            "zkteco_"
        ):
            return tools.execute_zkteco_action(
                user,
                name,
                args,
            )

        return {
            "ok": False,
            "error": (
                f"Herramienta desconocida: {name}"
            ),
        }

    except Exception as exc:

        log.exception(
            "Error ejecutando herramienta %s",
            name,
        )

        return {
            "ok": False,
            "error": str(exc),
        }


# ============================================================
# GENERACIÓN GEMINI CON RETRY Y FALLBACK
# ============================================================

async def _generate(
    *,
    contents: list[Any],
    config: types.GenerateContentConfig,
):

    gemini = get_client()

    if gemini is None:
        raise RuntimeError(
            "GEMINI_API_KEY no configurada."
        )

    models: list[str] = []

    for model in (
        PRIMARY_MODEL,
        FALLBACK_MODEL,
    ):

        if (
            model
            and model not in models
        ):
            models.append(
                model,
            )

    last_error: Exception | None = None


    for model in models:

        for attempt in range(
            1,
            GEMINI_RETRIES + 1,
        ):

            try:

                log.info(
                    "Fiorella Gemini request "
                    "model=%s attempt=%s/%s",
                    model,
                    attempt,
                    GEMINI_RETRIES,
                )

                response = await asyncio.to_thread(
                    gemini.models.generate_content,
                    model=model,
                    contents=contents,
                    config=config,
                )

                log.info(
                    "Fiorella Gemini OK model=%s",
                    model,
                )

                return response, model

            except Exception as exc:

                last_error = exc

                log.exception(
                    "Gemini falló "
                    "model=%s attempt=%s/%s error=%s",
                    model,
                    attempt,
                    GEMINI_RETRIES,
                    exc,
                )

                if (
                    attempt
                    < GEMINI_RETRIES
                ):

                    await asyncio.sleep(
                        1.5 * attempt,
                    )


        log.warning(
            "Fiorella cambia al siguiente "
            "modelo después de fallar %s",
            model,
        )


    raise RuntimeError(
        "Todos los modelos Gemini configurados fallaron."
    ) from last_error


# ============================================================
# EXTRAER FUNCTION CALLS
# ============================================================

def _extract_calls(
    response: Any,
) -> list[Any]:

    calls: list[Any] = []

    for candidate in (
        response.candidates
        or []
    ):

        content = getattr(
            candidate,
            "content",
            None,
        )

        if not content:
            continue

        for part in (
            content.parts
            or []
        ):

            call = getattr(
                part,
                "function_call",
                None,
            )

            if call:
                calls.append(
                    call,
                )

    return calls


# ============================================================
# CONVERTIR RESPUESTA FINAL
# ============================================================

def _parse_response(
    raw: str | None,
) -> dict[str, Any]:

    text = (
        raw
        or ""
    ).strip()

    if not text:

        return {
            "respuesta": (
                "Gemini respondió sin contenido."
            ),
            "animacion": "alert",
            "action": None,
        }


    # Algunos modelos ocasionalmente devuelven fences Markdown.
    if text.startswith(
        "```"
    ):

        text = text.strip(
            "`"
        )

        if text.lower().startswith(
            "json"
        ):
            text = text[4:].strip()


    try:

        parsed = json.loads(
            text,
        )

        if not isinstance(
            parsed,
            dict,
        ):

            raise ValueError(
                "Respuesta JSON no es objeto."
            )

        return parsed

    except Exception:

        return {
            "respuesta": text,
            "animacion": "idle",
            "action": None,
        }


# ============================================================
# PROCESAR CHAT
# ============================================================

async def procesar_mensaje_usuario(
    user: dict[str, Any],
    message: str,
    active_module: str = "/dashboard",
    conversation_id: int | None = None,
) -> dict[str, Any]:

    gemini = get_client()

    if gemini is None:

        return {
            "respuesta": (
                "Fiorella no tiene una API key "
                "de Gemini configurada."
            ),
            "animacion": "alert",
            "action": None,
            "conversation_id": (
                conversation_id
            ),
            "tools_used": [],
        }


    uid = _user_key(
        user,
    )


    # ========================================================
    # MEMORIA
    # ========================================================

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


    # ========================================================
    # CONTEXTO
    # ========================================================

    contents: list[Any] = []

    for h in history:

        role = str(
            h.get(
                "role",
                "user",
            )
        )

        # Gemini admite "user" y "model".
        if role == "assistant":
            role = "model"

        if role not in {
            "user",
            "model",
        }:
            continue

        contents.append(
            {
                "role": role,
                "parts": [
                    {
                        "text": str(
                            h.get(
                                "content",
                                "",
                            )
                        )
                    }
                ],
            }
        )


    contents.append(
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        "Contexto del usuario:\n"
                        f"Nombre: "
                        f"{user.get('name') or user.get('username')}\n"
                        f"Rol: {user.get('role')}\n"
                        f"Módulo actual: {active_module}\n\n"
                        f"Consulta:\n{message}"
                    )
                }
            ],
        }
    )


    tools_used: list[str] = []


    try:

        # ====================================================
        # PRIMER TURNO
        # ====================================================

        first_response, model_used = (
            await _generate(
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=(
                        SYSTEM_PROMPT
                    ),
                    tools=[
                        types.Tool(
                            function_declarations=(
                                _declarations()
                            )
                        )
                    ],
                    temperature=0.15,
                ),
            )
        )


        calls = _extract_calls(
            first_response,
        )


        # ====================================================
        # FUNCTION CALLING
        # ====================================================

        if calls:

            function_parts = []

            for call in calls:

                name = str(
                    call.name
                )

                args = dict(
                    call.args
                    or {}
                )


                result = _execute(
                    name,
                    args,
                    user,
                )


                tools_used.append(
                    name,
                )


                try:

                    audit(
                        user,
                        "tool_call",
                        name,
                        (
                            "ok"
                            if result.get(
                                "ok",
                                False,
                            )
                            else "denied"
                        ),
                        args,
                        result,
                    )

                except Exception:

                    log.exception(
                        "No se pudo registrar "
                        "auditoría de Fiorella."
                    )


                # /*
                # IMPORTANTE:
                # Para generateContent conservamos la respuesta
                # completa del modelo anterior, incluida la firma
                # de pensamiento que gestiona el SDK.
                # */

                function_parts.append(
                    types.Part.from_function_response(
                        name=name,
                        response=result,
                    )
                )


            first_candidate = (
                first_response.candidates[0]
                if first_response.candidates
                else None
            )


            if (
                first_candidate is None
                or first_candidate.content is None
            ):

                raise RuntimeError(
                    "Gemini solicitó una herramienta "
                    "pero no devolvió contenido válido."
                )


            second_contents = [
                *contents,
                first_candidate.content,

                types.Content(
                    role="user",
                    parts=function_parts,
                ),
            ]


            second_response, model_used = (
                await _generate(
                    contents=second_contents,
                    config=types.GenerateContentConfig(
                        system_instruction=(
                            SYSTEM_PROMPT
                        ),
                        temperature=0.15,
                        response_mime_type=(
                            "application/json"
                        ),
                    ),
                )
            )


            raw = (
                second_response.text
                or ""
            )


        else:

            raw = (
                first_response.text
                or ""
            )


        # ====================================================
        # PARSEAR
        # ====================================================

        parsed = _parse_response(
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

            "action": parsed.get(
                "action",
            ),

            "conversation_id": (
                conversation_id
            ),

            "tools_used": (
                tools_used
            ),

            "model_used": (
                model_used
            ),
        }


        # ====================================================
        # MEMORIA RESPUESTA
        # ====================================================

        save_message(
            conversation_id,
            uid,
            "assistant",
            result[
                "respuesta"
            ],
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
                    "model": model_used,
                    "tools": tools_used,
                },
            )

        except Exception:

            log.exception(
                "No se pudo registrar auditoría del chat."
            )


        return result


    except Exception as exc:

        # ====================================================
        # ERROR REAL
        # ====================================================

        log.exception(
            "Fiorella chat FAILED: %s",
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
                    "error": str(
                        exc,
                    )
                },
            )

        except Exception:

            log.exception(
                "No se pudo guardar "
                "auditoría del error."
            )


        return {
            "respuesta": (
                "No pude conectar con el servicio "
                "de inteligencia artificial en este momento. "
                "El sistema biométrico continúa operativo."
            ),

            "animacion": "alert",

            "action": None,

            "conversation_id": (
                conversation_id
            ),

            "tools_used": [],

            "error": (
                str(exc)
                if os.getenv(
                    "APP_ENV",
                    "development",
                ).lower()
                == "development"
                else None
            ),
        }


procesar_mensaje_usuario_v3 = (
    procesar_mensaje_usuario
)