# backend/app/api/routes/records_clocks.py
import re
import subprocess
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.services.database import fetch_all
from app.api.routes.records_shared import DEVICES_FILE, DeviceIn, read_json, write_json
from app.core.deps import require_permission

from app.core.safety import assert_live, preview
from app.services.zk_devices import clone_user, delete_user_on_device, find_device, set_user_on_device

router = APIRouter()


class ClockPushIn(BaseModel):
    codigo: str
    dispositivos: list[str] = []
    dry_run: bool = True
    confirm: bool = False


class ClockCloneIn(BaseModel):
    codigo: str
    from_device: str
    to_devices: list[str] = []
    dry_run: bool = True
    confirm: bool = False


class ClockDeleteIn(BaseModel):
    codigo: str
    dispositivos: list[str] = []
    remove_profile: bool = True
    dry_run: bool = True
    confirm: bool = False


def _ping_ms(ip: str, timeout_ms: int = 800) -> dict:
    ip = (ip or "").strip()
    if not ip:
        return {"online": False, "latency_ms": None}
    t0 = time.perf_counter()
    try:
        r = subprocess.run(
            ["ping", "-n", "1", "-w", str(timeout_ms), ip],
            capture_output=True,
            text=True,
            timeout=2,
        )
        elapsed = int((time.perf_counter() - t0) * 1000)
        text = (r.stdout or "") + (r.stderr or "")
        m = re.search(r"(?:tiempo|time)[=<]\s*(\d+)\s*ms", text, re.I)
        ms = int(m.group(1)) if m else elapsed
        ok = r.returncode == 0
        return {"online": ok, "latency_ms": ms if ok else None}
    except Exception:
        return {"online": False, "latency_ms": None}


def _clock_row(name: str):
    name = (name or "").strip()
    if not name:
        return None
    needle = name.lower()
    try:
        from app.services.zk_devices import find_device, load_devices
        d = find_device(name)
        if d and str(d.get("ip") or "").strip():
            return d
        for x in load_devices():
            if str(x.get("name") or "").strip().lower() == needle and x.get("ip"):
                return x
    except Exception:
        pass
    try:
        for x in read_json(DEVICES_FILE, []):
            if str(x.get("name") or "").strip().lower() == needle and x.get("ip"):
                return {
                    "name": x.get("name") or name,
                    "ip": x.get("ip"),
                    "port": int(x.get("port") or 4370),
                    "password": x.get("password") or x.get("comm_key") or 0,
                }
    except Exception:
        pass
    return None


def _zk_open(dev: dict):
    from zk import ZK
    conn = ZK(
        str(dev["ip"]).strip(),
        port=int(dev.get("port") or 4370),
        timeout=12,
        password=int(dev.get("password") or 0),
        force_udp=False,
        ommit_ping=True,
    ).connect()
    try:
        conn.disable_device()
    except Exception:
        pass
    return conn


def _zk_close(conn):
    if not conn:
        return
    try:
        conn.enable_device()
    except Exception:
        pass
    try:
        conn.disconnect()
    except Exception:
        pass


def _zk_upsert(conn, codigo: str, nombre: str, password: str = "", card: int = 0, privilege: int = 0):
    users = conn.get_users() or []
    prev = next((u for u in users if str(u.user_id) == str(codigo)), None)
    conn.set_user(
        uid=getattr(prev, "uid", None) if prev else None,
        name=(nombre or codigo)[:24],
        privilege=int(privilege or 0),
        password=str(password or "")[:8],
        group_id="",
        user_id=str(codigo),
        card=int(card or 0),
    )
    users = conn.get_users() or []
    return next((u for u in users if str(u.user_id) == str(codigo)), None)


def _finger_id(t) -> int:
    for attr in ("fid", "finger_id", "finger", "temp_id", "id"):
        v = getattr(t, attr, None)
        if v is not None and str(v).strip() != "":
            try:
                return int(v)
            except Exception:
                continue
    return 0


