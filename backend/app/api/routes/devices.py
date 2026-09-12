from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.safety import MutationFlags, assert_live, preview
from app.core.deps import require_permission
from app.services.audit import audit
from app.services.zk_devices import (
    clone_user,
    delete_user_on_device,
    find_device,
    inspect_user_on_device,
    list_users_on_device,
    ping_host,
    set_user_on_device,
)

router = APIRouter(
    prefix="/devices",
    tags=["devices"],
    dependencies=[Depends(require_permission("devices.read"))],
)


class DeviceUserIn(MutationFlags):
    codigo: str
    nombre: str = ""
    password: str = ""
    card: int = 0
    privilege: int = 0


class CloneIn(MutationFlags):
    codigo: str
    from_device: str
    to_device: str
    nombre: str | None = None
    move: bool = False


class EnrollIn(MutationFlags):
    codigo: str
    device: str
    tipo: str = "fingerprint"
    card: int = 0
    password: str = ""
    nombre: str = ""


@router.post("/clone-user")
def clone_device_user(
    body: CloneIn,
    user: dict = Depends(require_permission("zk.clone")),
):
    assert_live(body.dry_run, body.confirm, "clone_user")
    if body.dry_run:
        return preview(
            "clone_user",
            codigo=body.codigo,
            from_device=body.from_device,
            to_device=body.to_device,
        )
    
    src = find_device(body.from_device)
    dst = find_device(body.to_device)
    if not src:
        raise HTTPException(status_code=404, detail="Reloj origen no registrado")
    if not dst:
        raise HTTPException(status_code=404, detail="Reloj destino no registrado")
    
    result = clone_user(
        src, 
        dst, 
        body.codigo, 
        {"nombre": body.nombre} if body.nombre else {}, 
        dry_run=False
    )
    audit(
        user["username"],
        "clone_user",
        body.codigo,
        {"from": body.from_device, "to": body.to_device, "result": result},
    )
    return result


@router.post("/move-user")
def move_device_user(
    body: CloneIn,
    user: dict = Depends(require_permission("zk.move")),
):
    assert_live(body.dry_run, body.confirm, "move_user")
    if body.dry_run:
        return preview(
            "move_user",
            codigo=body.codigo,
            from_device=body.from_device,
            to_device=body.to_device,
        )
    src = find_device(body.from_device)
    dst = find_device(body.to_device)
    if not src:
        raise HTTPException(status_code=404, detail="Reloj origen no registrado")
    if not dst:
        raise HTTPException(status_code=404, detail="Reloj destino no registrado")
    
    copied = clone_user(
        src, 
        dst, 
        body.codigo, 
        {"nombre": body.nombre} if body.nombre else {}, 
        dry_run=False
    )
    deleted = None
    if copied.get("ok"):
        deleted = delete_user_on_device(src, body.codigo, dry_run=False)
        
    audit(
        user["username"],
        "move_user",
        body.codigo,
        {"from": body.from_device, "to": body.to_device, "copy": copied, "deleted": deleted},
    )
    return {
        "ok": bool(copied.get("ok")),
        "copy": copied,
        "deleted": deleted,
        "mode": copied.get("mode"),
    }


@router.post("/enroll-bio")
def enroll_bio(
    body: EnrollIn,
    user: dict = Depends(require_permission("zk.enroll")),
):
    assert_live(body.dry_run, body.confirm, "enroll_bio")
    if body.dry_run:
        return preview(
            "enroll_bio",
            codigo=body.codigo,
            device=body.device,
            tipo=body.tipo,
        )
    dest = find_device(body.device)
    if not dest:
        raise HTTPException(status_code=404, detail="Reloj no registrado")
    payload = {
        "codigo": body.codigo,
        "nombre": body.nombre,
        "password": body.password,
        "card": body.card,
    }
    result = set_user_on_device(dest, payload, dry_run=False)
    from app.services.collaborators import load_collabs, upsert_collab

    extra = {}
    if body.tipo == "fingerprint":
        extra["has_fingerprint"] = True
    if body.tipo == "face":
        extra["has_face"] = True
    if body.tipo == "card" and body.card:
        extra["card_no"] = str(body.card)
    try:
        existing = next((c for c in load_collabs() if str(c.get("codigo")) == body.codigo), {})
        upsert_collab(
            {
                **existing,
                "codigo": body.codigo,
                "nombre": body.nombre or existing.get("nombre", ""),
                **extra,
            }
        )
    except Exception:
        pass
    audit(
        user["username"],
        "enroll_bio",
        body.codigo,
        {"device": body.device, "tipo": body.tipo, "zk": result},
    )
    return {
        "ok": True,
        "tipo": body.tipo,
        "zk": result,
        "message": "Usuario escrito/encolado en el reloj. La captura física de huella/rostro se hace en el ponchador.",
    }


@router.get("/{name}/users")
def device_users(name: str, _user: dict = Depends(require_permission("zk.read"))):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado. Guárdalo primero.")
    return list_users_on_device(dev)


@router.get("/{name}/user/{codigo}")
def inspect_device_user(
    name: str,
    codigo: str,
    _user: dict = Depends(require_permission("zk.read")),
):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    return inspect_user_on_device(dev, codigo)


@router.post("/{name}/users")
def add_device_user(
    name: str,
    body: DeviceUserIn,
    user: dict = Depends(require_permission("zk.push")),
):
    assert_live(body.dry_run, body.confirm, "add_device_user")
    if body.dry_run:
        return preview(
            "add_device_user",
            device=name,
            codigo=body.codigo,
        )
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    result = set_user_on_device(dev, body.model_dump(), dry_run=False)
    audit(user["username"], "add_device_user", name, {"codigo": body.codigo, "result": result})
    return result


@router.delete("/{name}/users/{codigo}")
def remove_device_user(
    name: str,
    codigo: str,
    dry_run: bool = Query(False),
    confirm: bool = Query(False),
    user: dict = Depends(require_permission("zk.delete")),
):
    assert_live(dry_run, confirm, "remove_device_user")
    if dry_run:
        return preview(
            "remove_device_user",
            device=name,
            codigo=codigo,
        )
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    result = delete_user_on_device(dev, codigo, dry_run=False)
    audit(user["username"], "delete_device_user", name, {"codigo": codigo, "result": result})
    return result


@router.post("/{name}/test")
def test_device(name: str, _user: dict = Depends(require_permission("devices.read"))):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    ip = dev.get("ip") or ""
    return {
        "name": name,
        "ip": ip,
        "online": ping_host(ip) if ip else False,
        "port": dev.get("port", 4370),
    }