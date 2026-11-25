from contextlib import contextmanager
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.core.config import get_settings

@lru_cache
def get_engine():
    return create_engine(get_settings().database_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})

def get_db():
    with Session(get_engine()) as session:
        yield session


@contextmanager
def nonlocking_projection(db):
    """Permite proyectar una consulta de solo lectura sobre la vista de la transacción."""
    previous = db.info.get("nonlocking_projection", False)
    db.info["nonlocking_projection"] = True
    try:
        yield
    finally:
        if previous:
            db.info["nonlocking_projection"] = previous
        else:
            db.info.pop("nonlocking_projection", None)