def _finger_blob(t):
    blob = getattr(t, "template", None)
    if blob in (None, b"", ""):
        blob = getattr(t, "mark", None)
    if isinstance(blob, str):
        blob = blob.encode("latin-1", errors="ignore")
    return blob


def _as_finger(uid: int, fid: int, blob: bytes):
    from zk.finger import Finger
    return Finger(int(uid), int(fid), 1, blob)


def _read_fingers(conn, codigo: str, uid=None) -> list[dict]:
    out: list[dict] = []
    seen = set()
    try:
        tpls = conn.get_templates() or []
    except Exception:
        tpls = []
    codigo = str(codigo)
    for t in tpls:
        uid_t = getattr(t, "uid", None)
        id_t = str(getattr(t, "user_id", "") or "")
        if not ((uid is not None and uid_t == uid) or id_t == codigo):
            continue
        fid = _finger_id(t)
        blob = _finger_blob(t)
        if not blob or fid in seen:
            continue
        seen.add(fid)
        out.append({"fid": fid, "blob": blob, "size": len(blob)})
    if not out and uid is not None:
        for fid in range(10):
            try:
                t = conn.get_user_template(uid=int(uid), temp_id=fid)
            except Exception:
                t = None
            if not t:
                continue
            blob = _finger_blob(t)
            if blob and fid not in seen:
                seen.add(fid)
                out.append({"fid": fid, "blob": blob, "size": len(blob)})
    return out


@router.get("/managed-devices")
def managed_devices(_user: dict = Depends(require_permission("devices.read"))):
    saved = {d.get("name"): d for d in read_json(DEVICES_FILE, []) if d.get("name")}
    try:
        live = fetch_all(
            """
            SELECT
                LTRIM(RTRIM(dispositivo_origen)) AS name,
                COUNT(*) AS punches
            FROM [dbo].[punches]
            WHERE dispositivo_origen IS NOT NULL
              AND LTRIM(RTRIM(dispositivo_origen)) <> ''
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            """
        )
    except Exception:
        live = []

    items = []
    seen = set()
    for row in live:
        name = row["name"]
        extra = saved.get(name, {})
        ip = extra.get("ip") or ""
        ping = _ping_ms(ip) if ip else {"online": False, "latency_ms": None}
        items.append({
            "name": name,
            "punches": row.get("punches", 0),
            "ip": ip,
            "port": extra.get("port", 4370),
            "model": extra.get("model", ""),
            "location": extra.get("location", ""),
            "notes": extra.get("notes", ""),
            "active": extra.get("active", True),
            "online": ping["online"],
            "latency_ms": ping["latency_ms"],
        })
        seen.add(name)

    for name, extra in saved.items():
        if name in seen:
            continue
        ip = extra.get("ip") or ""
        ping = _ping_ms(ip) if ip else {"online": False, "latency_ms": None}
        items.append({
            "name": name,
            "punches": 0,
            "ip": ip,
            "port": extra.get("port", 4370),
            "model": extra.get("model", ""),
            "location": extra.get("location", ""),
            "notes": extra.get("notes", ""),
            "active": extra.get("active", True),
            "online": ping["online"],
            "latency_ms": ping["latency_ms"],
        })
    return {"items": items}


@router.post("/managed-devices")
def save_managed_device(body: DeviceIn, _user: dict = Depends(require_permission("devices.write"))):
    items = read_json(DEVICES_FILE, [])
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    entry = body.model_dump()
    entry["name"] = name
    for i, d in enumerate(items):
        if d.get("name") == name:
            items[i] = entry
            write_json(DEVICES_FILE, items)
            return entry
    items.append(entry)
    write_json(DEVICES_FILE, items)
    return entry


