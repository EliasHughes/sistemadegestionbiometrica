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
    """
    Crea una conexión nueva a SQL Server.

    Cada operación abre su propia conexión para evitar compartir
    conexiones/cursors entre requests concurrentes de FastAPI.
    """
    if not PYODBC_AVAILABLE:
        raise RuntimeError(
            "pyodbc no está instalado. Ejecuta: pip install pyodbc"
        )

    return pyodbc.connect(
        settings.db_connection_string,
        timeout=8,
    )


def test_connection() -> dict:
    """
    Verifica que SQL Server esté accesible.
    """
    if not PYODBC_AVAILABLE:
        return {
            "status": "offline",
            "detail": "pyodbc no instalado",
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT 1 AS ok")
        cursor.fetchone()

        return {
            "status": "online",
            "detail": "Conectado a SQL Server",
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }

    except Exception as exc:
        return {
            "status": "offline",
            "detail": str(exc),
            "database": settings.DB_NAME,
            "server": settings.DB_SERVER,
        }

    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass

        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def fetch_all(
    sql: str,
    params: Optional[tuple] = None,
) -> list[dict[str, Any]]:
    """
    Ejecuta SQL y devuelve las filas como diccionarios.

    IMPORTANTE:
    También soporta INSERT / UPDATE / DELETE / MERGE.

    Esto es necesario porque varios módulos existentes de Fiorella
    utilizan fetch_all() para escribir en SQL Server.

    Si la sentencia no devuelve columnas:
        - hace commit
        - devuelve []

    Si utiliza OUTPUT INSERTED:
        - obtiene las filas
        - hace commit
        - devuelve el resultado
    """

    conn = get_connection()
    cursor = None

    try:
        cursor = conn.cursor()

        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)

        # INSERT, UPDATE, DELETE o MERGE sin OUTPUT
        if cursor.description is None:
            conn.commit()
            return []

        columns = [column[0] for column in cursor.description]
        rows = cursor.fetchall()

        # Es importante incluso para:
        #
        # INSERT ...
        # OUTPUT INSERTED.id
        #
        # porque de lo contrario el INSERT puede quedar sin commit.
        conn.commit()

        return [
            dict(zip(columns, row))
            for row in rows
        ]

    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

        raise

    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass

        try:
            conn.close()
        except Exception:
            pass


def execute(
    sql: str,
    params: Optional[tuple] = None,
) -> int:
    """
    Ejecuta INSERT / UPDATE / DELETE / DDL.

    Devuelve cursor.rowcount.
    """

    conn = get_connection()
    cursor = None

    try:
        cursor = conn.cursor()

        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)

        rowcount = cursor.rowcount

        conn.commit()

        return rowcount

    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

        raise

    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass

        try:
            conn.close()
        except Exception:
            pass