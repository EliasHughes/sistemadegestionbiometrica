# backend/app/api/routes/records_query.py
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.deps import require_permission

from app.services.audit import recent as load_audit
from app.services.database import fetch_all, test_connection
from app.services.sync_log import append_sync

router = APIRouter()


def _require_db():
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db["detail"])
    return db



@router.get("/recent")
def punches_recent(
    limit: int = Query(50, ge=1, le=200),
    _user: dict = Depends(require_permission("attendance.read")),
):
    require_db()
    try:
        rows = fetch_all(
            """
            SELECT TOP (?)
                id, codigo, nombre, departamento, fecha, entrada, salida,
                dispositivo_origen, ultima_sincronizacion
            FROM [dbo].[punches]
            ORDER BY fecha DESC, entrada DESC
            """,
            (int(limit),),
        )
        return {"count": len(rows), "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/columns")
def punches_columns(_user: dict = Depends(require_permission("attendance.read"))):
    _require_db()
    rows = fetch_all(
        """
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'punches'
        ORDER BY ORDINAL_POSITION
        """
    )
    return {"table": "dbo.punches", "columns": rows}


@router.get("/summary")
def punches_summary(_user: dict = Depends(require_permission("attendance.read"))):
    db = _require_db()
    try:
        today = fetch_all(
            """
            SELECT
                COUNT(*) AS total_hoy,
                SUM(CASE WHEN entrada IS NOT NULL THEN 1 ELSE 0 END) AS con_entrada,
                SUM(CASE WHEN salida IS NOT NULL THEN 1 ELSE 0 END) AS con_salida,
                COUNT(DISTINCT codigo) AS empleados_hoy,
                COUNT(DISTINCT dispositivo_origen) AS dispositivos_hoy
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(GETDATE() AS date)
            """
        )
        row = today[0] if today else {}
        return {
            "date": "today",
            "total_hoy": row.get("total_hoy") or 0,
            "con_entrada": row.get("con_entrada") or 0,
            "con_salida": row.get("con_salida") or 0,
            "empleados_hoy": row.get("empleados_hoy") or 0,
            "dispositivos_hoy": row.get("dispositivos_hoy") or 0,
            "database": db,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ops-overview")
def ops_overview(_user: dict = Depends(require_permission("attendance.read"))):
    empty = {
        "today": {"total": 0, "empleados": 0, "relojes": 0, "sin_salida": 0},
        "yesterday": {"total": 0, "empleados": 0},
        "open_shifts": [],
        "by_dept": [],
        "sql_online": False,
    }
    db = test_connection()
    if db.get("status") != "online":
        empty["error"] = db.get("detail", "SQL offline")
        return empty

    try:
        today = fetch_all(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(DISTINCT codigo) AS empleados,
                COUNT(DISTINCT dispositivo_origen) AS relojes,
                SUM(CASE WHEN entrada IS NOT NULL AND salida IS NULL THEN 1 ELSE 0 END) AS sin_salida
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(GETDATE() AS date)
            """
        )
        t = today[0] if today else {}
        yesterday = fetch_all(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(DISTINCT codigo) AS empleados
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(DATEADD(day, -1, GETDATE()) AS date)
            """
        )
        y = yesterday[0] if yesterday else {}
        open_shifts = fetch_all(
            """
            SELECT TOP 20
                codigo,
                nombre,
                dispositivo_origen,
                CONVERT(varchar(8), entrada, 108) AS entrada
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(GETDATE() AS date)
              AND entrada IS NOT NULL
              AND salida IS NULL
            ORDER BY entrada DESC
            """
        )
        by_dept = fetch_all(
            """
            SELECT TOP 12
                ISNULL(NULLIF(LTRIM(RTRIM(departamento)), ''), 'Sin departamento') AS depto,
                COUNT(*) AS total
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(GETDATE() AS date)
            GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(departamento)), ''), 'Sin departamento')
            ORDER BY COUNT(*) DESC
            """
        )
        return {
            "today": {
                "total": int(t.get("total") or 0),
                "empleados": int(t.get("empleados") or 0),
                "relojes": int(t.get("relojes") or 0),
                "sin_salida": int(t.get("sin_salida") or 0),
            },
            "yesterday": {
                "total": int(y.get("total") or 0),
                "empleados": int(y.get("empleados") or 0),
            },
            "open_shifts": open_shifts or [],
            "by_dept": by_dept or [],
            "sql_online": True,
        }
    except Exception as e:
        empty["error"] = str(e)
        return empty


@router.get("/devices")
def punches_devices(_user: dict = Depends(require_permission("attendance.read"))):
    _require_db()
    try:
        rows = fetch_all(
            """
            SELECT
                LTRIM(RTRIM(dispositivo_origen)) AS dispositivo,
                COUNT(*) AS total_registros,
                COUNT(DISTINCT codigo) AS empleados,
                MAX(fecha) AS ultima_fecha
            FROM [dbo].[punches]
            WHERE dispositivo_origen IS NOT NULL
              AND LTRIM(RTRIM(dispositivo_origen)) <> ''
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            ORDER BY total_registros DESC
            """
        )
        return {"count": len(rows), "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/employees")
def punches_employees(
    q: str = Query("", max_length=80),
    limit: int = Query(100, ge=1, le=500),
    _user: dict = Depends(require_permission("attendance.read")),
):
    _require_db()
    try:
        if q.strip():
            rows = fetch_all(
                """
                SELECT TOP (?)
                    codigo, MAX(nombre) AS nombre, MAX(departamento) AS departamento,
                    COUNT(*) AS total_registros, MAX(fecha) AS ultima_fecha,
                    MAX(dispositivo_origen) AS ultimo_dispositivo
                FROM [dbo].[punches]
                WHERE codigo LIKE ? OR ISNULL(nombre, '') LIKE ?
                GROUP BY codigo
                ORDER BY MAX(fecha) DESC, codigo
                """,
                (limit, f"%{q.strip()}%", f"%{q.strip()}%"),
            )
        else:
            rows = fetch_all(
                """
                SELECT TOP (?)
                    codigo, MAX(nombre) AS nombre, MAX(departamento) AS departamento,
                    COUNT(*) AS total_registros, MAX(fecha) AS ultima_fecha,
                    MAX(dispositivo_origen) AS ultimo_dispositivo
                FROM [dbo].[punches]
                GROUP BY codigo
                ORDER BY MAX(fecha) DESC, codigo
                """,
                (limit,),
            )
        return {"count": len(rows), "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
def search_punches(
    limit: int = Query(100, ge=1, le=500),
    fecha: str | None = Query(None),
    dispositivo: str | None = Query(None),
    q: str = Query("", max_length=80),
):
    _require_db()
    conditions: list[str] = []
    params: list = [int(limit)]
    if fecha:
        conditions.append("CAST(fecha AS date) = CAST(? AS date)")
        params.append(fecha)
    if dispositivo and dispositivo.strip().lower() != "todos":
        conditions.append("LTRIM(RTRIM(dispositivo_origen)) = ?")
        params.append(dispositivo.strip())
    if q.strip():
        conditions.append("(codigo LIKE ? OR ISNULL(nombre, '') LIKE ?)")
        like = f"%{q.strip()}%"
        params.extend([like, like])
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT TOP (?)
            id, codigo, nombre, departamento, fecha, entrada, salida,
            dispositivo_origen, ultima_sincronizacion
        FROM [dbo].[punches]
        {where}
        ORDER BY fecha DESC, entrada DESC
    """
    try:
        rows = fetch_all(sql, tuple(params))
        try:
            append_sync("consulta_ponches", "Filtro pantalla Ponches", len(rows), "ok")
        except Exception:
            pass
        return {"count": len(rows), "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
def punches_stats(_user: dict = Depends(require_permission("attendance.read"))):
    empty = {"by_device": [], "by_day": [], "by_hour": [], "activity": []}
    db = test_connection()
    if db.get("status") != "online":
        empty["error"] = db.get("detail", "SQL offline")
        return empty

    try:
        by_device = fetch_all(
            """
            SELECT TOP 20
                LTRIM(RTRIM(dispositivo_origen)) AS name, COUNT(*) AS total
            FROM [dbo].[punches]
            WHERE dispositivo_origen IS NOT NULL AND LTRIM(RTRIM(dispositivo_origen)) <> ''
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            ORDER BY COUNT(*) DESC
            """
        )
    except Exception:
        by_device = []

    try:
        by_day = fetch_all(
            """
            SELECT CONVERT(varchar(10), CAST(fecha AS date), 23) AS dia, COUNT(*) AS total
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) >= DATEADD(day, -13, CAST(GETDATE() AS date))
            GROUP BY CAST(fecha AS date)
            ORDER BY CAST(fecha AS date)
            """
        )
    except Exception:
        by_day = []

    try:
        by_hour = fetch_all(
            """
            SELECT DATEPART(HOUR, CAST(entrada AS datetime)) AS hora, COUNT(*) AS total
            FROM [dbo].[punches]
            WHERE CAST(fecha AS date) = CAST(GETDATE() AS date) AND entrada IS NOT NULL
            GROUP BY DATEPART(HOUR, CAST(entrada AS datetime))
            ORDER BY hora
            """
        )
    except Exception:
        by_hour = []

    try:
        activity = load_audit(40)
    except Exception:
        activity = []

    return {
        "by_device": [{"name": r.get("name") or "—", "total": int(r.get("total") or 0)} for r in by_device],
        "by_day": [{"dia": str(r.get("dia") or ""), "total": int(r.get("total") or 0)} for r in by_day],
        "by_hour": [{"hora": int(r.get("hora") or 0), "total": int(r.get("total") or 0)} for r in by_hour],
        "activity": activity,
    }