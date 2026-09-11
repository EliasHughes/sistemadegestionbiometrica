# backend/app/api/routes/records_collab.py
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.services.database import fetch_all
from app.api.routes.records_shared import COLLAB_FILE, DEVICES_FILE, read_json, write_json

router = APIRouter()


class CollabFull(BaseModel):
    model_config = {"extra": "ignore"}
    codigo: str
    nombre: str = ""
    departamento: str = ""
    cargo: str = ""
    activo: bool = True
    dispositivos: list[str] = []
    notas: str = ""
    rfid: str = ""
    password_device: str = ""
    has_fingerprint: bool = False
    has_face: bool = False
    card_no: str = ""
    privilege: int = 0
    schedule_id: str = ""
    reloj_oficina: str = ""


class CopyBody(BaseModel):
    codigo: str
    dispositivo: str = ""


class DeleteCollabIn(BaseModel):
    codigo: str
    remove_from_clocks: bool = True
    dry_run: bool = True
    confirm: bool = False


def _resolve_clock(name: str) -> dict | None:
    name = (name or "").strip()
    if not name:
        return None
    try:
        from app.services.zk_devices import find_device, load_devices
        dev = find_device(name)
        if dev and str(dev.get("ip") or "").strip():
            return dev
        for d in load_devices():
            if str(d.get("name", "")).strip().lower() == name.lower() and d.get("ip"):
                return d
    except Exception:
        pass
    for d in read_json(DEVICES_FILE, []):
        if str(d.get("name", "")).strip().lower() == name.lower() and d.get("ip"):
            return {
                "name": d.get("name") or name,
                "ip": d.get("ip"),
                "port": int(d.get("port") or 4370),
                "password": d.get("password") or d.get("comm_key") or 0,
            }
    return None


@router.get("/collaborators")
def list_collaborators(q: str = "", limit: int = 200):
    qn = q.strip()
    rows = []
    try:
        params: list = [int(limit)]
        where = ""
        if qn:
            where = "WHERE codigo LIKE ? OR ISNULL(nombre,'') LIKE ?"
            like = f"%{qn}%"
            params.extend([like, like])
        rows = fetch_all(
            f"""
            SELECT TOP (?)
                codigo,
                MAX(nombre) AS nombre,
                MAX(departamento) AS departamento,
                COUNT(*) AS registros,
                MAX(dispositivo_origen) AS ultimo_dispositivo
            FROM [dbo].[punches]
            {where}
            GROUP BY codigo
            ORDER BY MAX(fecha) DESC
            """,
            tuple(params),
        )
    except Exception:
        rows = []

    profiles = read_json(COLLAB_FILE, [])
    by_code: dict = {}
    for r in rows:
        code = str(r.get("codigo") or "").strip()
        if not code:
            continue
        by_code[code] = {
            "codigo": code,
            "nombre": r.get("nombre") or f"NN-{code}",
            "departamento": r.get("departamento") or "",
            "reloj": r.get("ultimo_dispositivo") or "",
            "ultimo_dispositivo": r.get("ultimo_dispositivo") or "",
            "registros": r.get("registros") or 0,
            "fuente": "sql",
        }

    for p in profiles:
        if not isinstance(p, dict):
            continue
        code = str(p.get("codigo") or "").strip()
        if not code:
            continue
        nombre_app = (p.get("nombre") or "").strip()
        if qn and code not in by_code:
            blob = f"{code} {nombre_app}".lower()
            if qn.lower() not in blob:
                continue
        deps = p.get("dispositivos") or []
        reloj = deps[0] if deps else ""
        if code in by_code:
            if nombre_app:
                by_code[code]["nombre"] = nombre_app
            if p.get("departamento"):
                by_code[code]["departamento"] = p.get("departamento")
            if reloj:
                by_code[code]["reloj"] = reloj
                by_code[code]["ultimo_dispositivo"] = reloj
            by_code[code]["fuente"] = "app+sql"
            by_code[code]["activo"] = bool(p.get("activo", True))
        else:
            by_code[code] = {
                "codigo": code,
                "nombre": nombre_app or f"NN-{code}",
                "departamento": p.get("departamento") or "",
                "reloj": reloj,
                "ultimo_dispositivo": reloj,
                "registros": 0,
                "fuente": "app",
                "activo": bool(p.get("activo", True)),
            }

    items = list(by_code.values())
    items.sort(key=lambda x: str(x.get("codigo") or ""))
    return {"items": items[: int(limit)]}


