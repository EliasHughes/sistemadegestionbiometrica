# backend/app/api/routes/records_schedules.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.database import execute, fetch_all, test_connection
from app.core.deps import require_permission

router = APIRouter()


class SchedulePayload(BaseModel):
    fields: dict


def _schedule_columns() -> list[str]:
    cols = fetch_all(
        """
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'bio_schedules'
        ORDER BY ORDINAL_POSITION
        """
    )
    return [c["COLUMN_NAME"] for c in cols]


@router.get("/schedules")
def list_schedules(_user: dict = Depends(require_permission("schedules.read"))):
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db["detail"])
    try:
        col_names = _schedule_columns()
        rows = fetch_all("SELECT * FROM [dbo].[bio_schedules]") if col_names else []
        return {
            "source_table": "dbo.bio_schedules",
            "columns": col_names,
            "count": len(rows),
            "items": rows,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedules")
def create_schedule(body: SchedulePayload, _user: dict = Depends(require_permission("schedules.write"))):
    cols = _schedule_columns()
    if not cols:
        raise HTTPException(status_code=404, detail="No existe dbo.bio_schedules")
    writable = [c for c in cols if c.lower() != "id"]
    data = {k: v for k, v in body.fields.items() if k in writable}
    if not data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para insertar")
    col_sql = ", ".join(f"[{c}]" for c in data)
    placeholders = ", ".join("?" for _ in data)
    sql = f"INSERT INTO [dbo].[bio_schedules] ({col_sql}) VALUES ({placeholders})"
    try:
        execute(sql, tuple(data.values()))
        return {"ok": True, "action": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, body: SchedulePayload, _user: dict = Depends(require_permission("schedules.write"))):
    cols = _schedule_columns()
    id_col = next((c for c in cols if c.lower() == "id"), None)
    if not id_col:
        raise HTTPException(status_code=400, detail="La tabla no tiene columna id")
    writable = [c for c in cols if c.lower() != "id"]
    data = {k: v for k, v in body.fields.items() if k in writable}
    if not data:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")
    set_sql = ", ".join(f"[{c}] = ?" for c in data)
    sql = f"UPDATE [dbo].[bio_schedules] SET {set_sql} WHERE [{id_col}] = ?"
    try:
        n = execute(sql, tuple(list(data.values()) + [schedule_id]))
        if n == 0:
            raise HTTPException(status_code=404, detail="Horario no encontrado")
        return {"ok": True, "action": "updated", "rows": n}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))