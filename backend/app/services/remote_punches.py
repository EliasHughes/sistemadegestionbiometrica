import json
from datetime import datetime
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FILE = DATA_DIR / "remote_punches.json"


def load_remote() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FILE.exists():
        FILE.write_text("[]", encoding="utf-8")
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def add_remote(payload: dict[str, Any]) -> dict[str, Any]:
    items = load_remote()
    last_id = 0
    if items and isinstance(items[-1], dict):
        try:
            last_id = int(items[-1].get("id") or 0)
        except Exception:
            last_id = 0
    entry = {
        "id": last_id + 1,
        "fecha": datetime.now().strftime("%Y-%m-%d"),
        "hora": datetime.now().strftime("%H:%M:%S"),
        "codigo": str(payload.get("codigo", "")).strip(),
        "tipo": payload.get("tipo", "entrada"),
        "comentario": payload.get("comentario", ""),
        "usuario": payload.get("usuario", ""),
        "estado": "registrado",
    }
    items.append(entry)
    FILE.write_text(
        json.dumps(items[-1000:], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return entry