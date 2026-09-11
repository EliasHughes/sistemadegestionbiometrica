from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_public():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_export_requires_auth():
    res = client.get("/api/records/export/excel")
    assert res.status_code == 401


def test_schema_requires_auth():
    res = client.get("/api/schema/tables")
    assert res.status_code in (401, 403)


def test_remote_punch_requires_auth():
    res = client.post("/api/remote/punch", json={"codigo": "1", "tipo": "entrada"})
    assert res.status_code == 401


def test_payroll_requires_auth():
    res = client.post("/api/payroll/overtime", json={})
    assert res.status_code == 401


def test_records_requires_auth():
    res = client.get("/api/records/recent")
    assert res.status_code == 401


def test_login_rejects_empty():
    res = client.post("/api/auth/login", json={"username": "", "password": ""})
    assert res.status_code == 401
