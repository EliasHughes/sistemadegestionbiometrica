from __future__ import annotations

import os
import secrets
from typing import List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_INSECURE_SECRETS = {
    "",
    "dev-secret-key-cambiar-en-produccion",
    "ESTA-LINEA-ES-SECRETA-FAVOR-NO-TOCAR-ATREVIDOS-JAJAJA",
    "changeme",
    "secret",
    "secretkey",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    APP_NAME: str = "Visualizador de Ponches · César Iglesias"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.1.0"

    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    CORS_ORIGINS: str = "http://localhost:3007,http://127.0.0.1:3007"
    CORS_ALLOW_METHODS: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    CORS_ALLOW_HEADERS: str = "Authorization,Content-Type,Accept,X-Request-ID,X-Actor"

    ENABLE_DOCS: bool | None = None

    # Bootstrap del primer administrador (solo si no existen usuarios)
    BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    BOOTSTRAP_ADMIN_PASSWORD: str = ""
    BOOTSTRAP_ADMIN_NAME: str = "Administrador"

    # SQL Server
    DB_SERVER: str = r"DESKTOP-JGB8EAN\SQLEXPRESS"
    DB_NAME: str = "BioTime"
    DB_AUTH: str = "windows"  # "windows" | "sql"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"

    # Diagnóstico de esquema: tablas permitidas (vacío = solo punches)
    SCHEMA_ALLOWED_TABLES: str = "punches"

    @field_validator("APP_ENV")
    @classmethod
    def _norm_env(cls, v: str) -> str:
        value = (v or "development").strip().lower()
        if value in {"prod", "production"}:
            return "production"
        if value in {"qa", "staging", "test"}:
            return value
        return "development"

    @model_validator(mode="after")
    def _harden(self) -> "Settings":
        key = (self.SECRET_KEY or "").strip()
        if key in _INSECURE_SECRETS or len(key) < 32:
            if self.APP_ENV == "production":
                raise ValueError(
                    "SECRET_KEY es obligatorio en producción y debe tener al menos "
                    "32 caracteres. Defínalo en la variable de entorno SECRET_KEY."
                )
            # Desarrollo: generar clave efímera para no bloquear, nunca commitearla.
            self.SECRET_KEY = secrets.token_urlsafe(48)

        if self.ENABLE_DOCS is None:
            self.ENABLE_DOCS = self.APP_ENV != "production"

        if self.APP_ENV == "production":
            origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
            if not origins or "*" in origins or any(o == "*" for o in origins):
                raise ValueError(
                    "CORS_ORIGINS en producción no puede estar vacío ni ser '*'. "
                    "Lista orígenes concretos (https://host:puerto)."
                )
            if self.ENABLE_DOCS is True:
                # docs solo si lo pides explícito; por defecto ya queda False
                pass
            elif self.ENABLE_DOCS is None:
                self.ENABLE_DOCS = False
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cors_methods_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOW_METHODS.split(",") if o.strip()]

    @property
    def cors_headers_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOW_HEADERS.split(",") if o.strip()]

    @property
    def schema_allowlist(self) -> List[str]:
        return [t.strip() for t in self.SCHEMA_ALLOWED_TABLES.split(",") if t.strip()]

    @property
    def db_connection_string(self) -> str:
        base = (
            f"DRIVER={{{self.DB_DRIVER}}};"
            f"SERVER={self.DB_SERVER};"
            f"DATABASE={self.DB_NAME};"
            "TrustServerCertificate=yes;"
        )
        if self.DB_AUTH.lower() == "windows":
            return base + "Trusted_Connection=yes;"
        if not self.DB_USER:
            raise ValueError("DB_USER es obligatorio cuando DB_AUTH=sql")
        return base + f"UID={self.DB_USER};PWD={self.DB_PASSWORD};"


settings = Settings()
os.environ.setdefault("APP_ENV", settings.APP_ENV)
