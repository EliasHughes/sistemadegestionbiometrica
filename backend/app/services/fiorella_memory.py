from __future__ import annotations

import json
from typing import Any

from app.services.database import execute, fetch_all


def create_conversation(
    user_id: str,
    title: str,
    active_module: str,
) -> int:
    rows = fetch_all(
        """
        INSERT INTO dbo.fiorella_conversations
        (
            user_id,
            title,
            active_module
        )
        OUTPUT INSERTED.id
        VALUES (?, ?, ?)
        """,
        (
            str(user_id),
            (title or "Conversación con Fiorella")[:300],
            (active_module or "/dashboard")[:120],
        ),
    )

    if not rows:
        raise RuntimeError(
            "No fue posible crear la conversación de Fiorella."
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
            SELECT id
            FROM dbo.fiorella_conversations
            WHERE id = ?
              AND user_id = ?
              AND is_active = 1
            """,
            (
                int(conversation_id),
                str(user_id),
            ),
        )

        if rows:
            # Actualizamos módulo por si el usuario cambió de pantalla.
            execute(
                """
                UPDATE dbo.fiorella_conversations
                SET active_module = ?,
                    updated_at = SYSUTCDATETIME()
                WHERE id = ?
                  AND user_id = ?
                """,
                (
                    (active_module or "/dashboard")[:120],
                    int(conversation_id),
                    str(user_id),
                ),
            )

            return int(rows[0]["id"])

    return create_conversation(
        user_id=user_id,
        title="Conversación con Fiorella",
        active_module=active_module,
    )


def save_message(
    conversation_id: int,
    user_id: str,
    role: str,
    content: str,
    tool_name: str | None = None,
    metadata: dict[str, Any] | None = None,
):
    execute(
        """
        INSERT INTO dbo.fiorella_messages
        (
            conversation_id,
            user_id,
            role,
            content,
            tool_name,
            metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            int(conversation_id),
            str(user_id),
            str(role)[:32],
            str(content or "")[:10000],
            tool_name[:128] if tool_name else None,
            json.dumps(
                metadata or {},
                ensure_ascii=False,
                default=str,
            ),
        ),
    )

    execute(
        """
        UPDATE dbo.fiorella_conversations
        SET updated_at = SYSUTCDATETIME()
        WHERE id = ?
          AND user_id = ?
        """,
        (
            int(conversation_id),
            str(user_id),
        ),
    )


def load_history(
    conversation_id: int,
    user_id: str,
    limit: int = 20,
) -> list[dict[str, str]]:

    safe_limit = max(
        1,
        min(int(limit or 20), 50),
    )

    rows = fetch_all(
        """
        SELECT TOP (?)
            role,
            content
        FROM dbo.fiorella_messages
        WHERE conversation_id = ?
          AND user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (
            safe_limit,
            int(conversation_id),
            str(user_id),
        ),
    )

    rows.reverse()

    return [
        {
            "role": str(row.get("role") or ""),
            "content": str(row.get("content") or ""),
        }
        for row in rows
    ]


def list_conversations(
    user_id: str,
    limit: int = 30,
):
    safe_limit = max(
        1,
        min(int(limit or 30), 100),
    )

    return fetch_all(
        """
        SELECT TOP (?)
            id,
            title,
            active_module,
            created_at,
            updated_at,
            is_active
        FROM dbo.fiorella_conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (
            safe_limit,
            str(user_id),
        ),
    )