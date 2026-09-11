"""Capa de compatibilidad. La fuente de verdad es app_users."""
from __future__ import annotations

from app.services.app_users import (  # noqa: F401
    ALL_SCREENS,
    EMPTY_SCREENS,
    USERS_FILE,
    authenticate,
    change_password,
    delete_user,
    find_user,
    list_users,
    load_users,
    public_user,
    screens_of,
    upsert_user,
)
