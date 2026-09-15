from __future__ import annotations

import json
from typing import Any

from app.services.database import fetch_all


def audit(
    user: dict[str, Any],
    action_type: str,
    tool_name: str | None,
    status: str,
    request_data: Any = None,
    result_data: Any = None,
    ip_address: str | None = None,
):
    fetch_all(
        """
        INSERT INTO dbo.fiorella_audit
        (user_id,user_name,role,action_type,tool_name,status,
         request_json,result_json,ip_address)
        VALUES(?,?,?,?,?,?,?,?,?)
        """,
        (
            str(user.get("id") or user.get("username") or user.get("email") or "unknown"),
            str(user.get("name") or user.get("username") or ""),
            str(user.get("role") or ""),
            action_type,
            tool_name,
            status,
            json.dumps(request_data, ensure_ascii=False, default=str) if request_data is not None else None,
            json.dumps(result_data, ensure_ascii=False, default=str) if result_data is not None else None,
            ip_address,
        ),
    )


def recent(limit: int = 50):
    return fetch_all(
        """
        SELECT TOP (?)
            id,user_id,user_name,role,action_type,tool_name,status,
            request_json,result_json,ip_address,created_at
        FROM dbo.fiorella_audit
        ORDER BY created_at DESC
        """,
        (max(1, min(limit, 200)),),
    )