@router.get("/device-health")
def device_health(_user: dict = Depends(require_permission("devices.read"))):
    saved = {d.get("name"): d for d in read_json(DEVICES_FILE, []) if d.get("name")}
    try:
        live = fetch_all(
            """
            SELECT
                LTRIM(RTRIM(dispositivo_origen)) AS name,
                COUNT(*) AS punches_total,
                SUM(CASE WHEN CAST(fecha AS date) = CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS punches_today,
                MAX(fecha) AS last_fecha,
                MAX(entrada) AS last_entrada
            FROM [dbo].[punches]
            WHERE dispositivo_origen IS NOT NULL
              AND LTRIM(RTRIM(dispositivo_origen)) <> ''
            GROUP BY LTRIM(RTRIM(dispositivo_origen))
            """
        )
    except Exception:
        live = []

    by_name = {row["name"]: row for row in live}
    names = list(dict.fromkeys([*by_name.keys(), *saved.keys()]))
    items = []
    online_n = 0
    for name in names:
        extra = saved.get(name, {})
        row = by_name.get(name, {})
        ip = extra.get("ip") or ""
        ping = _ping_ms(ip) if ip else {"online": False, "latency_ms": None}
        if ping.get("online"):
            online_n += 1
        items.append({
            "name": name,
            "ip": ip,
            "port": extra.get("port", 4370),
            "location": extra.get("location", ""),
            "model": extra.get("model", ""),
            "active": extra.get("active", True),
            "online": ping.get("online"),
            "latency_ms": ping.get("latency_ms"),
            "punches_total": int(row.get("punches_total") or 0),
            "punches_today": int(row.get("punches_today") or 0),
            "last_fecha": str(row.get("last_fecha") or ""),
            "last_entrada": str(row.get("last_entrada") or ""),
            "configured": bool(ip),
        })
    items.sort(key=lambda x: (not x["online"], x["name"] or ""))
    return {
        "ok": True,
        "total": len(items),
        "online": online_n,
        "offline": len(items) - online_n,
        "items": items,
    }


@router.post("/collab-push")
def collab_push_now(body: ClockPushIn, _user: dict = Depends(require_permission("zk.push"))):
    from app.services.collaborators import copy_to_device, get_collab

    profile = get_collab(body.codigo)
    if not profile:
        raise HTTPException(status_code=404, detail="Guarda la ficha primero")
    targets = [str(n).strip() for n in (body.dispositivos or []) if str(n).strip()]
    if not targets:
        raise HTTPException(status_code=400, detail="Marca al menos un reloj")

    assert_live(body.dry_run, body.confirm, "collab-push")
    if body.dry_run:
        return preview("push", codigo=body.codigo, targets=targets)

    results = []
    payload = {
        "codigo": str(profile.get("codigo")),
        "nombre": profile.get("nombre") or str(profile.get("codigo")),
        "password": str(profile.get("password_device") or profile.get("password") or "")[:8],
        "card": int(str(profile.get("card_no") or profile.get("rfid") or "0") or 0)
        if str(profile.get("card_no") or profile.get("rfid") or "0").isdigit()
        else 0,
        "privilege": int(profile.get("privilege") or 0),
    }
    for name in targets:
        dev = find_device(name) or _clock_row(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "reloj sin IP"})
            continue
        try:
            results.append({"device": name, **set_user_on_device(dev, payload, dry_run=False)})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
    return {"ok": True, "mode": "live", "results": results}


