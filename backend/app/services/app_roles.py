from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.permissions import (
    ALL_OPERATIONS,
    ROLE_DEFAULT_OPERATIONS,
    normalize_operations,
    normalize_role,
    operations_for_role,
)
from app.services.app_users import ALL_SCREENS

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
ROLES_FILE = DATA_DIR / "app_roles.json"

PROTECTED_ROLE_IDS = frozenset({"super_admin", "admin"})


def _screens_for(role_id: str, enabled: list[str] | None = None) -> dict[str, bool]:
    if role_id in {"super_admin", "admin"}:
        return {k: True for k in ALL_SCREENS}
    base = {k: False for k in ALL_SCREENS}
    for key in enabled or []:
        if key in base:
            base[key] = True
    return base


def _default_roles() -> list[dict[str, Any]]:
    return [
        {
            "id": "super_admin",
            "name": "Super Admin",
            "description": "Acceso total al sistema",
            "color": "#C8102E",
            "screens": _screens_for("super_admin"),
            "operations": list(ALL_OPERATIONS),
            "protected": True,
        },
        {
            "id": "admin",
            "name": "Administrador",
            "description": "Administración operativa y de seguridad",
            "color": "#9f1239",
            "screens": _screens_for("admin"),
            "operations": list(ALL_OPERATIONS),
            "protected": True,
        },
        {
            "id": "rrhh",
            "name": "Recursos Humanos",
            "description": "Personal, horarios, reportes y exportes",
            "color": "#7c3aed",
            "screens": _screens_for(
                "rrhh",
                [
                    "dashboard",
                    "records",
                    "employees",
                    "collaborators",
                    "schedules",
                    "reports",
                    "advanced_reports",
                    "data_export",
                    "remote_punch",
                ],
            ),
            "operations": list(ROLE_DEFAULT_OPERATIONS["rrhh"]),
            "protected": False,
        },
        {
            "id": "ti",
            "name": "TI",
            "description": "Dispositivos, biometría, inventario y sincronización",
            "color": "#0f766e",
            "screens": _screens_for(
                "ti",
                [
                    "dashboard",
                    "records",
                    "devices",
                    "collaborators",
                    "biometric_inventory",
                    "bulk_ops",
                    "sync_history",
                    "db_records",
                ],
            ),
            "operations": list(ROLE_DEFAULT_OPERATIONS["ti"]),
            "protected": False,
        },
        {
            "id": "supervisor",
            "name": "Supervisor",
            "description": "Planta y operación diaria",
            "color": "#2563eb",
            "screens": _screens_for(
                "supervisor",
                ["dashboard", "records", "devices", "employees", "reports", "data_export", "remote_punch"],
            ),
            "operations": list(ROLE_DEFAULT_OPERATIONS["supervisor"]),
            "protected": False,
        },
        {
            "id": "consulta",
            "name": "Consulta",
            "description": "Solo lectura operativa",
            "color": "#475569",
            "screens": _screens_for("consulta", ["dashboard", "records", "devices", "employees"]),
            "operations": list(ROLE_DEFAULT_OPERATIONS["consulta"]),
            "protected": False,
        },
    ]


def _normalize_role_entry(raw: dict[str, Any]) -> dict[str, Any]:
    rid = normalize_role(raw.get("id") or raw.get("name"))
    screens_in = raw.get("screens")
    if isinstance(screens_in, list):
        screens = _screens_for(rid, [str(x) for x in screens_in])
    elif isinstance(screens_in, dict):
        screens = {k: bool(screens_in.get(k, False)) for k in ALL_SCREENS}
        if rid in {"super_admin", "admin"}:
            screens = {k: True for k in ALL_SCREENS}
    else:
        screens = _screens_for(rid)

    ops = normalize_operations(raw.get("operations"))
    if not ops:
        ops = operations_for_role(rid)

    return {
        "id": rid or "consulta",
        "name": str(raw.get("name") or rid or "Consulta"),
        "description": str(raw.get("description") or ""),
        "color": str(raw.get("color") or "#475569"),
        "screens": screens,
        "operations": ops,
        "protected": bool(raw.get("protected")) or rid in PROTECTED_ROLE_IDS,
    }


def load_roles() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ROLES_FILE.exists():
        roles = [_normalize_role_entry(r) for r in _default_roles()]
        ROLES_FILE.write_text(json.dumps(roles, indent=2, ensure_ascii=False), encoding="utf-8")
        return roles
    try:
        raw = json.loads(ROLES_FILE.read_text(encoding="utf-8"))
    except Exception:
        raw = _default_roles()
    if not isinstance(raw, list) or not raw:
        raw = _default_roles()
    roles = [_normalize_role_entry(r) for r in raw if isinstance(r, dict)]
    known = {r["id"] for r in roles}
    # Garantiza los roles base del plan aunque el JSON viejo no los tenga.
    for default in _default_roles():
        if default["id"] not in known:
            roles.append(_normalize_role_entry(default))
    return roles


def save_roles(roles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    normalized = [_normalize_role_entry(r) for r in roles]
    ROLES_FILE.write_text(json.dumps(normalized, indent=2, ensure_ascii=False), encoding="utf-8")
    return normalized


def get_role(role_id: str) -> dict[str, Any] | None:
    rid = normalize_role(role_id)
    for role in load_roles():
        if role["id"] == rid:
            return role
    return None


def upsert_role(data: dict[str, Any]) -> dict[str, Any]:
    rid = normalize_role(data.get("id") or data.get("name"))
    if not rid:
        raise ValueError("id de rol requerido")
    roles = load_roles()
    current = next((r for r in roles if r["id"] == rid), None)
    if current and current.get("protected"):
        # Un rol protegido no pierde su id ni su protección.
        data = {
            **data,
            "id": rid,
            "protected": True,
            "operations": current.get("operations") or list(ALL_OPERATIONS),
            "screens": current.get("screens"),
        }
    entry = _normalize_role_entry({**(current or {}), **data, "id": rid})
    if current:
        roles = [entry if r["id"] == rid else r for r in roles]
    else:
        roles.append(entry)
    save_roles(roles)
    return entry


def delete_role(role_id: str) -> None:
    rid = normalize_role(role_id)
    role = get_role(rid)
    if not role:
        raise ValueError("Rol no encontrado")
    if role.get("protected") or rid in PROTECTED_ROLE_IDS:
        raise ValueError("No se puede eliminar un rol protegido")
    save_roles([r for r in load_roles() if r["id"] != rid])