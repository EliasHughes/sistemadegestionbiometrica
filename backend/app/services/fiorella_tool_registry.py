# backend/app/services/fiorella_tool_registry.py
from __future__ import annotations

import logging
from typing import Any

from app.services import fiorella_tools as tools
from app.services.fiorella_audit import audit

log = logging.getLogger("fiorella")


def tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "punch_summary",
                "description": "Obtiene un resumen real de los ponches registrados hoy.",
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
                "description": "Busca empleados o colaboradores por nombre o código.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Nombre, apellido o código.",
                        },
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 100,
                        },
                    },
                    "required": ["query"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_punches",
                "description": "Consulta registros reales de ponches.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "fecha_desde": {"type": "string"},
                        "fecha_hasta": {"type": "string"},
                        "dispositivo": {"type": "string"},
                        "query": {"type": "string"},
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
                    "Consulta el estado operativo real de los relojes biométricos "
                    "incluyendo equipos online y offline."
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
                "description": "Analiza tendencias de ponches de los últimos días.",
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
                "description": "Solicita al frontend navegar hacia un módulo de la aplicación.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "module": {"type": "string"},
                    },
                    "required": ["module"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "zkteco_push_employee",
                "description": (
                    "Prepara la sincronización de un colaborador hacia "
                    "uno o varios relojes ZKTeco."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "codigo": {"type": "string"},
                        "dispositivos": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["codigo", "dispositivos"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "zkteco_clone_employee",
                "description": (
                    "Prepara la clonación de un colaborador desde un reloj "
                    "hacia otros relojes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "codigo": {"type": "string"},
                        "from_device": {"type": "string"},
                        "to_devices": {
                            "type": "array",
                            "items": {"type": "string"},
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
                        "codigo": {"type": "string"},
                        "dispositivos": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["codigo", "dispositivos"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def execute_tool(
    name: str,
    args: dict[str, Any],
    user: dict[str, Any],
) -> dict[str, Any]:
    try:
        if name == "punch_summary":
            return tools.tool_punch_summary(user)

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
            return tools.tool_device_health(user)

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

        if name.startswith("zkteco_"):
            return tools.execute_zkteco_action(
                user,
                name,
                args,
            )

        return {
            "ok": False,
            "error": f"Herramienta desconocida: {name}",
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


def audit_tool_call(
    user: dict[str, Any],
    name: str,
    args: dict[str, Any],
    result: dict[str, Any],
) -> None:
    try:
        audit(
            user,
            "tool_call",
            name,
            "ok" if result.get("ok", False) else "error",
            args,
            result,
        )
    except Exception:
        log.exception(
            "No se pudo auditar la herramienta %s",
            name,
        )
