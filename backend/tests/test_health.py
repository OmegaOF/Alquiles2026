from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from app.main import app
from app.api import health

client = TestClient(app)

def test_liveness():
    assert client.get("/api/v1/health").json() == {"status": "ok"}

def test_readiness_success(monkeypatch):
    monkeypatch.setattr(health, "check_database", lambda: None)
    assert client.get("/api/v1/ready").json() == {"status": "ok", "database": "ok"}

def test_database_error_is_safe(monkeypatch):
    def fail():
        raise OperationalError("secret SQL", {}, Exception("secret password"))
    monkeypatch.setattr(health, "check_database", fail)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert "secret" not in response.text

def test_cors_restricts_unknown_origin():
    response = client.get("/api/v1/health", headers={"Origin": "https://unknown.example"})
    assert "access-control-allow-origin" not in response.headers

def test_documented_api():
    assert "/api/v1/ready" in client.get("/openapi.json").json()["paths"]
