# backend/app/services/sql_indexes.py
"""
Crea / verifica índices de dbo.punches al arrancar.
No requiere scripts manuales ni SSMS.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.database import execute, fetch_all, test_connection

log = logging.getLogger("poche.indexes")

INDEXES: list[dict[str, str]] = [
    {
        "name": "IX_punches_fecha",
        "sql": "CREATE NONCLUSTERED INDEX [IX_punches_fecha] ON [dbo].[punches] ([fecha] DESC)",
    },
    {
        "name": "IX_punches_codigo",
        "sql": "CREATE NONCLUSTERED INDEX [IX_punches_codigo] ON [dbo].[punches] ([codigo])",
    },
    {
        "name": "IX_punches_dispositivo",
        "sql": "CREATE NONCLUSTERED INDEX [IX_punches_dispositivo] ON [dbo].[punches] ([dispositivo_origen])",
    },
    {
        "name": "IX_punches_codigo_fecha",
        "sql": "CREATE NONCLUSTERED INDEX [IX_punches_codigo_fecha] ON [dbo].[punches] ([codigo], [fecha] DESC)",
    },
    {
        "name": "IX_punches_fecha_dispositivo",
        "sql": (
            "CREATE NONCLUSTERED INDEX [IX_punches_fecha_dispositivo] "
            "ON [dbo].[punches] ([fecha] DESC, [dispositivo_origen])"
        ),
    },
]


def _existing_index_names() -> set[str]:
    rows = fetch_all(
        """
        SELECT i.name AS name
        FROM sys.indexes i
        INNER JOIN sys.objects o ON o.object_id = i.object_id
        INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
        WHERE s.name = 'dbo' AND o.name = 'punches' AND i.name IS NOT NULL
        """
    )
    return {str(r.get("name")) for r in rows}


def list_indexes() -> list[dict[str, Any]]:
    try:
        return fetch_all(
            """
            SELECT
                i.name AS name,
                i.type_desc AS type,
                i.is_unique AS is_unique,
                i.is_primary_key AS is_primary_key
            FROM sys.indexes i
            INNER JOIN sys.objects o ON o.object_id = i.object_id
            INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
            WHERE s.name = 'dbo' AND o.name = 'punches' AND i.name IS NOT NULL
            ORDER BY i.name
            """
        )
    except Exception as exc:
        return [{"error": str(exc)}]


def ensure_indexes() -> dict[str, Any]:
    db = test_connection()
    if db.get("status") != "online":
        log.warning("índices omitidos: SQL offline (%s)", db.get("detail"))
        return {"status": "skipped", "reason": db.get("detail"), "created": [], "existing": []}

    created: list[str] = []
    existing: list[str] = []
    errors: list[dict[str, str]] = []

    try:
        present = _existing_index_names()
    except Exception as exc:
        log.exception("no se pudieron listar índices")
        return {"status": "error", "reason": str(exc), "created": [], "existing": []}

    for spec in INDEXES:
        name = spec["name"]
        if name in present:
            existing.append(name)
            continue
        try:
            execute(spec["sql"])
            created.append(name)
            log.info("índice creado: %s", name)
        except Exception as exc:
            msg = str(exc)
            errors.append({"name": name, "error": msg})
            log.warning("índice %s no creado: %s", name, msg)

    status = "ok" if not errors else ("partial" if created or existing else "error")
    return {
        "status": status,
        "table": "dbo.punches",
        "created": created,
        "existing": existing,
        "errors": errors,
        "indexes": list_indexes(),
    }