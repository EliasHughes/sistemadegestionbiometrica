from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user, require_admin
from app.services.database import fetch_all, test_connection
from app.services.app_settings import load_settings
from app.services.overtime import (
    calculate_day,
    _parse_time,
    _parse_date,
    _parse_hhmm,
    NIGHT_START_DEFAULT,
    NIGHT_END_DEFAULT,
)

router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    dependencies=[Depends(get_current_user)],
)


class OvertimeRequest(BaseModel):
    codigo: str | None = None
    dispositivo: str | None = None  # <--- AGREGAR ESTA LÍNEA
    fecha_desde: str | None = None
    fecha_hasta: str | None = None
    scheduled_hours: float = 8.0
    holidays: list[str] = [] # fechas YYYY-MM-DD


# backend/app/api/routes/payroll.py
from collections import defaultdict
from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user, require_admin
from app.services.database import fetch_all, test_connection
from app.services.overtime import (
    calculate_employee_day,
    _parse_time,
    _parse_date,
    _parse_hhmm,
    NIGHT_START_DEFAULT,
    NIGHT_END_DEFAULT,
)
from app.services.app_settings import load_settings


router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    dependencies=[Depends(get_current_user)],
)


class OvertimeRequest(BaseModel):
    codigo: str | None = None
    dispositivo: str | None = None
    fecha_desde: str | None = None
    fecha_hasta: str | None = None
    scheduled_hours: float | None = None
    holidays: list[str] = []


@router.post("/overtime")
def compute_overtime(body: OvertimeRequest):
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db["detail"])

    cfg = {}
    try:
        cfg = load_settings() or {}
    except Exception:
        cfg = {}

    jornada = float(body.scheduled_hours or cfg.get("scheduled_hours") or 8)
    sabado_base = float(cfg.get("saturday_free_hours") or 4)
    night_start = _parse_hhmm(cfg.get("night_start"), NIGHT_START_DEFAULT)
    night_end = _parse_hhmm(cfg.get("night_end"), NIGHT_END_DEFAULT)

    conditions = ["entrada IS NOT NULL"]
    params: list = []
    if body.codigo and body.codigo.strip():
        conditions.append("codigo = ?")
        params.append(body.codigo.strip())
    if body.fecha_desde:
        conditions.append("CAST(fecha AS date) >= CAST(? AS date)")
        params.append(body.fecha_desde)
    if body.fecha_hasta:
        conditions.append("CAST(fecha AS date) <= CAST(? AS date)")
        params.append(body.fecha_hasta)
    if body.dispositivo and body.dispositivo.strip() and body.dispositivo != "todos":
        conditions.append("dispositivo_origen = ?")
        params.append(body.dispositivo.strip())

    where = " AND ".join(conditions)
    sql = f"""
        SELECT TOP 20000
            codigo, nombre, departamento, fecha, entrada, salida, dispositivo_origen
        FROM [dbo].[punches]
        WHERE {where}
        ORDER BY codigo, fecha, entrada
    """
    try:
        rows = fetch_all(sql, tuple(params) if params else None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"sql: {e}")

    raw_h = getattr(body, "holidays", None)
    if isinstance(raw_h, str):
        holiday_set = {x.strip()[:10] for x in raw_h.split(",") if x.strip()}
    else:
        holiday_set = {str(x).strip()[:10] for x in (raw_h or [])}

    groups: dict[tuple, list] = defaultdict(list)
    meta: dict[tuple, dict] = {}
    for r in rows:
        f = _parse_date(r.get("fecha"))
        e = _parse_time(r.get("entrada"))
        if not f or not e:
            continue
        key = (str(r.get("codigo") or ""), str(f))
        groups[key].append((e, _parse_time(r.get("salida"))))
        if key not in meta:
            meta[key] = {
                "codigo": r.get("codigo"),
                "nombre": r.get("nombre"),
                "departamento": r.get("departamento"),
                "dispositivo": r.get("dispositivo_origen"),
                "fecha": f,
            }

    results = []
    totals = {
        "worked_hours": 0.0,
        "regular_hours": 0.0,
        "extra_hours": 0.0,
        "night_hours": 0.0,
        "saturday_premium_hours": 0.0,
        "h15": 0.0,
        "h45": 0.0,
        "h100": 0.0,
        "h165": 0.0,
        "days": 0,
    }

    for key, punches in groups.items():
        info = meta[key]
        f = info["fecha"]
        entradas = [p[0] for p in punches if p[0]]
        salidas = [p[1] for p in punches if p[1]]
        if not entradas:
            continue
        entrada = min(entradas)
        salida = max(salidas) if salidas else None
        is_hol = f.isoformat() in holiday_set
        try:
            calc = calculate_day(
                fecha=f,
                entrada=entrada,
                salida=salida,
                scheduled_hours=jornada,
                is_holiday=is_hol,
                night_start=night_start,
                night_end=night_end,
                saturday_base_hours=sabado_base,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"calc {key}: {e}")
        calc["codigo"] = info["codigo"]
        calc["nombre"] = info["nombre"]
        calc["departamento"] = info["departamento"]
        calc["dispositivo"] = info["dispositivo"]
        calc["is_holiday"] = is_hol
        calc["is_sunday"] = f.weekday() == 6
        results.append(calc)
        for k in totals:
            if k == "days":
                continue
            totals[k] += float(calc.get(k) or 0)
        totals["days"] += 1

    for k, v in list(totals.items()):
        if isinstance(v, float):
            totals[k] = round(v, 2)

    return {
        "count": len(results),
        "totals": totals,
        "items": results,
        "policy": {
            "jornada": jornada,
            "saturday_base": sabado_base,
            "night_from": "18:00",
            "extra": "+45%",
            "night": "+15%",
            "sunday": "+100%",
            "saturday_after_4h": "+100%",
            "holiday": "+165%",
        },
    }

from app.services.rotating import load_rotations, save_rotations, current_schedule_for
from datetime import date as date_cls


class RotationPayload(BaseModel):
    name: str
    description: str = ""
    schedule_ids: list[int]  # ids de bio_schedules
    employee_codes: list[str] = []
    active: bool = True


@router.get("/rotations")
def list_rotations():
    items = load_rotations()
    today = date_cls.today()
    for it in items:
        it["current_schedule_id"] = current_schedule_for(it, today)
        it["iso_week"] = today.isocalendar()[1]
    return {"items": items}


@router.post("/rotations")
def upsert_rotation(body: RotationPayload, _user: dict = Depends(require_admin)):
    items = load_rotations()
    rid = body.name.strip().lower().replace(" ", "_")
    payload = {
        "id": rid,
        "name": body.name.strip(),
        "description": body.description,
        "schedule_ids": body.schedule_ids,
        "employee_codes": [c.strip() for c in body.employee_codes if c.strip()],
        "active": body.active,
    }
    found = False
    for i, it in enumerate(items):
        if it.get("id") == rid:
            items[i] = payload
            found = True
            break
    if not found:
        items.append(payload)
    save_rotations(items)
    return payload