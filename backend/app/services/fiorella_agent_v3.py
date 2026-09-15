from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from app.services import fiorella_tools as tools
from app.services.fiorella_audit import audit
from app.services.fiorella_memory import (
    get_or_create_conversation,
    load_history,
    save_message,
)


# ============================================================
# CONFIGURACIÓN
# ============================================================

load_dotenv()

log = logging.getLogger("fiorella")


OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1",
).strip()


MODEL = os.getenv(
    "FIORELLA_MODEL",
    "openrouter/free",
).strip()


MAX_HISTORY = max(
    1,
    int(
        os.getenv(
            "FIORELLA_MAX_HISTORY",
            "20",
        )
    ),
)


AI_RETRIES = max(
    1,
    int(
        os.getenv(
            "FIORELLA_AI_RETRIES",
            "2",
        )
    ),
)


AI_TIMEOUT = max(
    10,
    int(
        os.getenv(
            "FIORELLA_AI_TIMEOUT",
            "45",
        )
    ),
)


# ============================================================
# CLIENTE OPENROUTER
# ============================================================

_client: OpenAI | None = None


def get_client() -> OpenAI | None:
    """
    Devuelve un cliente compatible con OpenAI,
    pero conectado exclusivamente a OpenRouter.

    NO utiliza OPENAI_API_KEY.
    NO conecta directamente con api.openai.com.
    """

    global _client

    if _client is not None:
        return _client

    api_key = os.getenv(
        "OPENROUTER_API_KEY",
        "",
    ).strip()

    if not api_key:
        return None

    _client = OpenAI(
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
        timeout=AI_TIMEOUT,
        max_retries=0,
        default_headers={
            "X-Title": "Fiorella - Sistema Biometrico",
        },
    )

    return _client


# ============================================================
# PROMPT PRINCIPAL
# ============================================================

SYSTEM_PROMPT = """
Eres Fiorella, la asistente virtual oficial del
Sistema de Gestión Biométrica.

Trabajas integrada dentro de una aplicación empresarial que administra:

- empleados;
- colaboradores;
- ponches;
- horarios;
- relojes biométricos ZKTeco;
- inventario biométrico;
- sincronizaciones;
- ponches remotos;
- reportes;
- auditoría;
- usuarios;
- métricas operativas.

Tu objetivo es ayudar al usuario utilizando información REAL del sistema.

REGLAS OBLIGATORIAS:

1. Responde siempre en español.

2. No inventes información interna.

3. Cuando el usuario solicite datos del sistema debes utilizar
   una herramienta si existe una herramienta adecuada.

4. Para preguntas acerca de:
   - cantidad de relojes;
   - relojes online u offline;
   - salud de dispositivos;
   - empleados;
   - colaboradores;
   - ponches;
   - tendencias;
   - métricas;

   debes consultar las herramientas disponibles.

5. Nunca generes ni ejecutes SQL arbitrario enviado por el modelo.

6. Nunca reveles:
   - contraseñas;
   - API keys;
   - tokens;
   - hashes;
   - secretos;
   - cadenas de conexión.

7. Las operaciones que puedan modificar datos o relojes deben
   respetar los permisos y mecanismos de confirmación del sistema.

8. Si una herramienta falla, indícalo claramente.

9. Utiliza el módulo actual proporcionado en el contexto.

10. Sé clara, profesional y relativamente breve.

11. Si puedes responder utilizando datos reales obtenidos mediante
    una herramienta, no respondas con datos aproximados.

RESPUESTA FINAL:

Cuando hayas terminado de utilizar las herramientas necesarias,
responde preferiblemente con JSON válido en esta forma:

{
  "respuesta": "respuesta para el usuario",
  "animacion": "idle",
  "action": null
}

Animaciones válidas:

idle
point
walk
jump
think
alert

Para solicitar navegación:

{
  "respuesta": "Abriré el módulo de dispositivos.",
  "animacion": "point",
  "action": {
    "type": "navigate",
    "route": "/devices"
  }
}

No incluyas bloques Markdown alrededor del JSON.
"""


# ============================================================
# IDENTIFICACIÓN DEL USUARIO
# ============================================================

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


# ============================================================
# TOOLS / FUNCTION CALLING
# ============================================================

