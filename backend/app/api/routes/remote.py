from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.services.audit import audit
from app.services.remote_punches import add_remote, load_remote

router = APIRouter(
    prefix="/remote",
    tags=["remote"],
    dependencies=[Depends(get_current_user)],
)


class RemoteIn(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=40)
    tipo: str = "entrada"
    comentario: str = ""
    usuario: str = ""


@router.get("/history")
def history():
    return {"items": list(reversed(load_remote()))[:200]}


@router.post("/punch")
def punch(body: RemoteIn, user: dict = Depends(get_current_user)):
    codigo = body.codigo.strip()
    if not codigo:
        raise HTTPException(status_code=400, detail="Código requerido")
    tipo = body.tipo if body.tipo in ("entrada", "salida") else "entrada"
    actor = user.get("username") or body.usuario
    result = add_remote(
        {
            "codigo": codigo,
            "tipo": tipo,
            "comentario": body.comentario,
            "usuario": actor,
        }
    )
    try:
        audit(str(actor), "remote_punch", codigo, {"tipo": tipo})
    except Exception:
        pass
    return result