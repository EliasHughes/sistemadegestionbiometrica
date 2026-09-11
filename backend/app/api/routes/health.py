from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.deps import get_current_user
from app.services.database import fetch_all, test_connection

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    db = test_connection()
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "database": db,
    }

@router.get("/summary")
def punches_summary(_user: dict = Depends(get_current_user)):
    """Resumen del día (solo lectura)."""
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db["detail"])

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
            WHERE fecha = CAST(GETDATE() AS date)
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

@router.get("/health/indexes")
def health_indexes():
    from app.services.sql_indexes import list_indexes, INDEXES
    current = list_indexes()
    names = {r.get("name") for r in current if r.get("name")}
    expected = [i["name"] for i in INDEXES]
    return {
        "expected": expected,
        "present": sorted(names),
        "missing": [n for n in expected if n not in names],
        "indexes": current,
    }