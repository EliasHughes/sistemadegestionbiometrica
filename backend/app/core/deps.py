from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.services.app_users import find_user, public_user

_bearer = HTTPBearer(auto_error=False)

ADMIN_ROLES = {"super_admin", "admin"}


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    x_actor: str | None = Header(default=None, alias="X-Actor"),
) -> dict:
    token = creds.credentials if creds else None
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    user = find_user(str(payload["sub"]))
    if not user or not user.get("active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
    pub = public_user(user)
    if x_actor:
        pub["actor_header"] = x_actor
    return pub


def require_role(*roles: str):
    allowed = {r.lower() for r in roles}

    def _inner(user: dict = Depends(get_current_user)) -> dict:
        role = str(user.get("role") or "").lower()
        if role in ADMIN_ROLES or role in allowed:
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")

    return _inner


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = str(user.get("role") or "").lower()
    if role not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere rol administrativo")
    return user
