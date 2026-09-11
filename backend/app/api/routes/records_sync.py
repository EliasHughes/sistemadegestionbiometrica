# backend/app/api/routes/records_sync.py
from fastapi import APIRouter, HTTPException, Query

from app.services.database import fetch_all, test_connection
from app.services.sync_log import append_sync, load_log

router = APIRouter()


@router.get("/sync-history")
def sync_history(limit: int = Query(150, ge=1, le=500)):
    try:
        app_items = list(reversed(load_log()))[:limit]
    except Exception:
        app_items = []
    return {
        "source": "app_sync_log",
        "count": len(app_items),
        "items": app_items,
        "columns": ["fecha", "evento", "detalle", "registros", "estado"],
    }


@router.post("/sync-now")
def sync_now():
    db = test_connection()
    if db["status"] != "online":
        append_sync("sync_manual", str(db.get("detail", "offline")), 0, "error")
        raise HTTPException(status_code=503, detail=db.get("detail", "SQL offline"))
    try:
        rows = fetch_all("SELECT COUNT(*) AS total FROM [dbo].[punches]")
        total = int(rows[0]["total"]) if rows else 0
        return append_sync("sync_manual", "Lectura BioTimeDB dbo.punches", total, "ok")
    except Exception as e:
        append_sync("sync_manual", str(e), 0, "error")
        raise HTTPException(status_code=500, detail=str(e))