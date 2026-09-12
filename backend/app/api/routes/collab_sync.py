from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_permission
from app.services.collaborators import copy_to_device, delete_collab, get_collab, upsert_collab
from app.services.json_store import data_path, read_json
from app.services.zk_devices import find_device, load_devices

from app.core.safety import MutationFlags, assert_live, preview
from app.services.zk_devices import clone_user, delete_user_on_device, set_user_on_device

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
        if not dev or not str(dev.get("ip") or "").strip():
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

    return {"ok": True, "mode": "live", "results": results}


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

    results = []
    for name in dest_names:
        dst = _clock(name)
        if not dst:
            results.append({"device": name, "ok": False, "error": "sin IP"})
            continue
        try:
            res = clone_user(src, dst, codigo, dry_run=False)
            results.append({"device": name, **res})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})

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
        try:
            res = delete_user_on_device(dev, body.codigo, dry_run=False)
            results.append({"device": name, **res})
        except Exception as e:
            results.append({"device": name, "ok": False, "error": str(e)})

    if body.remove_profile:
        try:
            delete_collab(body.codigo)
        except Exception as e:
            return {"ok": False, "clocks": results, "profile_error": str(e)}

    return {"ok": True, "clocks": results}