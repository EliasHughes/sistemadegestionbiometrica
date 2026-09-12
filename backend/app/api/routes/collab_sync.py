from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_permission
from app.services.collaborators import copy_to_device, delete_collab, get_collab, upsert_collab
from app.services.json_store import data_path, read_json
from app.services.zk_devices import find_device, load_devices

from app.core.safety import MutationFlags, assert_live, preview
from app.services.zk_devices import clone_user, delete_user_on_device, find_device, set_user_on_device

router = APIRouter(
    prefix="/records",
    tags=["collab-zk"],
    dependencies=[Depends(require_permission("zk.read"))],
)


class PushIn(MutationFlags):
    codigo: str
    dispositivos: list[str] = []


class CloneIn(MutationFlags):
    codigo: str
    from_device: str
    to_devices: list[str] = []


class DeleteIn(MutationFlags):
    codigo: str
    dispositivos: list[str] = []
    remove_profile: bool = True


def _clock(name: str):
    name = (name or "").strip()
    if not name:
        return None
    needle = name.lower()

    def has_ip(d):
        return bool(d and str(d.get("ip") or "").strip())

    dev = find_device(name)
    if has_ip(dev):
        return dev
    for d in load_devices():
        if str(d.get("name") or "").strip().lower() == needle and has_ip(d):
            return d
    managed = read_json(data_path("managed_devices.json"), [])
    if isinstance(managed, list):
        for d in managed:
            if str(d.get("name") or "").strip().lower() == needle and has_ip(d):
                return {
                    "name": d.get("name") or name,
                    "ip": str(d.get("ip")).strip(),
                    "port": int(d.get("port") or 4370),
                    "password": d.get("comm_key") or d.get("password") or 0,
                }
    return None


def _connect(dev: dict):
    from zk import ZK

    zk = ZK(
        str(dev["ip"]).strip(),
        port=int(dev.get("port") or 4370),
        timeout=12,
        password=int(dev.get("password") or 0),
        force_udp=False,
        ommit_ping=True,
    )
    conn = zk.connect()
    try:
        conn.disable_device()
    except Exception:
        pass
    return conn


def _close(conn):
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


def _templates_of(conn, codigo: str, uid=None):
    try:
        all_t = conn.get_templates() or []
    except Exception:
        return []
    codigo = str(codigo)
    out = []
    for t in all_t:
        uid_t = getattr(t, "uid", None)
        uid_ok = uid is not None and uid_t == uid
        id_ok = str(getattr(t, "user_id", "") or "") == codigo
        if uid_ok or id_ok:
            out.append(t)
    return out


def _ensure_user(conn, codigo: str, nombre: str, password: str = "", card: int = 0, uid=None):
    users = conn.get_users() or []
    prev = next((u for u in users if str(u.user_id) == str(codigo)), None)
    use_uid = getattr(prev, "uid", None) if prev else uid
    conn.set_user(
        uid=use_uid or None,
        name=(nombre or codigo)[:24],
        privilege=0,
        password=str(password or "")[:8],
        group_id="1",
        user_id=str(codigo),
        card=int(card or 0),
    )
    users = conn.get_users() or []
    return next((u for u in users if str(u.user_id) == str(codigo)), None)


def _save_finger(conn, codigo: str, tmpl, dest_uid=None):
    fid = int(getattr(tmpl, "fid", getattr(tmpl, "finger", getattr(tmpl, "temp_id", 0))) or 0)
    blob = getattr(tmpl, "template", None) or getattr(tmpl, "mark", None)
    try:
        conn.save_user_template(user_id=str(codigo), finger_id=fid, temp_data=blob)
        return True
    except TypeError:
        pass
    try:
        conn.save_user_template(tmpl)
        return True
    except Exception:
        pass
    try:
        user = next((u for u in (conn.get_users() or []) if str(u.user_id) == str(codigo)), None)
        if user:
            conn.save_user_template(user, [tmpl])
            return True
    except Exception:
        return False
    return False


@router.post("/collab-push")
def collab_push(body: PushIn, _user: dict = Depends(require_permission("zk.push"))):
    assert_live(body.dry_run, body.confirm, "collab-push")
    if body.dry_run:
        return preview(
            "push",
            codigo=body.codigo,
            targets=body.dispositivos,
        )

    profile = get_collab(body.codigo)
    if not profile:
        raise HTTPException(status_code=404, detail="Guarda la ficha primero")
    targets = [str(n).strip() for n in (body.dispositivos or []) if str(n).strip()]
    if not targets:
        raise HTTPException(status_code=400, detail="Marca al menos un reloj")
    results = []
    for name in targets:
        try:
            copy_to_device(str(body.codigo), name)
        except Exception as e:
            results.append({"device": name, "ok": False, "error": f"ficha: {e}"})
            continue
        dev = _clock(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "sin IP / no está en inventario"})
            continue
        conn = None
        try:
            conn = _connect(dev)
            card_raw = str(profile.get("card_no") or profile.get("rfid") or "0")
            card = int(card_raw) if card_raw.isdigit() else 0
            user = _ensure_user(
                conn,
                str(profile.get("codigo")),
                profile.get("nombre") or str(profile.get("codigo")),
                profile.get("password_device") or "",
                card,
            )
            results.append(
                {
                    "device": name,
                    "ok": True,
                    "mode": "live",
                    "uid": getattr(user, "uid", None) if user else None,
                }
            )
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
        finally:
            _close(conn)
    return {"ok": True, "results": results}


