from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from app.core.deps import require_permission
from app.core.safety import assert_live, preview
from pydantic import BaseModel

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
    dispositivos: list[str] | str = []
    notas: str = ""
    rfid: str = ""
    password_device: str = ""
    has_fingerprint: bool = False
    has_face: bool = False
    card_no: str | int = ""
    privilege: int | str = 0
    schedule_id: str | int = ""
    reloj_oficina: str = ""

    @classmethod
    def _as_int(cls, v, default: int = 0) -> int:
        if v is None or v == "":
            return default
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
        text = str(v).strip().lower()
        if text in ("administrador del reloj", "admin", "14"):
            return 14
        if text in ("usuario estándar en el reloj", "usuario estandar en el reloj", "user", "0"):
            return 0
        try:
            return int(float(text))
        except Exception:
            return default

    @classmethod
    def _as_str(cls, v) -> str:
        if v is None:
            return ""
        return str(v).strip()

    def model_post_init(self, __context) -> None:
        self.privilege = self._as_int(self.privilege, 0)
        self.card_no = self._as_str(self.card_no)
        self.rfid = self._as_str(self.rfid)
        self.schedule_id = self._as_str(self.schedule_id)
        if self.dispositivos is None:
            self.dispositivos = []
        elif isinstance(self.dispositivos, str):
            self.dispositivos = [self.dispositivos] if self.dispositivos.strip() else []


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
def list_collaborators(q: str = "", limit: int = 200, _user: dict = Depends(require_permission("collaborators.read"))):
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
def collab_profiles(_user: dict = Depends(require_permission("collaborators.read"))):
    return {"items": read_json(COLLAB_FILE, [])}


@router.post("/collaborator-profile")
def collab_save(body: CollabFull, _user: dict = Depends(require_permission("collaborators.write"))):
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
def collab_copy(body: CopyBody, _user: dict = Depends(require_permission("collaborators.sync"))):
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
def collaborator_detail(codigo: str, _user: dict = Depends(require_permission("collaborators.read"))):
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


@router.get("/collab-reconcile")
def collab_reconcile(
    codigo: str,
    _user: dict = Depends(require_permission("collaborators.read")),
):
    from app.services.collaborators import get_collab
    from app.services.zk_devices import inspect_user_on_device

    codigo = (codigo or "").strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="codigo requerido")

    profile = get_collab(codigo) or {"codigo": codigo, "dispositivos": []}
    assigned = [
        str(n).strip()
        for n in profile.get("dispositivos") or []
        if str(n).strip()
    ]
    oficina = str(profile.get("reloj_oficina") or "").strip()
    if oficina and oficina not in assigned:
        assigned.append(oficina)

    clocks = []
    mismatches: list[dict] = []
    for name in assigned:
        dev = _resolve_clock(name)
        if not dev:
            clocks.append({
                "device": name,
                "reachable": False,
                "found": False,
                "mode": "missing",
                "message": "Sin IP en inventario",
            })
            mismatches.append({
                "device": name,
                "code": "not_configured",
                "detail": "El reloj está en la ficha pero no tiene IP",
            })
            continue

        try:
            info = inspect_user_on_device(dev, codigo)
        except Exception as e:
            info = {
                "device": name,
                "found": False,
                "mode": "error",
                "message": str(e),
                "finger_count": 0,
                "card": None,
            }

        found = bool(info.get("found"))
        finger_count = int(info.get("finger_count") or 0)
        card_clock = str(info.get("card") or "")
        card_ficha = str(profile.get("card_no") or profile.get("rfid") or "")
        row = {
            "device": name,
            "reachable": info.get("mode") == "live",
            "found": found,
            "mode": info.get("mode"),
            "finger_count": finger_count,
            "card": card_clock,
            "message": info.get("message") or "",
        }
        clocks.append(row)

        if info.get("mode") != "live":
            mismatches.append({
                "device": name,
                "code": "offline_or_error",
                "detail": row["message"] or "Reloj no consultable",
            })
            continue

        if not found:
            mismatches.append({
                "device": name,
                "code": "missing_on_clock",
                "detail": "Está en la ficha y no en el reloj",
            })

        if profile.get("has_fingerprint") and finger_count == 0:
            mismatches.append({
                "device": name,
                "code": "fingerprint_missing",
                "detail": "La ficha marca huella y el reloj no tiene templates",
            })

        if card_ficha and card_clock and card_ficha != card_clock:
            mismatches.append({
                "device": name,
                "code": "card_mismatch",
                "detail": f"Ficha {card_ficha} / reloj {card_clock}",
            })

    ok = not any(
        m["code"] in ("missing_on_clock", "fingerprint_missing", "card_mismatch")
        for m in mismatches
    )

    return {
        "ok": ok,
        "codigo": codigo,
        "profile": {
            "nombre": profile.get("nombre") or "",
            "card_no": profile.get("card_no") or profile.get("rfid") or "",
            "has_fingerprint": bool(profile.get("has_fingerprint")),
            "has_face": bool(profile.get("has_face")),
            "dispositivos": assigned,
            "reloj_oficina": oficina,
        },
        "clocks": clocks,
        "mismatches": mismatches,
        "mismatch_count": len(mismatches),
    }


@router.post("/collaborator-delete")
def collaborator_delete(body: DeleteCollabIn, user: dict = Depends(require_permission("collaborators.write"))):
    from app.services.audit import audit
    from app.services.collaborators import delete_collab, get_collab
    from app.services.zk_devices import delete_user_on_device

    profile = get_collab(body.codigo) or {}
    clocks = list(profile.get("dispositivos") or [])

    assert_live(body.dry_run, body.confirm, "delete_collaborator")
    if body.dry_run:
        return preview(
            "delete_collaborator",
            codigo=body.codigo,
            clocks=clocks,
            remove_from_clocks=body.remove_from_clocks,
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


class ReconcileApplyIn(BaseModel):
    codigo: str
    dry_run: bool = True
    confirm: bool = False


@router.post("/collab-reconcile/apply")
def collab_reconcile_apply(
    body: ReconcileApplyIn,
    user: dict = Depends(require_permission("collaborators.sync")),
):
    from app.core.safety import assert_live, preview
    from app.services.zk_devices import clone_user

    codigo = body.codigo.strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="codigo requerido")

    rec = collab_reconcile(codigo=codigo, _user=user)
    missing = [
        m["device"]
        for m in rec.get("mismatches", [])
        if m.get("code") == "missing_on_clock"
    ]

    source_clock = None
    for c in rec.get("clocks", []):
        if c.get("reachable") and c.get("found"):
            source_clock = c.get("device")
            break

    assert_live(body.dry_run, body.confirm, "reconcile_apply")
    if body.dry_run:
        return preview(
            "reconcile_apply",
            codigo=codigo,
            missing_targets=missing,
            source_clock=source_clock,
        )

    if not missing:
        return {"ok": True, "message": "No hay relojes pendientes por sincronizar", "results": []}

    if not source_clock:
        raise HTTPException(
            status_code=400,
            detail="No se encontró un reloj origen en línea con los datos del usuario",
        )

    dev_src = _resolve_clock(source_clock)
    results = []
    for target_name in missing:
        dev_tgt = _resolve_clock(target_name)
        if not dev_tgt:
            results.append({"device": target_name, "ok": False, "error": "Sin IP en inventario"})
            continue
        try:
            res = clone_user(dev_src, dev_tgt, codigo, dry_run=False)
            results.append({"device": target_name, **res})
        except Exception as e:
            results.append({"device": target_name, "ok": False, "error": str(e)})

    return {"ok": True, "codigo": codigo, "results": results}