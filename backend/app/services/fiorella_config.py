# backend/app/services/fiorella_config.py
from __future__ import annotations

import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

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
    int(os.getenv("FIORELLA_MAX_HISTORY", "20")),
)

AI_RETRIES = max(
    1,
    int(os.getenv("FIORELLA_AI_RETRIES", "2")),
)

AI_TIMEOUT = max(
    10,
    int(os.getenv("FIORELLA_AI_TIMEOUT", "45")),
)

APP_ENV = os.getenv(
    "APP_ENV",
    "development",
).strip().lower()

_client: OpenAI | None = None


def get_client() -> OpenAI | None:
    """
    Cliente OpenAI-compatible conectado exclusivamente a OpenRouter.
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


def development_mode() -> bool:
    return APP_ENV == "development"
