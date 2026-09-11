from __future__ import annotations

from typing import Any, Optional

from app.core.config import settings

try:
    import pyodbc
    PYODBC_AVAILABLE = True
except ImportError:
    pyodbc = None
    PYODBC_AVAILABLE = False


def get_connection():
    if not PYODBC_AVAILABLE:
        raise RuntimeError("pyodbc no está instalado. pip install pyodbc")
    return pyodbc.connect(settings.db_connection_string, timeout=8)


def test_connection() -> dict:
    if not PYODBC_AVAILABLE:
        return {
            "status": "offline",
            "detail": "pyodbc no instalado",
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 AS ok")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return {
            "status": "online",
            "detail": "Conectado a SQL Server",
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }
    except Exception as e:
        return {
            "status": "offline",
            "detail": str(e),
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }


def fetch_all(sql: str, params: Optional[tuple] = None) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


def execute(sql: str, params: Optional[tuple] = None) -> int:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()