import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FILE = DATA_DIR / "app_settings.json"

DEFAULTS: dict[str, Any] = {
    "night_start": "18:00",
    "scheduled_hours": 8.0,
    "rate_extra": 0.45,
    "rate_night": 0.15,
    "rate_sunday": 1.00,
    "rate_saturday_after4": 1.00,
    "rate_holiday": 1.65,
    "saturday_free_hours": 4.0,
    "sync_on_search": True,
    "remote_punch_enabled": True,
    "company_name": "César Iglesias",
    "production_host": "172.21.20.14",
}


def load_settings() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not FILE.exists():
        save_settings(DEFAULTS.copy())
        return DEFAULTS.copy()
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        merged = DEFAULTS.copy()
        merged.update(data if isinstance(data, dict) else {})
        return merged
    except Exception:
        return DEFAULTS.copy()


def save_settings(data: dict[str, Any]) -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    merged = DEFAULTS.copy()
    merged.update(data)
    FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
    return merged