import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from app.services.fiorella_response_utils import (
    clean_user_text,
)


# ============================================================
# CARGAR backend/.env
# ============================================================

BACKEND_DIR = (
    Path(__file__)
    .resolve()
    .parents[1]
)

ENV_FILE = (
    BACKEND_DIR
    / ".env"
)

load_dotenv(
    ENV_FILE
)


# ============================================================
# CONFIG
# ============================================================

api_key = os.getenv(
    "OPENROUTER_API_KEY",
    "",
).strip()


model = os.getenv(
    "FIORELLA_MODEL",
    "openrouter/free",
).strip()


base_url = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1",
).strip()


if not api_key:

    print(
        "ERROR: OPENROUTER_API_KEY "
        "no está configurada."
    )

    sys.exit(1)


# ============================================================
# CLIENTE
# ============================================================

client = OpenAI(
    api_key=api_key,
    base_url=base_url,
    timeout=45,
)


# ============================================================
# TEST
# ============================================================

try:

    print(
        "Probando OpenRouter..."
    )

    print(
        f"Modelo solicitado: {model}"
    )


    response = (
        client
        .chat
        .completions
        .create(
            model=model,

            messages=[
                {
                    "role":
                        "system",

                    "content": (
                        "Eres Fiorella, "
                        "asistente virtual "
                        "del sistema biométrico."
                    ),
                },
                {
                    "role":
                        "user",

                    "content": (
                        "Responde exactamente: "
                        "FIORELLA OPENROUTER OK"
                    ),
                },
            ],

            temperature=0,
        )
    )


    if not response.choices:

        raise RuntimeError(
            "Respuesta sin choices."
        )


    print(
        "\nProveedor: OpenRouter"
    )


    print(
        "Modelo utilizado:",
        response.model,
    )


    print(
        "Respuesta:",
        response
        .choices[0]
        .message
        .content,
    )


except Exception as exc:

    print(
        "\nERROR OPENROUTER:"
    )

    print(
        repr(exc)
    )

    sys.exit(1)