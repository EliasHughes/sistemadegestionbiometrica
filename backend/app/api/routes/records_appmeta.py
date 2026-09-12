from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_permission
from app.services.app_roles import delete_role, load_roles, upsert_role
from app.services.app_users import ALL_SCREENS
from app.core.deps import require_permission

router = APIRouter()

@router.get("/app-users")
def list_app_users(_user: dict = Depends(require_permission("users.read"))):
    from app.services.app_users import list_users, public_user

    return {"items": [public_user(u) for u in list_users()], "screens": ALL_SCREENS}


@router.post("/app-users")
def save_app_user(body: dict, _user: dict = Depends(require_permission("users.write"))):
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
                "role": body.get("role") or "consulta",
                "screens": screens,
                "operations": body.get("operations"),
                "active": body.get("active", True),
                "must_change_password": bool(body.get("must_change_password", False)),
            },
            password_plain=str(body.get("password") or ""),
        )
        return {"ok": True, "user": saved}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/app-users/{username}")
def delete_app_user(username: str, _user: dict = Depends(require_permission("users.write"))):
    from app.services.app_users import delete_user

    try:
        delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@router.get("/app-roles")
def list_app_roles(_user: dict = Depends(require_permission("roles.read"))):
    return {"items": load_roles(), "screens": ALL_SCREENS}


@router.post("/app-roles")
def save_app_role(body: dict, _user: dict = Depends(require_permission("roles.write"))):
    try:
        return upsert_role(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/app-roles/{role_id}")
def remove_app_role(role_id: str, _user: dict = Depends(require_permission("roles.write"))):
    try:
        delete_role(role_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}