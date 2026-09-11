import json
from pathlib import Path
from typing import Any
from datetime import date

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FILE = DATA_DIR / "rotating_schedules.json"


def load_rotations() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FILE.exists():
        FILE.write_text("[]", encoding="utf-8")
    return json.loads(FILE.read_text(encoding="utf-8"))


def save_rotations(items: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def current_schedule_for(rotation: dict[str, Any], on: date | None = None) -> Any:
    """Devuelve el schedule_id activo según semana ISO."""
    on = on or date.today()
    ids = rotation.get("schedule_ids") or []
    if not ids:
        return None
    # semana del año (1-53)
    week = on.isocalendar()[1]
    idx = (week - 1) % len(ids)
    return ids[idx]