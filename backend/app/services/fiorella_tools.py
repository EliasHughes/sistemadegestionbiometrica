from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from app.core.permissions import has_permission
from app.services.database import execute, fetch_all, test_connection
from app.services.fiorella_audit import audit


def allowed(user: dict[str, Any], permission: str) -> bool:
    return has_permission(user, permission)


def tool_punch_summary(user: dict[str, Any]) -> dict[str, Any]:
    if not allowed(user, "attendance.read"):
        return {"ok": False, "error": "Sin permiso."}
    db = test_connection()
    if db.get("status") != "online":
        return {"ok": False, "error": "SQL Server no está disponible."}
    rows = fetch_all(
        """
        SELECT
          COUNT(*) total,
          COUNT(DISTINCT codigo) empleados,
          SUM(CASE WHEN entrada IS NOT NULL THEN 1 ELSE 0 END) entradas,
          SUM(CASE WHEN salida IS NOT NULL THEN 1 ELSE 0 END) salidas,
          SUM(CASE WHEN entrada IS NOT NULL AND salida IS NULL THEN 1 ELSE 0 END) sin_salida
        FROM dbo.punches
        WHERE CAST(fecha AS date)=CAST(GETDATE() AS date)
        """
    )
    r = rows[0] if rows else {}
    return {
        "ok": True,
        "total": int(r.get("total") or 0),
        "empleados": int(r.get("empleados") or 0),
        "entradas": int(r.get("entradas") or 0),
        "salidas": int(r.get("salidas") or 0),
        "sin_salida": int(r.get("sin_salida") or 0),
    }


def tool_search_employee(user: dict[str, Any], query: str, limit: int = 20):
    if not allowed(user, "attendance.read"):
        return {"ok": False, "error": "Sin permiso."}
    limit = max(1, min(int(limit), 100))
    q = str(query or "").strip()
    if not q:
        return {"ok": False, "error": "Falta nombre o código."}
    rows = fetch_all(
        """
        SELECT TOP (?)
          codigo, MAX(nombre) nombre, MAX(departamento) departamento,
          COUNT(*) total_registros, MAX(fecha) ultima_fecha,
          MAX(dispositivo_origen) ultimo_dispositivo
        FROM dbo.punches
        WHERE codigo LIKE ? OR ISNULL(nombre,'') LIKE ?
        GROUP BY codigo
        ORDER BY MAX(fecha) DESC
        """,
        (limit, f"%{q}%", f"%{q}%"),
    )
    return {"ok": True, "items": rows, "count": len(rows)}


def tool_search_punches(
    user: dict[str, Any],
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    dispositivo: str | None = None,
    query: str | None = None,
    limit: int = 100,
):
    if not allowed(user, "attendance.read"):
        return {"ok": False, "error": "Sin permiso."}

    limit = max(1, min(int(limit), 500))
    conditions = []
    params: list[Any] = [limit]

    if fecha_desde:
        conditions.append("fecha >= CAST(? AS date)")
        params.append(fecha_desde)
    if fecha_hasta:
        conditions.append("fecha < DATEADD(day,1,CAST(? AS date))")
        params.append(fecha_hasta)
    if dispositivo and dispositivo.lower() != "todos":
        conditions.append("LTRIM(RTRIM(dispositivo_origen))=?")
        params.append(dispositivo.strip())
    if query:
        conditions.append("(codigo LIKE ? OR ISNULL(nombre,'') LIKE ?)")
        like = f"%{query.strip()}%"
        params.extend([like, like])

    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    rows = fetch_all(
        f"""
        SELECT TOP (?) id,codigo,nombre,departamento,fecha,entrada,salida,
               dispositivo_origen,ultima_sincronizacion
        FROM dbo.punches
        {where}
        ORDER BY fecha DESC, entrada DESC
        """,
        tuple(params),
    )
    return {"ok": True, "count": len(rows), "items": rows}


def tool_device_health(user: dict[str, Any]):
    if not allowed(user, "devices.read"):
        return {"ok": False, "error": "Sin permiso."}
    try:
        from app.api.routes.records_clocks import device_health
        result = device_health.__wrapped__(user) if hasattr(device_health, "__wrapped__") else device_health(user)
    except Exception:
        # Consulta segura de respaldo: solo datos de punches.
        rows = fetch_all(
            """
            SELECT LTRIM(RTRIM(dispositivo_origen)) name,
                   COUNT(*) punches_total,
                   MAX(fecha) last_fecha
            FROM dbo.punches
            WHERE dispositivo_origen IS NOT NULL
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            ORDER BY MAX(fecha) DESC
            """
        )
        result = {"ok": True, "items": rows}
    return result


def tool_data_analysis(user: dict[str, Any], days: int = 14):
    if not allowed(user, "attendance.read"):
        return {"ok": False, "error": "Sin permiso."}
    days = max(2, min(int(days), 90))
    rows = fetch_all(
        """
        SELECT CAST(fecha AS date) dia,
               COUNT(*) total,
               COUNT(DISTINCT codigo) empleados,
               COUNT(DISTINCT dispositivo_origen) relojes,
               SUM(CASE WHEN entrada IS NOT NULL AND salida IS NULL THEN 1 ELSE 0 END) abiertos
        FROM dbo.punches
        WHERE CAST(fecha AS date) >= DATEADD(day, -?, CAST(GETDATE() AS date))
        GROUP BY CAST(fecha AS date)
        ORDER BY dia
        """,
        (days - 1,),
    )
    return {"ok": True, "days": days, "items": rows}


