from pathlib import Path
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    app_name: str = "Administración de propiedades"
    app_env: str = "development"
    database_url: str = Field(min_length=1)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

@lru_cache
def get_settings() -> Settings:
    return Settings()
