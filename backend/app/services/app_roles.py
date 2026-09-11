import json
from pathlib import Path
from typing import Any

from app.services.app_users import ALL_SCREENS

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
ROLES_FILE = DATA_DIR / "app_roles.json"


def _default_roles() -> list[dict[str, Any]]:
    return [
        {
            "id": "super_admin",
            "name": "Super Admin",
            "description": "Acceso total al sistema",
            "color": "#C8102E",
            "screens": {k: True for k in ALL_SCREENS},
            "protected": True,
        },
        {
            "id": "supervisor",
            "name": "Supervisor",
            "description": "Planta y operación diaria",
            "color": "#0f766e",
            "screens": {
                **{k: False for k in ALL_SCREENS},
                "dashboard": True,
                "records": True,
                "devices": True,
                "employees": True,
                "reports": True,
                "data_export": True,
            },
            "protected": False,
        },
        {
            "id": "rrhh",
            "name": "Recursos Humanos",
            "description": "Personal, reportes y exportes",
            "color": "#7c3aed",
            "screens": {
                **{k: False for k in ALL_SCREENS},
                "dashboard": True,
                "records": True,
                "employees": True,
                "reports": True,
                "data_export": True,
            },
            "protected": False,
        },
        {
            "id": "coordinador",
            "name": "Coordinador",
            "description": "Consulta operativa",
            "color": "#2563eb",
            "screens": {
                **{k: False for k in ALL_SCREENS},
                "dashboard": True,
                "records": True,
                "devices": True,
            },
            "protected": False,
        },
    ]


def load_roles() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ROLES_FILE.exists():
        ROLES_FILE.write_text(json.dumps(_default_roles(), indent=2, ensure_ascii=False), encoding="utf-8")
    return json.loads(ROLES_FILE.read_text(encoding="utf-8"))


def save_roles(roles: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ROLES_FILE.write_text(json.dumps(roles, indent=2, ensure_ascii=False), encoding="utf-8")