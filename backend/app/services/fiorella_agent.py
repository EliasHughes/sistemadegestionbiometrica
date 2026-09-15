# backend/app/services/fiorella_agent.py
import os
import json
from dotenv import load_dotenv
import google.generativeai as genai

# Cargar variables de entorno desde .env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

IS_CONFIGURED = bool(
    GEMINI_API_KEY 
    and GEMINI_API_KEY != "tu_api_key_aqui" 
    and not GEMINI_API_KEY.startswith("tu_")
)

if IS_CONFIGURED:
    genai.configure(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT = """
Eres Fiorella, una asistente virtual interactiva y experta en un sistema de gestión biométrica y control de ponches.
Tu tono es profesional, ágil, servicial y amigable.

Tu función es asistir a los usuarios en los siguientes módulos:
- /dashboard: Métricas generales, relojes fuera de línea, semáforos de estado.
- /records: Consulta y filtrado de ponches SQL, turnos abiertos sin salida.
- /devices: Estado de ponchadores biológicos ZKTeco, direcciones IP, conectividad SDK.
- /collaborators: Gestión de fichas de empleados, sincronización de huellas.
- /export: Generación de reportes en Excel y PDF.

REGLA OBLIGATORIA DE SALIDA:
Debes responder SIEMPRE en formato JSON válido con la siguiente estructura:
{
  "respuesta": "Texto claro y conciso para el usuario",
  "animacion": "walk" | "idle" | "point" | "jump"
}
Selecciona "point" si estás explicando algo en pantalla, "jump" si es algo destacado, "walk" si estás buscando o procesando algo, o "idle" para respuestas comunes.
"""

async def procesar_mensaje_usuario(user_id: str, user_name: str, message: str, active_module: str = "/dashboard") -> dict:
    """Procesa mensajes interactivos del chat con soporte para IA/Gemini y fallback."""
    if not IS_CONFIGURED:
        return {
            "respuesta": f"Hola {user_name}, estoy operando en modo básico. Configura GEMINI_API_KEY para habilitar todas mis funciones.",
            "animacion": "idle"
        }

    try:
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
            generation_config={"response_mime_type": "application/json"}
        )

        prompt_context = f"Usuario: {user_name} (ID: {user_id})\nMódulo en pantalla: {active_module}\nConsulta: {message}"
        response = model.generate_content(prompt_context)
        parsed_response = json.loads(response.text)

        return {
            "respuesta": parsed_response.get("respuesta", "Entendido, estoy procesando tu solicitud."),
            "animacion": parsed_response.get("animacion", "point")
        }
    except Exception as err:
        return {
            "respuesta": f"Hola {user_name}, se produjo un inconveniente con el motor de IA: {str(err)}",
            "animacion": "idle"
        }

async def iniciar_sesion_proactiva(user_id: str, user_name: str, active_module: str = "/dashboard") -> dict:
    """Saludo proactivo al cargar el módulo."""
    return {
        "respuesta": f"¡Hola {user_name}! Estoy lista para ayudarte en el módulo {active_module}. ¿Qué deseas realizar?",
        "animacion": "point"
    }

# Alias por compatibilidad
process_fiorella_chat = procesar_mensaje_usuario