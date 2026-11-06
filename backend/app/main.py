from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.registry import router as registry_router
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])

@app.middleware("http")
async def security_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PATCH", "DELETE", "PUT"} and origin and origin not in settings.cors_origins:
        return JSONResponse(status_code=403, content={"detail": "El origen de esta solicitud no está autorizado."})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response

@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "Revise los campos indicados: complete los obligatorios y respete el formato y longitud permitidos.", "fields": sorted({str(e["loc"][-1]) for e in exc.errors()})})

@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    # El contexto de Session hace rollback al cerrarse si falla un flush previo al commit.
    return JSONResponse(status_code=409, content={"detail": "Ya existe un registro con esa identificación, usuario o número de cuarto; revise los datos."})

app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(registry_router, prefix="/api/v1")
