# backend/app/services/zk_devices.py
from __future__ import annotations

import platform
import subprocess
from datetime import datetime
from typing import Any

from app.services.json_store import data_path, read_json, write_json

DEVICES_FILE = data_path("devices_inventory.json")
QUEUE_FILE = data_path("zk_pending_ops.json")

try:
    from zk import ZK
    ZK_AVAILABLE = True
except Exception:
    ZK = None
    ZK_AVAILABLE = False


def load_devices() -> list[dict[str, Any]]:
    items = read_json(DEVICES_FILE, [])
    return items if isinstance(items, list) else []


def save_devices(items: list[dict[str, Any]]) -> None:
    write_json(DEVICES_FILE, items)


def upsert_device(entry: dict[str, Any]) -> dict[str, Any]:
    name = (entry.get("name") or "").strip()
    if not name:
        raise ValueError("Nombre requerido")
    items = load_devices()
    entry = {**entry, "name": name, "updated": _now()}
    for i, d in enumerate(items):
        if d.get("name") == name:
            items[i] = {**d, **entry}
            save_devices(items)
            return items[i]
    entry["created"] = entry["updated"]
    items.append(entry)
    save_devices(items)
    return entry


def delete_device(name: str) -> None:
    items = [d for d in load_devices() if d.get("name") != name]
    save_devices(items)


def find_device(name: str) -> dict[str, Any] | None:
    for d in load_devices():
        if d.get("name") == name:
            return d
    return None


def ping_host(ip: str, timeout_ms: int = 1000) -> bool:
    ip = (ip or "").strip()
    if not ip:
        return False
    try:
        if platform.system().lower().startswith("win"):
            cmd = ["ping", "-n", "1", "-w", str(timeout_ms), ip]
        else:
            sec = max(1, int(timeout_ms / 1000) or 1)
            cmd = ["ping", "-c", "1", "-W", str(sec), ip]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
        return r.returncode == 0
    except Exception:
        return False


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _queue(op: dict[str, Any]) -> dict[str, Any]:
    items = read_json(QUEUE_FILE, [])
    if not isinstance(items, list):
        items = []
    op = {**op, "queued_at": _now(), "status": "pending"}
    items.append(op)
    write_json(QUEUE_FILE, items[-1000:])
    return op


def _connect(device: dict[str, Any], timeout: int = 8):
    if not ZK_AVAILABLE:
        raise RuntimeError("SDK pyzk no instalado")
    ip = (device.get("ip") or "").strip()
    if not ip:
        raise RuntimeError("El reloj no tiene IP")
    port = int(device.get("port") or 4370)
    password = int(device.get("password") or device.get("comm_key") or 0)
    zk = ZK(ip, port=port, timeout=timeout, password=password, force_udp=False, ommit_ping=False)
    return zk.connect()


def list_users_on_device(device: dict[str, Any]) -> dict[str, Any]:
    if not device.get("ip") or not ZK_AVAILABLE:
        return {
            "mode": "degraded",
            "online": ping_host(device.get("ip") or ""),
            "zk_available": ZK_AVAILABLE,
            "items": [],
            "message": "Sin SDK o sin IP: no se listan usuarios físicos",
        }
    conn = None
    try:
        conn = _connect(device)
        conn.disable_device()
        users = conn.get_users() or []
        items = []
        for u in users:
            items.append(
                {
                    "user_id": str(getattr(u, "user_id", "")),
                    "uid": getattr(u, "uid", 0),
                    "name": (getattr(u, "name", "") or "").strip(),
                    "privilege": getattr(u, "privilege", 0),
                    "card": int(getattr(u, "card", 0) or 0),
                    "group_id": str(getattr(u, "group_id", "") or ""),
                }
            )
        return {"mode": "live", "online": True, "zk_available": True, "items": items, "count": len(items)}
    except Exception as e:
        return {
            "mode": "error",
            "online": ping_host(device.get("ip") or ""),
            "zk_available": ZK_AVAILABLE,
            "items": [],
            "message": str(e),
        }
    finally:
        if conn is not None:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass


def set_user_on_device(
    device: dict[str, Any], payload: dict[str, Any], dry_run: bool = True
) -> dict[str, Any]:
    codigo = str(payload.get("codigo") or payload.get("user_id") or "").strip()
    if not codigo:
        raise ValueError("Código requerido")
    name = (payload.get("nombre") or payload.get("name") or codigo).strip()
    password = str(payload.get("password") or payload.get("password_device") or "")
    raw_card = str(payload.get("card") or payload.get("card_no") or "0")
    card = int(raw_card) if raw_card.isdigit() else 0

    if dry_run:
        return {
            "ok": True,
            "mode": "dry_run",
            "would": "set_user",
            "device": device.get("name"),
            "ip": device.get("ip"),
            "codigo": codigo,
            "nombre": name,
        }

    if not ZK_AVAILABLE or not device.get("ip"):
        queued = _queue({"op": "set_user", "device": device.get("name"), "codigo": codigo, "nombre": name})
        return {"ok": True, "mode": "queued", "queued": queued}

    conn = None
    try:
        conn = _connect(device, timeout=12)
        conn.disable_device()
        conn.set_user(
            uid=int(payload.get("uid") or 0) or None,
            name=name[:24],
            privilege=int(payload.get("privilege") or 0),
            password=password,
            group_id=str(payload.get("group_id") or "1"),
            user_id=codigo,
            card=card,
        )
        return {"ok": True, "mode": "live", "codigo": codigo, "device": device.get("name")}
    except Exception as e:
        queued = _queue({"op": "set_user", "device": device.get("name"), "codigo": codigo, "error": str(e)})
        return {"ok": False, "mode": "queued_on_error", "error": str(e), "queued": queued}
    finally:
        if conn is not None:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass


