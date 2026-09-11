# backend/app/api/routes/records_appmeta.py
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_admin
from app.api.routes.records_shared import ROLES_FILE, read_json, write_json

router = APIRouter()

ALL_SCREENS = [
    "dashboard", "records", "db_records", "remote_punch", "devices",
    "employees", "collaborators", "schedules", "biometric_inventory",
    "bulk_ops", "reports", "advanced_reports", "data_export",
    "sync_history", "users", "settings",
]


def _default_roles():
    return [
        {"id": "SUPER_ADMIN", "name": "Super Admin", "screens": ALL_SCREENS, "protected": True},
        {
            "id": "RRHH",
            "name": "Recursos Humanos",
            "screens": ["dashboard", "records", "employees", "collaborators", "reports", "advanced_reports", "data_export"],
            "protected": False,
        },
        {
            "id": "SUPERVISOR",
            "name": "Supervisor",
            "screens": ["dashboard", "records", "devices", "remote_punch"],
            "protected": False,
        },
    ]


@router.get("/app-users")
def list_app_users(_user: dict = Depends(require_admin)):
    from app.services.app_users import ALL_SCREENS as CANON_SCREENS
    from app.services.app_users import list_users, public_user
    return {"items": [public_user(u) for u in list_users()], "screens": CANON_SCREENS}


@router.post("/app-users")
def save_app_user(body: dict, _user: dict = Depends(require_admin)):
    from app.services.app_users import upsert_user
    username = str(body.get("username", "")).strip()
    if not username:
        raise HTTPException(status_code=400, detail="username requerido")
    screens = body.get("screens") or {}
    if isinstance(screens, list):
        screens = {k: True for k in screens}
    try:
        saved = upsert_user(
            {
                "username": username,
                "name": body.get("name") or username,
                "role": body.get("role") or "viewer",
                "screens": screens,
                "active": body.get("active", True),
                "must_change_password": bool(body.get("must_change_password", False)),
            },
            password_plain=str(body.get("password") or ""),
        )
        return {"ok": True, "user": saved}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/app-users/{username}")
def delete_app_user(username: str, _user: dict = Depends(require_admin)):
    from app.services.app_users import delete_user
    try:
        delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/app-roles")
def list_app_roles():
    return {"items": read_json(ROLES_FILE, _default_roles()), "screens": ALL_SCREENS}


@router.post("/app-roles")
def save_app_role(body: dict):
    roles = read_json(ROLES_FILE, _default_roles())
    rid = str(body.get("id") or body.get("name", "")).strip().upper().replace(" ", "_")
    if not rid:
        raise HTTPException(status_code=400, detail="id requerido")
    entry = {
        "id": rid,
        "name": body.get("name") or rid,
        "screens": body.get("screens") or {},
        "protected": bool(body.get("protected", False)),
    }
    found = False
    for i, r in enumerate(roles):
        if r.get("id") == rid:
            if r.get("protected"):
                entry["protected"] = True
            roles[i] = entry
            found = True
            break
    if not found:
        roles.append(entry)
    write_json(ROLES_FILE, roles)
    return entry