@router.post("/collab-clone")
def collab_clone_now(body: ClockCloneIn, _user: dict = Depends(require_permission("zk.clone"))):
    from app.services.collaborators import copy_to_device, get_collab, upsert_collab

    codigo = str(body.codigo).strip()
    src = _clock_row(body.from_device)
    if not src:
        raise HTTPException(status_code=400, detail="Reloj origen sin IP")
    dests = [n.strip() for n in (body.to_devices or []) if n.strip() and n.strip() != body.from_device]
    if not dests:
        raise HTTPException(status_code=400, detail="Marca relojes destino")

    assert_live(body.dry_run, body.confirm, "collab-clone")
    if body.dry_run:
        return preview(
            "clone",
            codigo=codigo,
            from_device=body.from_device,
            to_devices=dests,
        )

    profile = get_collab(codigo) or {}
    src_conn = None
    try:
        src_conn = _zk_open(src)
        users = src_conn.get_users() or []
        su = next((u for u in users if str(u.user_id) == codigo), None)
        if not su:
            raise HTTPException(status_code=404, detail=f"{codigo} no está en el reloj origen")
        fingers = _read_fingers(src_conn, codigo, getattr(su, "uid", None))
        clock_pwd = str(getattr(su, "password", "") or "")
        form_pwd = str(profile.get("password_device") or profile.get("password") or "")
        snap = {
            "nombre": (getattr(su, "name", None) or profile.get("nombre") or codigo)[:24],
            "password": (clock_pwd or form_pwd)[:8],
            "card": int(getattr(su, "card", 0) or 0),
            "privilege": int(getattr(su, "privilege", 0) or profile.get("privilege") or 0),
            "fingers": fingers,
        }
    finally:
        _zk_close(src_conn)

    try:
        copy_to_device(codigo, body.from_device)
        for n in dests:
            copy_to_device(codigo, n)
        upsert_collab(
            {
                "codigo": codigo,
                "nombre": snap["nombre"],
                "card_no": snap["card"],
                "password_device": snap["password"],
                "has_fingerprint": len(snap["fingers"]) > 0,
                "dispositivos": list({body.from_device, *dests}),
            }
        )
    except Exception:
        pass

    results = [
        {
            "device": body.from_device,
            "ok": True,
            "role": "source",
            "fingers_copied": len(snap["fingers"]),
            "fingers_source": len(snap["fingers"]),
        }
    ]
    for name in dests:
        dev = _clock_row(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        conn = None
        try:
            conn = _zk_open(dev)
            dest_user = _zk_upsert(conn, codigo, snap["nombre"], snap["password"], snap["card"], snap["privilege"])
            if dest_user is None:
                results.append({"device": name, "ok": False, "error": "no se creó el usuario"})
                continue
            dest_uid = int(getattr(dest_user, "uid"))
            fingers = [
                _as_finger(dest_uid, item["fid"], item["blob"])
                for item in snap["fingers"]
                if item.get("blob")
            ]
            copied = 0
            err = ""
            try:
                if fingers:
                    conn.save_user_template(dest_user, fingers)
                    copied = len(fingers)
            except Exception as e:
                err = str(e)
                copied = 0
                for f in fingers:
                    try:
                        conn.save_user_template(dest_user, [f])
                        copied += 1
                    except Exception as e2:
                        err = f"{err} | {e2}"
            results.append(
                {
                    "device": name,
                    "ok": True,
                    "mode": "live",
                    "fingers_copied": copied,
                    "fingers_source": len(snap["fingers"]),
                    "finger_errors": err[:300],
                    "dest_uid": dest_uid,
                }
            )
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
        finally:
            _zk_close(conn)
            
    return {"ok": True, "mode": "live", "results": results}


@router.post("/collab-delete-clocks")
def collab_delete_now(body: ClockDeleteIn, _user: dict = Depends(require_permission("zk.delete"))):
    from app.services.collaborators import delete_collab, get_collab

    profile = get_collab(body.codigo) or {}
    targets = [
        str(n).strip()
        for n in (body.dispositivos or profile.get("dispositivos") or [])
        if str(n).strip()
    ]

    assert_live(body.dry_run, body.confirm, "collab-delete-clocks")
    if body.dry_run:
        return preview(
            "delete_clocks",
            codigo=body.codigo,
            targets=targets,
            remove_profile=body.remove_profile,
        )

    results = []
    for name in targets:
        dev = _clock_row(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        conn = None
        try:
            conn = _zk_open(dev)
            users = conn.get_users() or []
            target = next((u for u in users if str(u.user_id) == str(body.codigo)), None)
            if not target:
                results.append({"device": name, "ok": True, "deleted": False})
            else:
                try:
                    conn.delete_user(uid=getattr(target, "uid", None), user_id=str(body.codigo))
                except TypeError:
                    conn.delete_user(uid=getattr(target, "uid", None))
                results.append({"device": name, "ok": True, "deleted": True})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
        finally:
            _zk_close(conn)
    if body.remove_profile:
        try:
            delete_collab(body.codigo)
        except Exception:
            pass
    return {"ok": True, "mode": "live", "clocks": results}