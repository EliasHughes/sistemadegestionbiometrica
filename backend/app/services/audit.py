from __future__ import annotations

from datetime import datetime
from typing import Any

from app.services.json_store import data_path, read_json, write_json

AUDIT_FILE = data_path("audit.json")


def audit(actor: str, action: str, target: str, details: dict[str, Any] | None = None) -> dict:
    entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "actor": actor or "system",
        "action": action,
        "target": target,
        "details": details or {},
    }
    items = read_json(AUDIT_FILE, [])
    if not isinstance(items, list):
        items = []
    items.append(entry)
    write_json(AUDIT_FILE, items[-2000:])
    return entry


def recent(limit: int = 200) -> list[dict]:
    items = read_json(AUDIT_FILE, [])
    if not isinstance(items, list):
        return []
    return list(reversed(items))[:limit]