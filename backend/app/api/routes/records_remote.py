# backend/app/api/routes/records_remote.py
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.services.database import execute, fetch_all
from app.core.deps import require_permission
from app.core.safety import MutationFlags, assert_live, preview

router = APIRouter()


class RemotePunchIn(MutationFlags):
    codigo: str
    tipo: str = "entrada"
    comentario: str = ""
    usuario: str = ""
    dispositivo: str = "Ponche Remoto"


def _lookup_employee(codigo: str) -> dict:
    rows = fetch_all(
        """
        SELECT TOP 1 codigo, nombre, departamento
        FROM [dbo].[punches]
        WHERE codigo = ?
        ORDER BY fecha DESC
        """,
        (codigo,),
    )
    return rows[0] if rows else {"codigo": codigo, "nombre": None, "departamento": None}


@router.post("/remote-punch")
def records_remote_punch(body: RemotePunchIn, _user: dict = Depends(require_permission("remote_punch"))):
    assert_live(body.dry_run, body.confirm, "remote-punch")
    if body.dry_run:
        return preview(
            "remote-punch",
            codigo=body.codigo,
            tipo=body.tipo,
            dispositivo=body.dispositivo,
        )

    codigo = body.codigo.strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código requerido")
    tipo = body.tipo if body.tipo in ("entrada", "salida") else "entrada"
    dispositivo = (body.dispositivo or "Ponche Remoto").strip()
    emp = _lookup_employee(codigo)
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    hora = now.strftime("%H:%M:%S")
    try:
        if tipo == "entrada":
            execute(
                """
                INSERT INTO [dbo].[punches]
                    (codigo, nombre, departamento, fecha, entrada, salida, dispositivo_origen)
                VALUES (?, ?, ?, ?, ?, NULL, ?)
                """,
                (codigo, emp.get("nombre"), emp.get("departamento"), today, hora, dispositivo),
            )
        else:
            updated = execute(
                """
                UPDATE [dbo].[punches]
                SET salida = ?
                WHERE id = (
                    SELECT TOP 1 id FROM [dbo].[punches]
                    WHERE codigo = ? AND fecha = ? AND salida IS NULL
                    ORDER BY entrada DESC
                )
                """,
                (hora, codigo, today),
            )
            if not updated:
                execute(
                    """
                    INSERT INTO [dbo].[punches]
                        (codigo, nombre, departamento, fecha, entrada, salida, dispositivo_origen)
                    VALUES (?, ?, ?, ?, NULL, ?, ?)
                    """,
                    (codigo, emp.get("nombre"), emp.get("departamento"), today, hora, dispositivo),
                )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo escribir en punches: {e}")
    return {
        "status": "ok",
        "codigo": codigo,
        "nombre": emp.get("nombre"),
        "tipo": tipo,
        "fecha": today,
        "hora": hora,
        "dispositivo": dispositivo,
        "message": "Registrado en dbo.punches",
    }


@router.get("/remote-devices")
def remote_devices(_user: dict = Depends(require_permission("devices.read"))):
    try:
        rows = fetch_all(
            """
            SELECT DISTINCT LTRIM(RTRIM(dispositivo_origen)) AS dispositivo
            FROM [dbo].[punches]
            WHERE dispositivo_origen IS NOT NULL AND LTRIM(RTRIM(dispositivo_origen)) <> ''
            ORDER BY 1
            """
        )
        names = [r["dispositivo"] for r in rows]
        if "Ponche Remoto" not in names:
            names = ["Ponche Remoto"] + names
        return {"items": names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))