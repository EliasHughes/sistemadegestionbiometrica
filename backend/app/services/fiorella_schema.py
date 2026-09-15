from __future__ import annotations

import logging

from app.services.database import execute

log = logging.getLogger(__name__)


SCHEMA_STATEMENTS: list[str] = [

    # ============================================================
    # CONVERSACIONES
    # ============================================================
    """
    IF OBJECT_ID('dbo.fiorella_conversations', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.fiorella_conversations
        (
            id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_fiorella_conversations PRIMARY KEY,

            user_id NVARCHAR(255) NOT NULL,

            title NVARCHAR(300) NOT NULL
                CONSTRAINT DF_fiorella_conversations_title
                DEFAULT ('Conversación con Fiorella'),

            active_module NVARCHAR(120) NOT NULL
                CONSTRAINT DF_fiorella_conversations_module
                DEFAULT ('/dashboard'),

            is_active BIT NOT NULL
                CONSTRAINT DF_fiorella_conversations_active
                DEFAULT (1),

            created_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_conversations_created
                DEFAULT SYSUTCDATETIME(),

            updated_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_conversations_updated
                DEFAULT SYSUTCDATETIME()
        );
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_fiorella_conversations_user_updated'
          AND object_id = OBJECT_ID('dbo.fiorella_conversations')
    )
    BEGIN
        CREATE INDEX IX_fiorella_conversations_user_updated
            ON dbo.fiorella_conversations
            (
                user_id,
                is_active,
                updated_at DESC
            );
    END
    """,

    # ============================================================
    # MENSAJES / MEMORIA
    # ============================================================
    """
    IF OBJECT_ID('dbo.fiorella_messages', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.fiorella_messages
        (
            id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_fiorella_messages PRIMARY KEY,

            conversation_id BIGINT NOT NULL,

            user_id NVARCHAR(255) NOT NULL,

            role NVARCHAR(32) NOT NULL,

            content NVARCHAR(MAX) NOT NULL,

            tool_name NVARCHAR(128) NULL,

            metadata_json NVARCHAR(MAX) NULL,

            created_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_messages_created
                DEFAULT SYSUTCDATETIME()
        );
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_fiorella_messages_conversation'
          AND object_id = OBJECT_ID('dbo.fiorella_messages')
    )
    BEGIN
        CREATE INDEX IX_fiorella_messages_conversation
            ON dbo.fiorella_messages
            (
                conversation_id,
                user_id,
                created_at
            );
    END
    """,

    # ============================================================
    # AUDITORÍA
    # ============================================================
    """
    IF OBJECT_ID('dbo.fiorella_audit', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.fiorella_audit
        (
            id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_fiorella_audit PRIMARY KEY,

            user_id NVARCHAR(255) NOT NULL,

            user_name NVARCHAR(255) NULL,

            role NVARCHAR(100) NULL,

            action_type NVARCHAR(100) NOT NULL,

            tool_name NVARCHAR(128) NULL,

            status NVARCHAR(50) NOT NULL,

            request_json NVARCHAR(MAX) NULL,

            result_json NVARCHAR(MAX) NULL,

            ip_address NVARCHAR(64) NULL,

            created_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_audit_created
                DEFAULT SYSUTCDATETIME()
        );
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_fiorella_audit_created'
          AND object_id = OBJECT_ID('dbo.fiorella_audit')
    )
    BEGIN
        CREATE INDEX IX_fiorella_audit_created
            ON dbo.fiorella_audit(created_at DESC);
    END
    """,

    # ============================================================
    # ACCIONES PENDIENTES
    # ============================================================
    """
    IF OBJECT_ID('dbo.fiorella_pending_actions', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.fiorella_pending_actions
        (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_fiorella_pending_actions PRIMARY KEY,

            user_id NVARCHAR(255) NOT NULL,

            tool_name NVARCHAR(128) NOT NULL,

            arguments_json NVARCHAR(MAX) NOT NULL,

            preview_json NVARCHAR(MAX) NULL,

            status NVARCHAR(50) NOT NULL
                CONSTRAINT DF_fiorella_pending_status
                DEFAULT ('pending'),

            created_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_pending_created
                DEFAULT SYSUTCDATETIME(),

            expires_at DATETIME2(0) NOT NULL,

            confirmed_at DATETIME2(0) NULL
        );
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_fiorella_pending_user_status'
          AND object_id = OBJECT_ID('dbo.fiorella_pending_actions')
    )
    BEGIN
        CREATE INDEX IX_fiorella_pending_user_status
            ON dbo.fiorella_pending_actions
            (
                user_id,
                status,
                expires_at
            );
    END
    """,

    # ============================================================
    # INCIDENTES
    # ============================================================
    """
    IF OBJECT_ID('dbo.fiorella_incidents', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.fiorella_incidents
        (
            id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_fiorella_incidents PRIMARY KEY,

            fingerprint NVARCHAR(64) NOT NULL,

            severity NVARCHAR(20) NOT NULL,

            category NVARCHAR(100) NOT NULL,

            title NVARCHAR(300) NOT NULL,

            description NVARCHAR(MAX) NULL,

            data_json NVARCHAR(MAX) NULL,

            status NVARCHAR(30) NOT NULL
                CONSTRAINT DF_fiorella_incidents_status
                DEFAULT ('open'),

            first_seen_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_incidents_first_seen
                DEFAULT SYSUTCDATETIME(),

            last_seen_at DATETIME2(0) NOT NULL
                CONSTRAINT DF_fiorella_incidents_last_seen
                DEFAULT SYSUTCDATETIME(),

            resolved_at DATETIME2(0) NULL
        );
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_fiorella_incidents_fingerprint'
          AND object_id = OBJECT_ID('dbo.fiorella_incidents')
    )
    BEGIN
        CREATE UNIQUE INDEX UX_fiorella_incidents_fingerprint
            ON dbo.fiorella_incidents(fingerprint);
    END
    """,

    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_fiorella_incidents_status'
          AND object_id = OBJECT_ID('dbo.fiorella_incidents')
    )
    BEGIN
        CREATE INDEX IX_fiorella_incidents_status
            ON dbo.fiorella_incidents
            (
                status,
                severity,
                last_seen_at DESC
            );
    END
    """,
]


def ensure_fiorella_schema() -> dict:
    """
    Crea automáticamente las tablas e índices requeridos por Fiorella.

    Es seguro llamarlo en cada inicio:
    cada CREATE se protege con IF NOT EXISTS / OBJECT_ID.
    """

    completed = 0
    errors: list[str] = []

    for index, statement in enumerate(SCHEMA_STATEMENTS, start=1):
        try:
            execute(statement)
            completed += 1

        except Exception as exc:
            message = f"Fiorella schema statement {index}: {exc}"
            log.exception(message)
            errors.append(message)

    return {
        "ok": len(errors) == 0,
        "completed": completed,
        "total": len(SCHEMA_STATEMENTS),
        "errors": errors,
    }