def tool_navigation(user: dict[str, Any], module: str):
    routes = {
        "dashboard": "/dashboard",
        "ponches": "/records",
        "records": "/records",
        "relojes": "/devices",
        "devices": "/devices",
        "colaboradores": "/collaborators",
        "collaborators": "/collaborators",
        "reportes": "/export",
        "reportes": "/export",
        "export": "/export",
    }
    key = str(module or "").strip().lower()
    if key not in routes:
        return {"ok": False, "error": "Módulo no reconocido.", "allowed": list(routes)}
    return {"ok": True, "action": "navigate", "route": routes[key]}


def create_pending_action(user: dict[str, Any], tool_name: str, args: dict[str, Any], preview_data: dict[str, Any]):
    action_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO dbo.fiorella_pending_actions
        (id,user_id,tool_name,arguments_json,preview_json,status,expires_at)
        VALUES(CAST(? AS uniqueidentifier),?,?,?,?,?,?)
        """,
        (
            action_id,
            str(user.get("id") or user.get("username") or user.get("email")),
            tool_name,
            json.dumps(args, ensure_ascii=False),
            json.dumps(preview_data, ensure_ascii=False, default=str),
            "pending",
            datetime.utcnow() + timedelta(minutes=5),
        ),
    )
    audit(user, "action_preview", tool_name, "pending", args, preview_data)
    return {
        "ok": True,
        "requires_confirmation": True,
        "action_id": action_id,
        "preview": preview_data,
        "expires_in_seconds": 300,
    }


def execute_zkteco_action(user: dict[str, Any], tool_name: str, args: dict[str, Any]):
    permission = {
        "zkteco_push_employee": "zk.push",
        "zkteco_clone_employee": "zk.clone",
        "zkteco_delete_employee": "zk.delete",
    }.get(tool_name)
    if not permission or not allowed(user, permission):
        return {"ok": False, "error": "Sin permiso para esta acción."}

    if tool_name == "zkteco_push_employee":
        from app.services.collaborators import get_collab
        profile = get_collab(str(args["codigo"]))
        if not profile:
            return {"ok": False, "error": "El colaborador no existe."}
        targets = [str(x).strip() for x in args.get("dispositivos", []) if str(x).strip()]
        if not targets:
            return {"ok": False, "error": "Debes indicar al menos un reloj."}
        preview_data = {"operation": "push", "codigo": str(args["codigo"]), "targets": targets}
        return create_pending_action(user, tool_name, args, preview_data)

    if tool_name == "zkteco_clone_employee":
        targets = [str(x).strip() for x in args.get("to_devices", []) if str(x).strip()]
        preview_data = {
            "operation": "clone",
            "codigo": str(args["codigo"]),
            "from_device": str(args["from_device"]),
            "to_devices": targets,
        }
        return create_pending_action(user, tool_name, args, preview_data)

    if tool_name == "zkteco_delete_employee":
        targets = [str(x).strip() for x in args.get("dispositivos", []) if str(x).strip()]
        preview_data = {
            "operation": "delete_clocks",
            "codigo": str(args["codigo"]),
            "targets": targets,
        }
        return create_pending_action(user, tool_name, args, preview_data)

    return {"ok": False, "error": "Herramienta no implementada."}


def confirm_action(user: dict[str, Any], action_id: str):
    rows = fetch_all(
        """
        SELECT id,tool_name,arguments_json,status,expires_at
        FROM dbo.fiorella_pending_actions
        WHERE id=CAST(? AS uniqueidentifier)
          AND user_id=?
        """,
        (action_id, str(user.get("id") or user.get("username") or user.get("email"))),
    )
    if not rows:
        return {"ok": False, "error": "Acción no encontrada."}

    row = rows[0]
    if row["status"] != "pending":
        return {"ok": False, "error": "La acción ya fue procesada."}
    if row["expires_at"] < datetime.utcnow():
        return {"ok": False, "error": "La confirmación expiró."}

    args = json.loads(row["arguments_json"])

    # Reutilizamos los endpoints/servicios reales del proyecto.
    if row["tool_name"] == "zkteco_push_employee":
        from app.services.collaborators import get_collab, copy_to_device
        profile = get_collab(str(args["codigo"]))
        results = []
        for device in args["dispositivos"]:
            try:
                results.append({
                    "device": device,
                    "result": copy_to_device(str(args["codigo"]), device),
                    "ok": True,
                })
            except Exception as exc:
                results.append({"device": device, "ok": False, "error": str(exc)})
        result = {"ok": True, "results": results}

    elif row["tool_name"] == "zkteco_clone_employee":
        from app.services.collaborators import copy_to_device
        results = []
        for device in args["to_devices"]:
            try:
                results.append({
                    "device": device,
                    "result": copy_to_device(str(args["codigo"]), device),
                    "ok": True,
                })
            except Exception as exc:
                results.append({"device": device, "ok": False, "error": str(exc)})
        result = {"ok": True, "results": results}

    elif row["tool_name"] == "zkteco_delete_employee":
        from app.services.zk_devices import delete_user_on_device, find_device
        results = []
        for device in args["dispositivos"]:
            try:
                dev = find_device(device)
                result_one = delete_user_on_device(dev, str(args["codigo"])) if dev else {"ok": False}
                results.append({"device": device, "result": result_one, "ok": True})
            except Exception as exc:
                results.append({"device": device, "ok": False, "error": str(exc)})
        result = {"ok": True, "results": results}
    else:
        result = {"ok": False, "error": "Acción no soportada."}

    status = "completed" if result.get("ok") else "failed"
    execute(
    """
    UPDATE dbo.fiorella_pending_actions
    SET
        status = ?,
        confirmed_at = SYSUTCDATETIME()
    WHERE id = CAST(? AS uniqueidentifier)
    """,
    (
        status,
        action_id,
    ),
)
    audit(user, "action_execute", row["tool_name"], status, args, result)
    return result
