from pydantic import BaseModel, Field
from typing import Dict, Optional


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    username: str
    name: str
    role: str
    permissions: Dict[str, Dict[str, bool]]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class HealthResponse(BaseModel):
    status: str
    app: str
    env: str
    database: str = "not_connected_yet"