"""Catálogo de permisos por operación."""
from __future__ import annotations

from typing import Any, Iterable

ALL_OPERATIONS: tuple[str, ...] = (
    "users.read",
    "users.write",
    "users.delete",
    "roles.read",
    "roles.write",
    "attendance.read",
    "reports.export",
    "payroll.run",
    "remote_punch",
    "schema.admin",
    "settings.write",
    "collaborators.read",
    "collaborators.write",
    "collaborators.sync",
    "schedules.read",
    "schedules.write",
    "inventory.read",
    "inventory.write",
    "bulk.execute",
    "devices.read",
    "devices.write",
    "devices.delete",
    "zk.read",
    "zk.clone",
    "zk.move",
    "zk.enroll",
    "zk.delete",
    "zk.push",
    "zk.sync",
)

ADMIN_ROLES = frozenset({"super_admin", "admin"})

ROLE_DEFAULT_OPERATIONS: dict[str, tuple[str, ...]] = {
    "super_admin": ALL_OPERATIONS,
    "admin": ALL_OPERATIONS,
    "rrhh": (
        "attendance.read",
        "reports.export",
        "payroll.run",
        "collaborators.read",
        "collaborators.write",
        "collaborators.sync",
        "schedules.read",
        "schedules.write",
        "remote_punch",
    ),
    "ti": (
        "attendance.read",
        "devices.read",
        "devices.write",
        "devices.delete",
        "inventory.read",
        "inventory.write",
        "zk.read",
        "zk.clone",
        "zk.move",
        "zk.enroll",
        "zk.delete",
        "zk.push",
        "zk.sync",
        "collaborators.read",
        "collaborators.sync",
        "bulk.execute",
    ),
    "supervisor": (
        "attendance.read",
        "reports.export",
        "collaborators.read",
        "schedules.read",
        "devices.read",
        "zk.read",
        "remote_punch",
    ),
    "consulta": (
        "attendance.read",
        "collaborators.read",
        "schedules.read",
        "devices.read",
        "zk.read",
    ),
    "coordinador": (
        "attendance.read",
        "collaborators.read",
        "schedules.read",
        "devices.read",
        "zk.read",
    ),
    "viewer": ("attendance.read",),
}


def normalize_role(role: Any) -> str:
    return str(role or "").strip().lower()


def normalize_operations(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, Iterable):
        return []
    allowed = set(ALL_OPERATIONS)
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        key = str(item or "").strip()
        if key in allowed and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def operations_for_role(role: Any) -> list[str]:
    key = normalize_role(role)
    if key in ADMIN_ROLES:
        return list(ALL_OPERATIONS)
    return list(ROLE_DEFAULT_OPERATIONS.get(key, ROLE_DEFAULT_OPERATIONS["consulta"]))


def resolve_operations(user: dict[str, Any] | None) -> list[str]:
    if not user:
        return []
    role = normalize_role(user.get("role"))
    if role in ADMIN_ROLES:
        return list(ALL_OPERATIONS)

    perms = user.get("permissions") if isinstance(user.get("permissions"), dict) else {}
    override = normalize_operations(perms.get("operations") if perms else None)
    if override:
        return override

    direct = normalize_operations(user.get("operations"))
    if direct:
        return direct

    return operations_for_role(role)


def has_permission(user: dict[str, Any] | None, *operations: str) -> bool:
    if not user or not operations:
        return False
    owned = set(resolve_operations(user))
    needed = normalize_operations(operations)
    if not needed:
        return False
    return set(needed).issubset(owned)