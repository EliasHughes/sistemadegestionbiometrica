"""Diagnóstico de esquema — solo lectura y solo administradores."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import settings
from app.core.deps import require_admin
from app.services.audit import audit
from app.services.database import fetch_all, test_connection

router = APIRouter(
    prefix="/schema",
    tags=["schema"],
    dependencies=[Depends(require_admin)],
)

_MAX_PREVIEW = 50


def _assert_db() -> None:
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db.get("detail", "BD no disponible"))


def _allowed_tables() -> set[str]:
    configured = {t.lower() for t in settings.schema_allowlist}
    rows = fetch_all(
        """
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'
        """
    )
    existing = {str(r["TABLE_NAME"]) for r in rows}
    if not configured:
        return {n for n in existing if n.lower() == "punches"}
    return {n for n in existing if n.lower() in configured}


@router.get("/tables")
def list_tables(user: dict = Depends(require_admin)):
    _assert_db()
    names = sorted(_allowed_tables())
    audit(user["username"], "schema_tables", "dbo", {"count": len(names)})
    return {"count": len(names), "tables": names}


@router.get("/columns/{table_name}")
def list_columns(table_name: str, user: dict = Depends(require_admin)):
    _assert_db()
    allowed = _allowed_tables()
    if table_name not in allowed:
        raise HTTPException(status_code=400, detail="Tabla no permitida")
    rows = fetch_all(
        """
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        """,
        (table_name,),
    )
    audit(user["username"], "schema_columns", table_name, {"count": len(rows)})
    return {"table": table_name, "columns": rows}


@router.get("/preview")
def preview_table(
    table: str,
    limit: int = Query(20, ge=1, le=_MAX_PREVIEW),
    user: dict = Depends(require_admin),
):
    _assert_db()
    allowed = _allowed_tables()
    if table not in allowed:
        raise HTTPException(status_code=400, detail="Tabla no permitida")
    cols = fetch_all(
        """
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=?
        ORDER BY ORDINAL_POSITION
        """,
        (table,),
    )
    col_names = [c["COLUMN_NAME"] for c in cols]
    safe_limit = int(limit)
    rows = fetch_all(f"SELECT TOP ({safe_limit}) * FROM [dbo].[{table}]")
    audit(user["username"], "schema_preview", table, {"rows": len(rows)})
    return {"columns": col_names, "items": rows}