def delete_user_on_device(device: dict[str, Any], codigo: str, dry_run: bool = True) -> dict[str, Any]:
    if dry_run:
        return {
            "ok": True,
            "mode": "dry_run",
            "would": "delete_user",
            "device": device.get("name"),
            "ip": device.get("ip"),
            "codigo": str(codigo),
        }

    if not ZK_AVAILABLE or not device.get("ip"):
        return {
            "ok": True,
            "mode": "queued",
            "queued": _queue({"op": "delete_user", "device": device.get("name"), "codigo": codigo}),
        }

    conn = None
    try:
        conn = _connect(device)
        conn.disable_device()
        users = conn.get_users() or []
        target = next((u for u in users if str(u.user_id) == str(codigo)), None)
        if not target:
            return {"ok": True, "mode": "live", "deleted": False, "message": "No estaba en el reloj"}
        try:
            conn.delete_user(uid=getattr(target, "uid", None), user_id=str(codigo))
        except TypeError:
            conn.delete_user(uid=getattr(target, "uid", None))
        return {"ok": True, "mode": "live", "deleted": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        if conn is not None:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass


def clone_user(
    source: dict[str, Any],
    dest: dict[str, Any],
    codigo: str,
    override: dict | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    override = override or {}
    if dry_run:
        return {
            "ok": True,
            "mode": "dry_run",
            "would": "clone_user",
            "codigo": codigo,
            "from": source.get("name"),
            "to": dest.get("name"),
        }
    if not ZK_AVAILABLE:
        queued = _queue(
            {"op": "clone_user", "from": source.get("name"), "to": dest.get("name"), "codigo": codigo}
        )
        return {"ok": True, "mode": "queued", "queued": queued, "migration": True}

    conn_src = None
    info = None
    try:
        conn_src = _connect(source, timeout=12)
        conn_src.disable_device()
        users = conn_src.get_users() or []
        u = next((x for x in users if str(x.user_id) == str(codigo)), None)
        if not u:
            raise ValueError(f"Usuario {codigo} no existe en {source.get('name')}")
        info = {
            "user_id": str(u.user_id),
            "name": override.get("nombre") or (u.name or ""),
            "privilege": getattr(u, "privilege", 0) or 0,
            "password": override.get("password") or getattr(u, "password", "") or "",
            "group_id": str(getattr(u, "group_id", "1") or "1"),
            "card": int(override.get("card") or getattr(u, "card", 0) or 0),
            "fingers": [],
        }
        try:
            templates = conn_src.get_templates() or []
            uid = getattr(u, "uid", None)
            info["fingers"] = [t for t in templates if getattr(t, "uid", None) == uid]
        except Exception:
            pass
    finally:
        if conn_src is not None:
            try:
                conn_src.enable_device()
            except Exception:
                pass
            try:
                conn_src.disconnect()
            except Exception:
                pass

    conn_dst = None
    try:
        conn_dst = _connect(dest, timeout=15)
        conn_dst.disable_device()
        conn_dst.set_user(
            name=(info["name"] or codigo)[:24],
            privilege=info["privilege"],
            password=info["password"],
            group_id=info["group_id"],
            user_id=info["user_id"],
            card=info["card"],
        )
        copied = ["user", "password", "card"]
        if info.get("fingers"):
            try:
                for t in info["fingers"]:
                    conn_dst.save_user_template(t)
                copied.append("fingerprints")
            except Exception:
                copied.append("fingerprints_failed")
        return {
            "ok": True,
            "mode": "live",
            "migration": True,
            "codigo": codigo,
            "from": source.get("name"),
            "to": dest.get("name"),
            "credentials_copied": copied,
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "mode": "live"}
    finally:
        if conn_dst is not None:
            try:
                conn_dst.enable_device()
            except Exception:
                pass
            try:
                conn_dst.disconnect()
            except Exception:
                pass


FINGER_LABELS = {
    0: "Pulgar derecho",
    1: "Índice derecho",
    2: "Medio derecho",
    3: "Anular derecho",
    4: "Meñique derecho",
    5: "Pulgar izquierdo",
    6: "Índice izquierdo",
    7: "Medio izquierdo",
    8: "Anular izquierdo",
    9: "Meñique izquierdo",
}


def inspect_user_on_device(device: dict[str, Any], codigo: str) -> dict[str, Any]:
    listed = list_users_on_device(device)
    user = next((u for u in listed.get("items") or [] if str(u.get("user_id")) == str(codigo)), None)
    result = {
        "device": device.get("name"),
        "codigo": str(codigo),
        "mode": listed.get("mode"),
        "found": bool(user),
        "user": user,
        "fingers": [],
        "finger_count": 0,
        "has_card": bool(user and int(user.get("card") or 0) > 0),
        "card": int(user.get("card") or 0) if user else 0,
        "message": listed.get("message") or "",
    }
    if listed.get("mode") != "live" or not user:
        return result
    conn = None
    try:
        conn = _connect(device)
        conn.disable_device()
        templates = conn.get_templates() or []
        uid = user.get("uid")
        fingers = []
        for t in templates:
            if getattr(t, "uid", None) == uid:
                fid = int(getattr(t, "fid", getattr(t, "finger", -1)) or -1)
                fingers.append({"fid": fid, "label": FINGER_LABELS.get(fid, f"Huella {fid}")})
        result["fingers"] = fingers
        result["finger_count"] = len(fingers)
    except Exception as e:
        result["message"] = str(e)
    finally:
        if conn is not None:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass
    return result