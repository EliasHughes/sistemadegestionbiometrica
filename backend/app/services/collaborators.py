from datetime import datetime
from typing import Any

from app.services.json_store import data_path, read_json, write_json

FILE = data_path("collaborators.json")


def load_collabs() -> list[dict[str, Any]]:
    items = read_json(FILE, [])
    return items if isinstance(items, list) else []


def save_collabs(items: list[dict[str, Any]]) -> None:
    write_json(FILE, items)


def get_collab(codigo: str) -> dict[str, Any] | None:
    codigo = str(codigo).strip()
    for it in load_collabs():
        if str(it.get("codigo")) == codigo:
            return it
    return None


def upsert_collab(payload: dict[str, Any]) -> dict[str, Any]:
    items = load_collabs()
    codigo = str(payload.get("codigo", "")).strip()
    if not codigo:
        raise ValueError("codigo requerido")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    found = None
    for i, it in enumerate(items):
        if str(it.get("codigo")) == codigo:
            found = i
            break

    base = {
        "codigo": codigo,
        "nombre": payload.get("nombre", ""),
        "departamento": payload.get("departamento", ""),
        "cargo": payload.get("cargo", ""),
        "activo": bool(payload.get("activo", True)),
        "dispositivos": payload.get("dispositivos") or [],
        "notas": payload.get("notas", ""),
        "rfid": payload.get("rfid", ""),
        "card_no": payload.get("card_no", ""),
        "password_device": payload.get("password_device", ""),
        "has_fingerprint": bool(payload.get("has_fingerprint", False)),
        "has_face": bool(payload.get("has_face", False)),
        "fingerprint_slots": payload.get("fingerprint_slots") or [],
        "face_registered": bool(payload.get("face_registered", False)),
        "actualizado": now,
    }
    if found is None:
        base["creado"] = now
        items.append(base)
    else:
        prev = items[found]
        base["creado"] = prev.get("creado", now)
        if not payload.get("password_device") and prev.get("password_device"):
            base["password_device"] = prev.get("password_device")
        items[found] = {**prev, **base}
        base = items[found]
    save_collabs(items)
    return base


def copy_to_device(codigo: str, device: str) -> dict[str, Any]:
    items = load_collabs()
    for i, it in enumerate(items):
        if str(it.get("codigo")) == str(codigo):
            devices = list(it.get("dispositivos") or [])
            if device and device not in devices:
                devices.append(device)
            it["dispositivos"] = devices
            it["actualizado"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            items[i] = it
            save_collabs(items)
            return it
    raise ValueError("Colaborador no encontrado en ficha de app")


def set_active(codigo: str, activo: bool) -> dict[str, Any]:
    items = load_collabs()
    for i, it in enumerate(items):
        if str(it.get("codigo")) == str(codigo):
            it["activo"] = activo
            it["actualizado"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            items[i] = it
            save_collabs(items)
            return it
    raise ValueError("Colaborador no encontrado")


def delete_collab(codigo: str) -> dict[str, Any]:
    items = load_collabs()
    keep = [it for it in items if str(it.get("codigo")) != str(codigo)]
    if len(keep) == len(items):
        raise ValueError("Colaborador no encontrado")
    save_collabs(keep)
    return {"ok": True, "codigo": codigo, "deleted": True}