from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import require_role
from app.core.security import PasswordPolicyError
from app.services.app_users import delete_user, list_users, public_user, upsert_user

router = APIRouter(prefix="/users", tags=["users"])


class UserUpsert(BaseModel):
    username: str
    name: str = ""
    role: str = "viewer"
    password: str = ""
    screens: dict[str, bool] = Field(default_factory=dict)
    active: bool = True
    remote: bool = False
    must_change_password: bool = False


def _public(u: dict) -> dict:
    return public_user(u)


@router.get("")
def get_users(_=Depends(require_role("super_admin", "admin"))):
    return {"items": [_public(u) for u in list_users()]}


@router.post("")
def save_user(body: UserUpsert, _=Depends(require_role("super_admin", "admin"))):
    try:
        saved = upsert_user(body.model_dump(), password_plain=body.password)
        return {"ok": True, "user": saved}
    except PasswordPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{username}")
def remove_user(username: str, _=Depends(require_role("super_admin"))):
    try:
        delete_user(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}