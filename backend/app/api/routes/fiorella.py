# backend/app/api/routes/fiorella.py
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.fiorella_agent import procesar_mensaje_usuario, iniciar_sesion_proactiva

router = APIRouter(tags=["fiorella"])

class FiorellaChatPayload(BaseModel):
    user_id: str
    user_name: str
    message: str
    active_module: str = "/dashboard"

class FiorellaInitPayload(BaseModel):
    user_id: str
    user_name: str
    active_module: str = "/dashboard"

@router.post("/chat")
async def chat_with_fiorella(payload: FiorellaChatPayload):
    # 'await' obligatorio para evitar el error de corrutina
    return await procesar_mensaje_usuario(
        user_id=payload.user_id,
        user_name=payload.user_name,
        message=payload.message,
        active_module=payload.active_module
    )

@router.post("/init")
async def init_fiorella(payload: FiorellaInitPayload):
    return await iniciar_sesion_proactiva(
        user_id=payload.user_id,
        user_name=payload.user_name,
        active_module=payload.active_module
    )