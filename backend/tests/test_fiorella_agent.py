from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


# ============================================================
# HACER VISIBLE backend/app
# ============================================================

BACKEND_DIR = (
    Path(__file__)
    .resolve()
    .parents[1]
)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(BACKEND_DIR),
    )


# ============================================================
# IMPORTAR AGENTE
# ============================================================

from app.services.fiorella_agent_v3 import (
    get_client,
    procesar_mensaje_usuario,
)


# ============================================================
# USUARIO DE PRUEBA
# ============================================================

TEST_USER = {
    "id": "1",
    "usuario_id": "1",
    "username": "test_fiorella",
    "name": "Usuario de Prueba",
    "nombre": "Usuario de Prueba",
    "role": "SUPER_ADMIN",
}


# ============================================================
# TEST
# ============================================================

async def main():

    print()
    print("=" * 70)
    print("TEST COMPLETO DEL AGENTE FIORELLA")
    print("=" * 70)

    client = get_client()

    print()
    print("1. Cliente IA:")
    print(client)

    if client is None:
        raise RuntimeError(
            "get_client() devolvió None. "
            "Verifica OPENROUTER_API_KEY."
        )

    print()
    print("2. Enviando mensaje al agente...")
    print()

    result = await procesar_mensaje_usuario(
        user=TEST_USER,
        message=(
            "Hola Fiorella. "
            "Preséntate en dos oraciones y dime "
            "en qué módulo estoy."
        ),
        active_module="/dashboard",
        conversation_id=None,
    )

    print()
    print("=" * 70)
    print("RESULTADO RAW")
    print("=" * 70)
    print(repr(result))

    print()
    print("=" * 70)
    print("RESULTADO JSON")
    print("=" * 70)

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
            default=str,
        )
    )

    print()
    print("=" * 70)
    print("VALIDACIONES")
    print("=" * 70)

    if not isinstance(
        result,
        dict,
    ):
        raise RuntimeError(
            "ERROR: el agente no devolvió dict."
        )

    respuesta = result.get(
        "respuesta"
    )

    if not respuesta:
        raise RuntimeError(
            "ERROR: el agente no devolvió "
            "el campo 'respuesta'."
        )

    print(
        "respuesta       =",
        respuesta,
    )

    print(
        "conversation_id =",
        result.get(
            "conversation_id"
        ),
    )

    print(
        "provider        =",
        result.get(
            "provider"
        ),
    )

    print(
        "model_used      =",
        result.get(
            "model_used"
        ),
    )

    print(
        "tools_used      =",
        result.get(
            "tools_used"
        ),
    )

    print()
    print("FIORELLA AGENT TEST OK")
    print()


if __name__ == "__main__":
    asyncio.run(
        main()
    )