@router.post("/collab-clone")
def collab_clone(body: CloneIn, _user: dict = Depends(require_permission("zk.clone"))):
    """Copia usuario + huellas + tarjeta del reloj de oficina a los de planta (igual que ponches-beta)."""
    assert_live(body.dry_run, body.confirm, "collab-clone")
    if body.dry_run:
        return preview(
            "clone",
            codigo=body.codigo,
            from_device=body.from_device,
            to_devices=body.to_devices,
        )

    codigo = str(body.codigo).strip()
    src = _clock(body.from_device)
    if not src:
        raise HTTPException(status_code=400, detail=f"Origen sin IP: {body.from_device}")
    dest_names = [str(n).strip() for n in (body.to_devices or []) if str(n).strip() and n != body.from_device]
    if not dest_names:
        raise HTTPException(status_code=400, detail="Elige al menos un reloj destino")

    src_conn = None
    try:
        src_conn = _connect(src)
        users = src_conn.get_users() or []
        src_user = next((u for u in users if str(u.user_id) == codigo), None)
        if not src_user:
            raise HTTPException(status_code=404, detail=f"{codigo} no está en {body.from_device}")
        templates = _templates_of(src_conn, codigo, getattr(src_user, "uid", None))
        snapshot = {
            "codigo": codigo,
            "nombre": (getattr(src_user, "name", None) or codigo)[:24],
            "password": getattr(src_user, "password", "") or "",
            "card": int(getattr(src_user, "card", 0) or 0),
            "privilege": int(getattr(src_user, "privilege", 0) or 0),
            "uid": getattr(src_user, "uid", None),
            "fingers": templates,
        }
    finally:
        _close(src_conn)

    try:
        copy_to_device(codigo, body.from_device)
        for n in dest_names:
            copy_to_device(codigo, n)
        upsert_collab(
            {
                "codigo": codigo,
                "nombre": snapshot["nombre"],
                "card_no": snapshot["card"],
                "password_device": snapshot["password"],
                "has_fingerprint": len(snapshot["fingers"]) > 0,
                "dispositivos": [body.from_device] + dest_names,
            }
        )
    except Exception:
        pass

    results = [
        {
            "device": body.from_device,
            "ok": True,
            "role": "source",
            "fingers_copied": len(snapshot["fingers"]),
            "fingers_source": len(snapshot["fingers"]),
        }
    ]
    for name in dest_names:
        dev = _clock(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        conn = None
        try:
            conn = _connect(dev)
            dest_user = _ensure_user(
                conn,
                codigo,
                snapshot["nombre"],
                snapshot["password"],
                snapshot["card"],
            )
            if not dest_user:
                results.append({"device": name, "ok": False, "error": "no se creó el usuario"})
                continue
            dest_uid = getattr(dest_user, "uid", None)
            copied = 0
            err = ""
            if snapshot["fingers"] and dest_uid is not None:
                for item in snapshot["fingers"]:
                    try:
                        f = _as_finger(dest_uid, item["fid"], item["blob"])
                        conn.save_user_template(dest_user, [f])
                        copied += 1
                    except Exception as e2:
                        err = f"{err} | {e2}" if err else str(e2)
            results.append(
                {
                    "device": name,
                    "ok": True,
                    "mode": "live",
                    "fingers_copied": copied,
                    "fingers_source": len(snapshot["fingers"]),
                    "finger_errors": err[:300],
                    "dest_uid": dest_uid,
                }
            )
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
        finally:
            _close(conn)

    return {"ok": True, "codigo": codigo, "results": results}


@router.post("/collab-delete-clocks")
def collab_delete_clocks(body: DeleteIn, _user: dict = Depends(require_permission("zk.delete"))):
    assert_live(body.dry_run, body.confirm, "collab-delete-clocks")
    if body.dry_run:
        return preview(
            "delete_clocks",
            codigo=body.codigo,
            targets=body.dispositivos,
        )

    profile = get_collab(body.codigo) or {}
    targets = body.dispositivos or profile.get("dispositivos") or []
    results = []
    for name in targets:
        dev = _clock(name)
        if not dev:
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        conn = None
        try:
            conn = _connect(dev)
            users = conn.get_users() or []
            target = next((u for u in users if str(u.user_id) == str(body.codigo)), None)
            if not target:
                results.append({"device": name, "ok": True, "deleted": False, "message": "no estaba"})
            else:
                try:
                    conn.delete_user(uid=getattr(target, "uid", None), user_id=str(body.codigo))
                except TypeError:
                    conn.delete_user(uid=getattr(target, "uid", None))
                results.append({"device": name, "ok": True, "deleted": True})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})
        finally:
            _close(conn)

    if body.remove_profile:
        try:
            delete_collab(body.codigo)
        except Exception as e:
            return {"ok": False, "clocks": results, "profile_error": str(e)}

    return {"ok": True, "clocks": results}