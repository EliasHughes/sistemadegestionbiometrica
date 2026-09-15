from __future__ import annotations

import json
from typing import Any

from app.services.database import fetch_all


def create_conversation(user_id: str, title: str, active_module: str) -> int:
    rows = fetch_all(
        """
        INSERT INTO dbo.fiorella_conversations(user_id,title,active_module)
        OUTPUT INSERTED.id
        VALUES(?,?,?)
        """,
        (str(user_id), title[:300], active_module[:120]),
    )
    return int(rows[0]["id"])


def get_or_create_conversation(
    user_id: str,
    conversation_id: int | None,
    active_module: str,
) -> int:
    if conversation_id:
        rows = fetch_all(
            """
            SELECT id FROM dbo.fiorella_conversations
            WHERE id=? AND user_id=? AND is_active=1
            """,
            (conversation_id, str(user_id)),
        )
        if rows:
            return int(rows[0]["id"])
    return create_conversation(user_id, "Conversación con Fiorella", active_module)


def save_message(
    conversation_id: int,
    user_id: str,
    role: str,
    content: str,
    tool_name: str | None = None,
    metadata: dict[str, Any] | None = None,
):
    fetch_all(
        """
        INSERT INTO dbo.fiorella_messages
        (conversation_id,user_id,role,content,tool_name,metadata_json)
        VALUES(?,?,?,?,?,?)
        """,
        (
            conversation_id,
            str(user_id),
            role,
            content[:10000],
            tool_name,
            json.dumps(metadata or {}, ensure_ascii=False, default=str),
        ),
    )


def load_history(conversation_id: int, user_id: str, limit: int = 20) -> list[dict[str, str]]:
    rows = fetch_all(
        """
        SELECT TOP (?) role, content
        FROM dbo.fiorella_messages
        WHERE conversation_id=? AND user_id=?
        ORDER BY created_at DESC
        """,
        (max(1, min(limit, 50)), conversation_id, str(user_id)),
    )
    rows.reverse()
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def list_conversations(user_id: str, limit: int = 30):
    return fetch_all(
        """
        SELECT TOP (?)
            id,title,active_module,created_at,updated_at,is_active
        FROM dbo.fiorella_conversations
        WHERE user_id=?
        ORDER BY updated_at DESC
        """,
        (max(1, min(limit, 100)), str(user_id)),
    )
