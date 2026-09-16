from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth as auth_api
from app.api.routes import exports
from app.api.routes import fiorella
from app.api.routes import health
from app.api.routes import payroll
from app.api.routes import records
from app.api.routes import schema
from app.api.routes import users as users_api

from app.api.settings import router as settings_router
from app.core.config import settings
from app.core.errors import (
    RequestIdMiddleware,
    register_exception_handlers,
)
from app.api.routes.fiorella_files import (
    router as fiorella_files_router,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

log = logging.getLogger("poche")


@asynccontextmanager
async def lifespan(app: FastAPI):

    # ============================================================
    # ÍNDICES GENERALES
    # ============================================================

    try:
        from app.services.sql_indexes import ensure_indexes

        result = ensure_indexes()

        log.info(
            "Índices SQL: status=%s created=%s existing=%s",
            result.get("status"),
            result.get("created"),
            result.get("existing"),
        )

    except Exception as exc:
        log.warning(
            "ensure_indexes falló: %s",
            exc,
        )

    # ============================================================
    # ESQUEMA DE FIORELLA
    # ============================================================

    try:
        from app.services.fiorella_schema import ensure_fiorella_schema

        result = ensure_fiorella_schema()

        if result.get("ok"):
            log.info(
                "Fiorella SQL inicializado correctamente. %s/%s operaciones.",
                result.get("completed"),
                result.get("total"),
            )
        else:
            log.warning(
                "Fiorella SQL inicializado parcialmente: %s",
                result.get("errors"),
            )

    except Exception as exc:
        log.exception(
            "No fue posible inicializar el esquema SQL de Fiorella: %s",
            exc,
        )

    # ============================================================
    # MONITOR PROACTIVO DE FIORELLA
    # ============================================================

    monitor_started = False

    try:
        from app.services.fiorella_monitor import start_monitor

        start_monitor()
        monitor_started = True

        log.info(
            "Monitor proactivo de Fiorella iniciado."
        )

    except Exception as exc:
        log.warning(
            "Monitor de Fiorella no pudo iniciarse: %s",
            exc,
        )

    # ============================================================
    # FASTAPI EJECUTÁNDOSE
    # ============================================================

    yield

    # ============================================================
    # APAGADO LIMPIO
    # ============================================================

    if monitor_started:
        try:
            from app.services.fiorella_monitor import stop_monitor

            await stop_monitor()

            log.info(
                "Monitor de Fiorella detenido correctamente."
            )

        except Exception as exc:
            log.warning(
                "Error deteniendo monitor de Fiorella: %s",
                exc,
            )


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
    lifespan=lifespan,
)


# ================================================================
# MIDDLEWARE
# ================================================================

app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=settings.cors_methods_list,
    allow_headers=settings.cors_headers_list,
)

register_exception_handlers(app)


# ================================================================
# ROUTERS PRINCIPALES
# ================================================================

app.include_router(
    health.router,
    prefix="/api",
)

app.include_router(
    auth_api.router,
    prefix="/api",
)

app.include_router(
    users_api.router,
    prefix="/api",
)

app.include_router(
    records.router,
    prefix="/api",
)

app.include_router(
    schema.router,
    prefix="/api",
)

app.include_router(
    exports.router,
    prefix="/api",
)

app.include_router(
    payroll.router,
    prefix="/api",
)

app.include_router(
    settings_router,
    prefix="/api",
)

app.include_router(
    fiorella_files_router
)


# ================================================================
# FIORELLA
#
# fiorella.py:
#     @router.post("/chat")
#
# Endpoint resultante:
#     POST /api/v1/chat
# ================================================================

app.include_router(
    fiorella.router,
    prefix="/api/v1",
)


# ================================================================
# ROUTERS OPCIONALES
# ================================================================

def _optional(
    mod_name: str,
    attr: str = "router",
) -> None:
    try:
        module = __import__(
            f"app.api.routes.{mod_name}",
            fromlist=[attr],
        )

        app.include_router(
            getattr(module, attr),
            prefix="/api",
        )

        log.info(
            "Router opcional cargado: %s",
            mod_name,
        )

    except Exception as exc:
        log.warning(
            "Router %s no cargado: %s",
            mod_name,
            exc,
        )


_optional("collab_sync")
_optional("remote")
_optional("collaborators")
_optional("devices")


# ================================================================
# ROOT
# ================================================================

@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "running",
        "env": settings.APP_ENV,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.ENABLE_DOCS else None,
        "fiorella": {
            "chat": "/api/v1/chat",
            "conversations": "/api/v1/conversations",
            "incidents": "/api/v1/incidents",
            "health_scan": "/api/v1/health-scan",
        },
    }