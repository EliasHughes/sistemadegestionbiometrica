from __future__ import annotations

import json
from typing import Any

from app.services.database import execute, fetch_all


def audit(
    user: dict[str, Any],
    action_type: str,
    tool_name: str | None,
    status: str,
    request_data: Any = None,
    result_data: Any = None,
    ip_address: str | None = None,
):
    """
    Registra las acciones realizadas por Fiorella.

    La auditoría no usa fetch_all porque no necesita recuperar filas.
    """

    execute(
        """
        INSERT INTO dbo.fiorella_audit
        (
            user_id,
            user_name,
            role,
            action_type,
            tool_name,
            status,
            request_json,
            result_json,
            ip_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(
                user.get("id")
                or user.get("username")
                or user.get("email")
                or "unknown"
            ),
            str(
                user.get("name")
                or user.get("nombre")
                or user.get("username")
                or ""
            ),
            str(user.get("role") or ""),
            str(action_type or "")[:100],
            tool_name[:128] if tool_name else None,
            str(status or "")[:50],
            (
                json.dumps(
                    request_data,
                    ensure_ascii=False,
                    default=str,
                )
                if request_data is not None
                else None
            ),
            (
                json.dumps(
                    result_data,
                    ensure_ascii=False,
                    default=str,
                )
                if result_data is not None
                else None
            ),
            ip_address[:64] if ip_address else None,
        ),
    )


def recent(limit: int = 50):
    safe_limit = max(
        1,
        min(int(limit or 50), 200),
    )

    return fetch_all(
        """
        SELECT TOP (?)
            id,
            user_id,
            user_name,
            role,
            action_type,
            tool_name,
            status,
            request_json,
            result_json,
            ip_address,
            created_at
        FROM dbo.fiorella_audit
        ORDER BY created_at DESC
        """,
        (safe_limit,),
    )