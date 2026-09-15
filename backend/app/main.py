# backend/app/main.py
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth as auth_api
from app.api.routes import exports, health, payroll, records, schema
from app.api.routes import users as users_api
from app.api.settings import router as settings_router
from app.core.config import settings
from app.core.errors import RequestIdMiddleware, register_exception_handlers
from app.api.routes import fiorella

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("poche")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.services.sql_indexes import ensure_indexes
        result = ensure_indexes()
        log.info(
            "índices SQL: %s created=%s existing=%s",
            result.get("status"),
            result.get("created"),
            result.get("existing"),
        )
    except Exception as exc:
        log.warning("ensure_indexes falló: %s", exc)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=settings.cors_methods_list,
    allow_headers=settings.cors_headers_list,
)
register_exception_handlers(app)

app.include_router(health.router, prefix="/api")
app.include_router(auth_api.router, prefix="/api")
app.include_router(users_api.router, prefix="/api")
app.include_router(records.router, prefix="/api")
app.include_router(schema.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(payroll.router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(fiorella.router, prefix="/api/v1")

def _optional(mod_name: str, attr: str = "router") -> None:
    try:
        module = __import__(f"app.api.routes.{mod_name}", fromlist=[attr])
        app.include_router(getattr(module, attr), prefix="/api")
    except Exception as exc:
        log.warning("router %s no cargado: %s", mod_name, exc)

_optional("collab_sync")
_optional("remote")
_optional("collaborators")
_optional("devices")

@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "running",
        "env": settings.APP_ENV,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.ENABLE_DOCS else None,
    }