from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.security import (
    PasswordPolicyError,
    get_password_hash,
    is_hashed,
    validate_password_policy,
    verify_password,
)
from app.services.json_store import data_path, read_json, write_json

USERS_FILE = data_path("app_users.json")

ALL_SCREENS = [
    "dashboard",
    "records",
    "db_records",
    "remote_punch",
    "devices",
    "employees",
    "collaborators",
    "schedules",
    "biometric_inventory",
    "bulk_ops",
    "reports",
    "advanced_reports",
    "data_export",
    "sync_history",
    "users",
    "settings",
]

EMPTY_SCREENS = {k: False for k in ALL_SCREENS}


def screens_of(u: dict[str, Any] | None) -> dict[str, bool]:
    if not u:
        return dict(EMPTY_SCREENS)
    perms = u.get("permissions") or {}
    if isinstance(perms, dict) and isinstance(perms.get("screens"), dict):
        return {**EMPTY_SCREENS, **{str(k): bool(v) for k, v in perms["screens"].items()}}
    if isinstance(u.get("screens"), dict):
        return {**EMPTY_SCREENS, **{str(k): bool(v) for k, v in u["screens"].items()}}
    if isinstance(perms, list):
        out = dict(EMPTY_SCREENS)
        for k in perms:
            if k in out:
                out[k] = True
        return out
    role = str(u.get("role") or "").lower()
    if role in {"super_admin", "admin"}:
        return {k: True for k in ALL_SCREENS}
    return dict(EMPTY_SCREENS)


def _key(s: str) -> str:
    return (s or "").strip().lower()


def _bootstrap_users() -> list[dict[str, Any]]:
    password = (settings.BOOTSTRAP_ADMIN_PASSWORD or "").strip()
    username = (settings.BOOTSTRAP_ADMIN_USERNAME or "admin").strip()
    if not password:
        raise RuntimeError(
            "No existen usuarios y no hay BOOTSTRAP_ADMIN_PASSWORD. "
            "Defina esa variable de entorno para crear el primer administrador. "
            "No se crean contraseñas por defecto."
        )
    validate_password_policy(password, username)
    return [
        {
            "username": username,
            "name": settings.BOOTSTRAP_ADMIN_NAME or username,
            "role": "super_admin",
            "active": True,
            "password": get_password_hash(password),
            "must_change_password": True,
            "permissions": {"screens": {k: True for k in ALL_SCREENS}},
        }
    ]


def load_users() -> list[dict[str, Any]]:
    if not USERS_FILE.exists():
        if settings.BOOTSTRAP_ADMIN_PASSWORD:
            users = _bootstrap_users()
            write_json(USERS_FILE, users)
            return users
        return []
    users = read_json(USERS_FILE, [])
    if not users:
        if settings.BOOTSTRAP_ADMIN_PASSWORD:
            users = _bootstrap_users()
            write_json(USERS_FILE, users)
            return users
        return []
    if not isinstance(users, list):
        raise RuntimeError("app_users.json tiene un formato inválido")
    changed = False
    for u in users:
        pwd = str(u.get("password") or "")
        if pwd and not is_hashed(pwd):
            # Nunca conservar texto plano. Rehash y forzar cambio.
            u["password"] = get_password_hash(pwd)
            u["must_change_password"] = True
            changed = True
    if changed:
        write_json(USERS_FILE, users)
    return users


def save_users(users: list[dict[str, Any]]) -> None:
    write_json(USERS_FILE, users)


def list_users() -> list[dict[str, Any]]:
    return load_users()


def find_user(username: str) -> dict[str, Any] | None:
    uname = _key(username)
    if not uname:
        return None
    for u in load_users():
        if _key(str(u.get("username", ""))) == uname:
            return u
    return None


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    user = find_user(username)
    if not user or not user.get("active", True):
        return None
    if not verify_password(password, str(user.get("password") or "")):
        return None
    return user


def public_user(u: dict[str, Any]) -> dict[str, Any]:
    return {
        "username": u["username"],
        "name": u.get("name") or u["username"],
        "role": str(u.get("role") or "user").lower(),
        "active": bool(u.get("active", True)),
        "must_change_password": bool(u.get("must_change_password", False)),
        "remote": bool(u.get("remote", False)),
        "permissions": {"screens": screens_of(u)},
        "screens": screens_of(u),
    }


def upsert_user(data: dict[str, Any], password_plain: str | None = None) -> dict[str, Any]:
    username = (data.get("username") or "").strip()
    if not username:
        raise ValueError("El usuario de acceso es obligatorio")
    items = load_users()
    prev = next((u for u in items if _key(u.get("username") or "") == _key(username)), None)
    screens = data.get("screens")
    if not isinstance(screens, dict):
        screens = screens_of(prev or data)
    entry = {
        "username": username,
        "name": (data.get("name") or username).strip(),
        "role": (data.get("role") or "viewer").strip().lower(),
        "active": bool(data.get("active", True)),
        "must_change_password": bool(data.get("must_change_password", False)),
        "remote": bool(data.get("remote", False)),
        "password": (prev or {}).get("password") or "",
        "permissions": {"screens": {**EMPTY_SCREENS, **screens}},
    }
    pwd = (password_plain or "").strip()
    if pwd and pwd not in ("••••••", "******"):
        validate_password_policy(pwd, username)
        entry["password"] = get_password_hash(pwd)
    if not entry["password"]:
        raise ValueError("La contraseña es obligatoria en usuarios nuevos")
    if not is_hashed(str(entry["password"])):
        raise ValueError("No se puede persistir una contraseña sin hash")
    if prev:
        items = [entry if _key(u.get("username") or "") == _key(username) else u for u in items]
    else:
        items.append(entry)
    save_users(items)
    return public_user(entry)


def delete_user(username: str) -> None:
    k = _key(username)
    if k in {_key(settings.BOOTSTRAP_ADMIN_USERNAME), "admin"}:
        remaining = [u for u in load_users() if _key(u.get("username") or "") != k]
        admins = [u for u in remaining if str(u.get("role") or "").lower() in {"super_admin", "admin"}]
        if not admins:
            raise ValueError("No se puede eliminar el último administrador")
    save_users([u for u in load_users() if _key(u.get("username") or "") != k])


def change_password(username: str, current: str, new: str) -> None:
    user = find_user(username)
    if not user:
        raise ValueError("Usuario no encontrado")
    if not verify_password(current, str(user.get("password") or "")):
        raise ValueError("La contraseña actual no es correcta")
    validate_password_policy(new, username)
    items = load_users()
    for u in items:
        if _key(u.get("username") or "") == _key(username):
            u["password"] = get_password_hash(new)
            u["must_change_password"] = False
            break
    save_users(items)
