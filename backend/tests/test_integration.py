import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from app.main import app
from app.db.session import get_engine

@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_MYSQL_TESTS") != "1", reason="Activar RUN_MYSQL_TESTS=1 con MySQL disponible")
def test_mysql_and_migration():
    assert get_engine().dialect.name == "mysql"
    with get_engine().connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0001_baseline"
        assert inspect(connection).get_table_names() == ["alembic_version"]
    response = TestClient(app).get("/api/v1/ready")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
