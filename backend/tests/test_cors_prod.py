import pytest
from pydantic import ValidationError


def test_production_rejects_wildcard_cors(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    monkeypatch.setenv("CORS_ORIGINS", "*")
    from app.core.config import Settings
    with pytest.raises(ValidationError):
        Settings(_env_file=None)