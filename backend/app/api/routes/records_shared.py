# backend/app/api/routes/records_shared.py
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DEVICES_FILE = DATA_DIR / "devices_inventory.json"
COLLAB_FILE = DATA_DIR / "collaborators.json"
ROLES_FILE = DATA_DIR / "app_roles.json"
REMOTE_FILE = DATA_DIR / "remote_punches.json"


def read_json(path: Path, default):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps(default, indent=2, ensure_ascii=False), encoding="utf-8")
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if data is not None else default
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class DeviceIn(BaseModel):
    name: str
    ip: str = ""
    port: int = 4370
    model: str = ""
    location: str = ""
    notes: str = ""
    active: bool = True
    password: int | str = 0