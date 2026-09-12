from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import require_permission
from app.core.safety import MutationFlags, assert_live, preview
from app.services.audit import audit
from app.services.collaborators import (
    copy_to_device,
    delete_collab,
    get_collab,
    load_collabs,
    set_active,
    upsert_collab,
)
from app.services.database import fetch_all, test_connection
from app.services.zk_devices import delete_user_on_device, find_device, inspect_user_on_device, set_user_on_device

router = APIRouter(
    prefix="/collaborators",
    tags=["collaborators"],
    dependencies=[Depends(require_permission("collaborators.read"))],
)


class CollabIn(BaseModel):
    codigo: str
    nombre: str = ""
    departamento: str = ""
    cargo: str = ""
    activo: bool = True
    dispositivos: list[str] = []
    notas: str = ""
    rfid: str = ""
    card_no: str = ""
    password_device: str = ""
    has_fingerprint: bool = False
    has_face: bool = False
    fingerprint_slots: list[int] = []
    face_registered: bool = False


class CopyIn(MutationFlags):
    codigo: str
    dispositivo: str


class ActiveIn(MutationFlags):
    codigo: str
    activo: bool


class DeleteIn(MutationFlags):
    codigo: str
    remove_from_clocks: bool = True


class SyncIn(MutationFlags):
    codigo: str
    dispositivos: list[str] = []


@router.get("/from-punches")
def from_punches(
    q: str = Query("", max_length=80),
    limit: int = Query(100, ge=1, le=500),
    _user: dict = Depends(require_permission("collaborators.read")),
):
    db = test_connection()
    if db["status"] != "online":
        raise HTTPException(status_code=503, detail=db["detail"])
    params: list = [int(limit)]
    where = ""
    if q.strip():
        where = "WHERE codigo LIKE ? OR ISNULL(nombre,'') LIKE ?"
        like = f"%{q.strip()}%"
        params.extend([like, like])
    sql = f"""
        SELECT TOP (?)
            codigo, MAX(nombre) AS nombre, MAX(departamento) AS departamento,
            COUNT(*) AS registros, MAX(dispositivo_origen) AS ultimo_dispositivo
        FROM [dbo].[punches]
        {where}
        GROUP BY codigo
        ORDER BY MAX(fecha) DESC
    """
    return {"items": fetch_all(sql, tuple(params))}


@router.get("/profiles")
def profiles(_user: dict = Depends(require_permission("collaborators.read"))):
    return {"items": load_collabs()}


@router.get("/detail")
def detail(codigo: str, _user: dict = Depends(require_permission("collaborators.read"))):
    profile = get_collab(codigo) or {"codigo": codigo, "dispositivos": []}
    clocks = []
    for name in profile.get("dispositivos") or []:
        dev = find_device(name)
        if not dev:
            clocks.append({"device": name, "found": False, "mode": "missing", "message": "No está en inventario o sin IP"})
            continue
        try:
            clocks.append(inspect_user_on_device(dev, codigo))
        except Exception as e:
            clocks.append({"device": name, "found": False, "mode": "error", "message": str(e)})
    return {"profile": profile, "clocks": clocks}


