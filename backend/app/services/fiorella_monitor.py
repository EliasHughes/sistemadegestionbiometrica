from __future__ import annotations

import hashlib
import json
import os
import asyncio
from typing import Any

from app.services.database import execute, fetch_all
from app.services.fiorella_audit import audit


def _fingerprint(category: str, title: str, target: str = ""):
    return hashlib.sha256(f"{category}|{title}|{target}".encode()).hexdigest()


def _upsert_incident(
    category: str,
    severity: str,
    title: str,
    description: str,
    data: dict[str, Any],
    target: str = "",
):
    fingerprint = _fingerprint(category, title, target)
    execute(
        """
        MERGE dbo.fiorella_incidents AS target
        USING (SELECT ? fingerprint, ? severity, ? category, ? title,
                      ? description, ? data_json) AS src
        ON target.fingerprint=src.fingerprint
        WHEN MATCHED THEN UPDATE SET
            severity=src.severity,
            description=src.description,
            data_json=src.data_json,
            last_seen_at=SYSUTCDATETIME(),
            status='open',
            resolved_at=NULL
        WHEN NOT MATCHED THEN INSERT
            (fingerprint,severity,category,title,description,data_json)
        VALUES
            (src.fingerprint,src.severity,src.category,src.title,
             src.description,src.data_json);
        """,
        (
            fingerprint,
            severity,
            category,
            title,
            description,
            json.dumps(data, ensure_ascii=False, default=str),
        ),
    )
    return fingerprint


def run_health_scan(user: dict[str, Any] | None = None):
    incidents = []

    # SQL/ponches
    try:
        rows = fetch_all(
            """
            SELECT
              LTRIM(RTRIM(dispositivo_origen)) name,
              COUNT(*) total,
              MAX(fecha) last_fecha
            FROM dbo.punches
            WHERE dispositivo_origen IS NOT NULL
              AND LTRIM(RTRIM(dispositivo_origen))<>''
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            """
        )
        for row in rows:
            if not row.get("last_fecha"):
                continue
            incidents.append({
                "category": "attendance",
                "severity": "medium",
                "title": f"Revisar actividad del reloj {row['name']}",
                "description": f"Último registro: {row['last_fecha']}",
                "data": row,
                "target": row["name"],
            })
    except Exception as exc:
        incidents.append({
            "category": "database",
            "severity": "critical",
            "title": "No se pudo consultar la base de datos",
            "description": str(exc)[:500],
            "data": {},
            "target": "sql",
        })

    # Salud real de relojes usando la función existente.
    try:
        from app.api.routes.records_clocks import device_health
        health = device_health.__wrapped__(user) if hasattr(device_health, "__wrapped__") else device_health(user or {})
        for item in health.get("items", []):
            if item.get("configured") and not item.get("online"):
                incidents.append({
                    "category": "device",
                    "severity": "high",
                    "title": f"Reloj offline: {item.get('name')}",
                    "description": f"No responde en {item.get('ip')}.",
                    "data": item,
                    "target": item.get("name", ""),
                })
    except Exception:
        pass

    for inc in incidents:
        _upsert_incident(**inc)

    if user:
        audit(user, "health_scan", None, "ok", None, {"incidents": len(incidents)})

    return {"ok": True, "incidents_detected": len(incidents), "items": incidents}


_monitor_task: asyncio.Task | None = None


async def _loop():
    interval = max(60, int(os.getenv("FIORELLA_MONITOR_INTERVAL", "300")))
    while True:
        try:
            run_health_scan()
        except Exception:
            pass
        await asyncio.sleep(interval)


def start_monitor():
    global _monitor_task
    if _monitor_task is None or _monitor_task.done():
        _monitor_task = asyncio.create_task(_loop())
    return _monitor_task


async def stop_monitor():
    global _monitor_task
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
        try:
            await _monitor_task
        except asyncio.CancelledError:
            pass
    _monitor_task = None
