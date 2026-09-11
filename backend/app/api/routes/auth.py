from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.core.security import PasswordPolicyError, create_token
from app.services.app_users import authenticate, change_password, find_user, public_user
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = ""
    user: str = ""
    password: str = ""


class ChangePasswordIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=10)


@router.post("/login")
def login(body: LoginIn):
    uname = (body.username or body.user or "").strip()
    if not uname or not body.password:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    try:
        u = authenticate(uname, body.password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo leer usuarios: {e}")
    if not u:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = create_token(
        {
            "sub": u["username"],
            "role": u.get("role") or "viewer",
            "name": u.get("name") or u["username"],
        }
    )
    pub = public_user(u)
    try:
        audit(pub["username"], "login", pub["username"], {"ok": True})
    except Exception:
        pass
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": pub,
    }


@router.get("/me")
def me(user=Depends(get_current_user)):
    live = find_user(str(user.get("username") or ""))
    if not live:
        return user
    return public_user(live)


@router.post("/change-password")
def change_own_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    try:
        change_password(user["username"], body.current_password, body.new_password)
    except PasswordPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        audit(user["username"], "change_password", user["username"], {"ok": True})
    except Exception:
        pass
    return {"ok": True}
