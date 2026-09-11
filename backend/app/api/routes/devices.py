from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
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
    dependencies=[Depends(get_current_user)],
)


class DeviceUserIn(BaseModel):
    codigo: str
    nombre: str = ""
    password: str = ""
    card: int = 0
    privilege: int = 0


class CloneIn(BaseModel):
    codigo: str
    from_device: str
    to_device: str
    nombre: str | None = None
    move: bool = False


class EnrollIn(BaseModel):
    codigo: str
    device: str
    tipo: str = "fingerprint"
    card: int = 0
    password: str = ""
    nombre: str = ""


@router.post("/clone-user")
def clone_device_user(body: CloneIn, user: dict = Depends(get_current_user)):
    src = find_device(body.from_device)
    dst = find_device(body.to_device)
    if not src:
        raise HTTPException(status_code=404, detail="Reloj origen no registrado")
    if not dst:
        raise HTTPException(status_code=404, detail="Reloj destino no registrado")
    result = clone_user(src, dst, body.codigo, {"nombre": body.nombre} if body.nombre else {})
    audit(
        user["username"],
        "clone_user",
        body.codigo,
        {"from": body.from_device, "to": body.to_device, "result": result},
    )
    return result


@router.post("/move-user")
def move_device_user(body: CloneIn, user: dict = Depends(get_current_user)):
    src = find_device(body.from_device)
    dst = find_device(body.to_device)
    if not src:
        raise HTTPException(status_code=404, detail="Reloj origen no registrado")
    if not dst:
        raise HTTPException(status_code=404, detail="Reloj destino no registrado")
    copied = clone_user(src, dst, body.codigo, {"nombre": body.nombre} if body.nombre else {})
    deleted = None
    if copied.get("ok"):
        deleted = delete_user_on_device(src, body.codigo)
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
def enroll_bio(body: EnrollIn, user: dict = Depends(get_current_user)):
    dest = find_device(body.device)
    if not dest:
        raise HTTPException(status_code=404, detail="Reloj no registrado")
    payload = {
        "codigo": body.codigo,
        "nombre": body.nombre,
        "password": body.password,
        "card": body.card,
    }
    result = set_user_on_device(dest, payload)
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
def device_users(name: str, _user: dict = Depends(get_current_user)):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado. Guárdalo primero.")
    return list_users_on_device(dev)


@router.get("/{name}/user/{codigo}")
def inspect_device_user(name: str, codigo: str, _user: dict = Depends(get_current_user)):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    return inspect_user_on_device(dev, codigo)


@router.post("/{name}/users")
def add_device_user(name: str, body: DeviceUserIn, user: dict = Depends(get_current_user)):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    result = set_user_on_device(dev, body.model_dump())
    audit(user["username"], "add_device_user", name, {"codigo": body.codigo, "result": result})
    return result


@router.delete("/{name}/users/{codigo}")
def remove_device_user(name: str, codigo: str, user: dict = Depends(get_current_user)):
    dev = find_device(name)
    if not dev:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    result = delete_user_on_device(dev, codigo)
    audit(user["username"], "delete_device_user", name, {"codigo": codigo, "result": result})
    return result


@router.post("/{name}/test")
def test_device(name: str, _user: dict = Depends(get_current_user)):
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