def _tool_definitions() -> list[dict[str, Any]]:
    """
    OpenRouter utiliza el esquema OpenAI-compatible para tools.
    """

    return [
        {
            "type": "function",
            "function": {
                "name": "punch_summary",
                "description": (
                    "Obtiene un resumen real de los ponches "
                    "registrados hoy."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
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
                            "description": (
                                "Nombre, apellido o código."
                            ),
                        },
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                        },
                    },
                    "required": [
                        "query",
                    ],
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
                "name": "search_punches",
                "description": (
                    "Consulta registros reales de ponches."
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
                            "minimum": 1,
                            "maximum": 500,
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
                "name": "device_health",
                "description": (
                    "Consulta el estado operativo real "
                    "de los relojes biométricos incluyendo "
                    "equipos online y offline."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
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
                            "minimum": 1,
                            "maximum": 365,
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
                "name": "navigate_to_module",
                "description": (
                    "Solicita al frontend navegar "
                    "hacia un módulo de la aplicación."
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
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
                "name": "zkteco_push_employee",
                "description": (
                    "Prepara la sincronización de un colaborador "
                    "hacia uno o varios relojes ZKTeco."
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
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
                "name": "zkteco_clone_employee",
                "description": (
                    "Prepara la clonación de un colaborador "
                    "desde un reloj hacia otros relojes."
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
                    "additionalProperties": False,
                },
            },
        },

        {
            "type": "function",
            "function": {
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
                    "additionalProperties": False,
                },
            },
        },
    ]


# ============================================================
# EJECUCIÓN DE TOOLS
# ============================================================

def _execute_tool(
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
# LLAMADA A OPENROUTER
# ============================================================

async def _generate(
    messages: list[dict[str, Any]],
    use_tools: bool = True,
):
    """
    Ejecuta una petición a OpenRouter.

    openrouter/free decide automáticamente qué modelo gratuito
    utilizar y filtra por capacidades requeridas, incluyendo tools.
    """

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
                "Fiorella OpenRouter request "
                "model=%s attempt=%s/%s",
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
                kwargs["tools"] = (
                    _tool_definitions()
                )

                kwargs["tool_choice"] = "auto"

            response = await asyncio.to_thread(
                client.chat.completions.create,
                **kwargs,
            )

            log.info(
                "Fiorella OpenRouter OK "
                "requested_model=%s actual_model=%s",
                MODEL,
                getattr(
                    response,
                    "model",
                    "unknown",
                ),
            )

            return response

        except Exception as exc:

            last_error = exc

            log.exception(
                "OpenRouter falló "
                "attempt=%s/%s error=%s",
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


# ============================================================
# PARSEAR RESPUESTA FINAL
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
                "El proveedor de IA respondió "
                "sin contenido."
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
            and lines[-1].strip().startswith(
                "```"
            )
        ):
            lines = lines[:-1]

        text = "\n".join(
            lines
        ).strip()

    if text.lower().startswith(
        "json\n"
    ):
        text = text[5:].strip()

    try:

        parsed = json.loads(
            text,
        )

        if isinstance(
            parsed,
            dict,
        ):

            return parsed

    except Exception:

        pass

    return {
        "respuesta": text,
        "animacion": "point",
        "action": None,
    }


# ============================================================
# CHAT PRINCIPAL
# ============================================================

async def procesar_mensaje_usuario(
    user: dict[str, Any],
    message: str,
    active_module: str = "/dashboard",
    conversation_id: int | None = None,
) -> dict[str, Any]:

    client = get_client()

    if client is None:

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

    # ========================================================
    # CONVERSACIÓN / MEMORIA
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
    # CONSTRUIR MENSAJES
    # ========================================================

    messages: list[
        dict[str, Any]
    ] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT,
        }
    ]

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

        if not content:
            continue

        messages.append(
            {
                "role": role,
                "content": content,
            }
        )

    messages.append(
        {
            "role": "user",
            "content": (
                "CONTEXTO ACTUAL DEL SISTEMA\n"
                f"Usuario: "
                f"{user.get('name') or user.get('nombre') or user.get('username')}\n"
                f"Rol: {user.get('role')}\n"
                f"Módulo actual: {active_module}\n\n"
                f"CONSULTA DEL USUARIO:\n"
                f"{message}"
            ),
        }
    )

    tools_used: list[str] = []

    try:

        # ====================================================
        # PRIMERA PETICIÓN
        # ====================================================

        response = await _generate(
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

        tool_calls = (
            assistant_message.tool_calls
            or []
        )

        # ====================================================
        # FUNCTION CALLING
        # ====================================================

        if tool_calls:

            assistant_dict = (
                assistant_message.model_dump(
                    exclude_none=True,
                )
            )

            messages.append(
                assistant_dict
            )

            for call in tool_calls:

                name = str(
                    call.function.name
                )

                raw_arguments = (
                    call.function.arguments
                    or "{}"
                )

                try:

                    args = json.loads(
                        raw_arguments
                    )

                    if not isinstance(
                        args,
                        dict,
                    ):
                        args = {}

                except Exception:

                    args = {}

                result = _execute_tool(
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
                            else "error"
                        ),
                        args,
                        result,
                    )

                except Exception:

                    log.exception(
                        "No se pudo auditar "
                        "la herramienta %s",
                        name,
                    )

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(
                            result,
                            ensure_ascii=False,
                            default=str,
                        ),
                    }
                )

            # =================================================
            # RESPUESTA FINAL DESPUÉS DE HERRAMIENTAS
            # =================================================

            final_response = (
                await _generate(
                    messages,
                    use_tools=False,
                )
            )

            if not final_response.choices:

                raise RuntimeError(
                    "OpenRouter no devolvió "
                    "respuesta después de tools."
                )

            final_message = (
                final_response
                .choices[0]
                .message
            )

            raw = (
                final_message.content
                or ""
            )

            actual_model = getattr(
                final_response,
                "model",
                MODEL,
            )

        else:

            raw = (
                assistant_message.content
                or ""
            )

            actual_model = getattr(
                response,
                "model",
                MODEL,
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
            "provider": "openrouter",
            "requested_model": MODEL,
            "model_used": (
                actual_model
            ),
        }

        # ====================================================
        # GUARDAR RESPUESTA EN MEMORIA
        # ====================================================

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

        # ====================================================
        # AUDITORÍA
        # ====================================================

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
                    "model": actual_model,
                    "tools": tools_used,
                },
            )

        except Exception:

            log.exception(
                "No se pudo registrar "
                "auditoría del chat."
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
            "provider": "openrouter",
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


# Compatibilidad con código existente
procesar_mensaje_usuario_v3 = (
    procesar_mensaje_usuario
)