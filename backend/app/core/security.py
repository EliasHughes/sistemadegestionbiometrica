from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGO = "HS256"

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

_WEAK = {
    "admin",
    "admin123",
    "1234",
    "123456",
    "password",
    "passw0rd",
    "ponches",
    "cesar",
    "iglesias",
}


class PasswordPolicyError(ValueError):
    pass


def hash_password(plain: str) -> str:
    value = (plain or "").strip()
    if not value:
        raise PasswordPolicyError("La contraseña no puede estar vacía")
    return _pwd.hash(value)


def verify_password(plain: str, stored: str) -> bool:
    stored = str(stored or "")
    if not stored or not is_hashed(stored):
        return False
    try:
        return _pwd.verify(plain or "", stored)
    except Exception:
        return False


def is_hashed(stored: str) -> bool:
    value = str(stored or "")
    return value.startswith("$2a$") or value.startswith("$2b$") or value.startswith("$2y$")


def validate_password_policy(plain: str, username: str = "") -> None:
    value = plain or ""
    if len(value) < 10:
        raise PasswordPolicyError("La contraseña debe tener al menos 10 caracteres")
    if value.lower() in _WEAK or value.lower() == (username or "").lower():
        raise PasswordPolicyError("La contraseña es demasiado predecible")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise PasswordPolicyError("La contraseña debe incluir letras y números")


def create_access_token(data: dict[str, Any], hours: int | None = None) -> str:
    minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    if hours is not None:
        minutes = int(hours * 60)
    now = datetime.now(timezone.utc)
    payload = {
        **data,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGO)


create_token = create_access_token
get_password_hash = hash_password


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGO])
    except JWTError:
        return {}
