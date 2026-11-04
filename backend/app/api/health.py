from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.schemas.health import HealthResponse, ReadyResponse
from app.services.health import check_database

router = APIRouter(tags=["Estado del sistema"])

@router.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse()

@router.get("/ready", response_model=ReadyResponse)
def ready():
    try:
        check_database()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="No se pudo conectar con la base de datos. Intente nuevamente.") from None
    return ReadyResponse()
