# backend/app/api/routes/records.py
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.api.routes.records_query import router as query_router
from app.api.routes.records_sync import router as sync_router
from app.api.routes.records_schedules import router as schedules_router
from app.api.routes.records_remote import router as remote_router
from app.api.routes.records_appmeta import router as appmeta_router
from app.api.routes.records_inventory import router as inventory_router
from app.api.routes.records_collab import router as collab_router
from app.api.routes.records_clocks import router as clocks_router

router = APIRouter(
    prefix="/records",
    tags=["records"],
    dependencies=[Depends(get_current_user)],
)

router.include_router(query_router)
router.include_router(sync_router)
router.include_router(schedules_router)
router.include_router(remote_router)
router.include_router(appmeta_router)
router.include_router(inventory_router)
router.include_router(collab_router)
router.include_router(clocks_router)