@router.get("/collaborator-profiles")
def collab_profiles():
    return {"items": read_json(COLLAB_FILE, [])}


@router.post("/collaborator-profile")
def collab_save(body: CollabFull):
    items = read_json(COLLAB_FILE, [])
    codigo = body.codigo.strip()
    entry = body.model_dump()
    entry["codigo"] = codigo
    entry["actualizado"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for i, it in enumerate(items):
        if str(it.get("codigo")) == codigo:
            items[i] = {**it, **entry}
            write_json(COLLAB_FILE, items)
            return items[i]
    entry["creado"] = entry["actualizado"]
    items.append(entry)
    write_json(COLLAB_FILE, items)
    return entry


@router.post("/collaborator-copy")
def collab_copy(body: CopyBody):
    codigo = body.codigo.strip()
    device = body.dispositivo.strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código requerido")
    items = read_json(COLLAB_FILE, [])
    found = None
    for it in items:
        if str(it.get("codigo")) == codigo:
            found = it
            break
    if not found:
        found = {"codigo": codigo, "dispositivos": []}
        items.append(found)
    deps = list(found.get("dispositivos") or [])
    if device and device not in deps:
        deps.append(device)
    found["dispositivos"] = deps
    found["actualizado"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    write_json(COLLAB_FILE, items)
    return found


@router.get("/collaborator-detail")
def collaborator_detail(codigo: str, _user: dict = Depends(get_current_user)):
    from app.services.collaborators import get_collab
    from app.services.zk_devices import inspect_user_on_device

    profile = get_collab(codigo) or {"codigo": codigo, "dispositivos": []}
    clocks = []
    for name in profile.get("dispositivos") or []:
        dev = _resolve_clock(name)
        if not dev:
            clocks.append({
                "device": name,
                "found": False,
                "mode": "missing",
                "finger_count": 0,
                "fingers": [],
                "message": "No está en inventario. Guarda este reloj en Dispositivos con IP.",
            })
            continue
        try:
            clocks.append(inspect_user_on_device(dev, codigo))
        except Exception as e:
            clocks.append({
                "device": name,
                "found": False,
                "mode": "error",
                "finger_count": 0,
                "fingers": [],
                "message": str(e),
            })
    return {"profile": profile, "clocks": clocks}


@router.post("/collaborator-delete")
def collaborator_delete(body: DeleteCollabIn, user: dict = Depends(get_current_user)):
    from app.services.audit import audit
    from app.services.collaborators import delete_collab, get_collab
    from app.services.zk_devices import delete_user_on_device

    profile = get_collab(body.codigo) or {}
    clocks = list(profile.get("dispositivos") or [])

    if body.dry_run:
        return {
            "ok": True,
            "mode": "dry_run",
            "would": "delete_collaborator",
            "codigo": body.codigo,
            "clocks": clocks,
            "remove_from_clocks": body.remove_from_clocks,
        }
    if not body.confirm:
        raise HTTPException(
            status_code=409,
            detail="Operación live bloqueada. Envía dry_run=false y confirm=true.",
        )

    zk = []
    if body.remove_from_clocks:
        for name in clocks:
            dev = _resolve_clock(name)
            if not dev:
                zk.append({"device": name, "ok": False, "error": "reloj no encontrado"})
                continue
            try:
                zk.append({"device": name, **delete_user_on_device(dev, body.codigo, dry_run=False)})
            except Exception as e:
                zk.append({"device": name, "ok": False, "error": str(e)})
    deleted = delete_collab(body.codigo)
    try:
        audit(user.get("username", "system"), "delete_collaborator", body.codigo, {"zk": zk})
    except Exception:
        pass
    return {**deleted, "clocks": zk}