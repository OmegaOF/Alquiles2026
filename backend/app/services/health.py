from sqlalchemy import text
from app.db.session import get_engine

def check_database() -> None:
    with get_engine().connect() as connection:
        connection.execute(text("SELECT 1"))