@router.post("/profile")
def save_profile(body: CollabIn, user: dict = Depends(require_permission("collaborators.write"))):
    try:
        entry = upsert_collab(body.model_dump())
        audit(user["username"], "save_collaborator", entry.get("codigo", ""), {})
        return entry
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/collaborator-sync")
def collaborator_sync(body: SyncIn, user: dict = Depends(require_permission("collaborators.sync"))):
    profile = get_collab(body.codigo)
    if not profile:
        raise HTTPException(status_code=404, detail="Guarda la ficha primero")

    targets = [n for n in (body.dispositivos or profile.get("dispositivos") or []) if n]
    if not targets:
        raise HTTPException(
            status_code=400,
            detail="Marca al menos un reloj. Si dice 'sin IP', ábrelo en Dispositivos y guarda la IP.",
        )

    assert_live(body.dry_run, body.confirm, "collaborator-sync")
    if body.dry_run:
        return preview("collaborator-sync", codigo=body.codigo, dispositivos=targets)

    results = []
    for name in targets:
        try:
            copy_to_device(body.codigo, name)
        except Exception as e:
            results.append({"device": name, "ok": False, "error": f"ficha: {e}"})
            continue
        dev = find_device(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "no está en inventario (Dispositivos)"})
            continue
        if not (dev.get("ip") or "").strip():
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        try:
            zk = set_user_on_device(
                dev,
                {
                    "codigo": profile.get("codigo"),
                    "nombre": profile.get("nombre"),
                    "password": profile.get("password_device") or "",
                    "card": profile.get("card_no") or profile.get("rfid") or 0,
                },
                dry_run=False,
            )
            results.append({"device": name, **zk})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})

    try:
        audit(user.get("username", "system"), "sync_collaborator", body.codigo, {"results": results})
    except Exception:
        pass

    return {"profile": get_collab(body.codigo), "results": results}


@router.post("/delete")
def remove(body: DeleteIn, user: dict = Depends(require_permission("collaborators.write"))):
    profile = get_collab(body.codigo) or {}

    assert_live(body.dry_run, body.confirm, "delete")
    if body.dry_run:
        return preview("delete", codigo=body.codigo, remove_from_clocks=body.remove_from_clocks)

    zk = []
    if body.remove_from_clocks:
        for name in profile.get("dispositivos") or []:
            dev = find_device(name)
            if dev:
                zk.append({"device": name, **delete_user_on_device(dev, body.codigo, dry_run=False)})
    try:
        deleted = delete_collab(body.codigo)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    audit(user["username"], "delete_collaborator", body.codigo, {"zk": zk})
    return {**deleted, "clocks": zk}


@router.post("/copy-device")
def copy_device(body: CopyIn, _user: dict = Depends(require_permission("collaborators.sync"))):
    assert_live(body.dry_run, body.confirm, "copy-device")
    if body.dry_run:
        return preview("copy-device", codigo=body.codigo, dispositivo=body.dispositivo)

    try:
        return copy_to_device(body.codigo, body.dispositivo.strip())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/set-active")
def active(body: ActiveIn, _user: dict = Depends(require_permission("collaborators.write"))):
    assert_live(body.dry_run, body.confirm, "set-active")
    if body.dry_run:
        return preview("set-active", codigo=body.codigo, activo=body.activo)

    try:
        return set_active(body.codigo, body.activo)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/collab-push")
def collab_push(body: SyncIn, user: dict = Depends(require_permission("zk.push"))):
    profile = get_collab(body.codigo)
    if not profile:
        raise HTTPException(status_code=404, detail="Guarda la ficha primero")
    targets = [str(n).strip() for n in (body.dispositivos or []) if str(n).strip()]
    if not targets:
        raise HTTPException(status_code=400, detail="Marca al menos un reloj")

    assert_live(body.dry_run, body.confirm, "collab-push")
    if body.dry_run:
        return preview("collab-push", codigo=body.codigo, dispositivos=targets)

    results = []
    for name in targets:
        try:
            copy_to_device(str(body.codigo), name)
        except Exception as e:
            results.append({"device": name, "ok": False, "error": f"ficha: {e}"})
            continue
        dev = find_device(name)
        if not dev or not str(dev.get("ip") or "").strip():
            results.append({"device": name, "ok": False, "error": "reloj sin IP en inventario"})
            continue
        try:
            zk = set_user_on_device(
                dev,
                {
                    "codigo": str(profile.get("codigo")),
                    "nombre": profile.get("nombre") or str(profile.get("codigo")),
                    "password": profile.get("password_device") or "",
                    "card": profile.get("card_no") or profile.get("rfid") or 0,
                },
                dry_run=False,
            )
            results.append({"device": name, **(zk if isinstance(zk, dict) else {"ok": False, "error": str(zk)})})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
    return {"ok": True, "results": results}