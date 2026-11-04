from datetime import datetime, timedelta
import secrets
import time
from threading import Lock
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.clock import utc_now
from app.core.security import COOKIE_NAME, hash_password, token_digest, verify_password
from app.db.session import get_db
from app.models.entities import AuthSession, User
from app.schemas.registry import LoginInput
from app.services.registry import commit, user_dict

router = APIRouter(prefix="/auth", tags=["Acceso"])
_attempts: dict[str, list[float]] = {}
_attempts_lock = Lock()
_dummy_hash = hash_password(secrets.token_urlsafe(24))

def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token), AuthSession.expires_at > utc_now())) if token and len(token) < 200 else None
    user = db.get(User, session.user_id) if session else None
    if user is None or not user.is_active:
        raise HTTPException(401, "Ingrese con su usuario y contraseña para continuar.")
    return user

@router.post("/login")
def login(data: LoginInput, request: Request, response: Response, db: Session = Depends(get_db)):
    # Límite por origen remoto, compartido por usuarios dentro de este proceso.
    # En despliegues múltiples debe reemplazarse por un almacén compartido.
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _attempts_lock:
        for old in list(_attempts):
            _attempts[old] = [t for t in _attempts[old] if now - t < 300]
            if not _attempts[old]:
                del _attempts[old]
        history = _attempts.setdefault(key, [])
        if len(history) >= 10:
            raise HTTPException(429, "Demasiados intentos. Espere cinco minutos y vuelva a intentar.", headers={"Retry-After": "300"})
        history.append(now)
    user = db.scalar(select(User).where(User.username == data.username.lower()))
    valid = verify_password(data.password, user.password_hash if user else _dummy_hash)
    if not valid or user is None or not user.is_active:
        raise HTTPException(401, "El usuario o la contraseña no son correctos.")
    with _attempts_lock:
        _attempts.pop(key, None)
    # Rotar incluso si el navegador ya tenía una sesión.
    previous = request.cookies.get(COOKIE_NAME)
    if previous:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == token_digest(previous)))
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= utc_now()))
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=token_digest(token), user_id=user.id, expires_at=utc_now() + timedelta(hours=8)))
    commit(db, user, "login", user, [])
    response.set_cookie(COOKIE_NAME, token, max_age=8 * 60 * 60, httponly=True, secure=get_settings().app_env != "development", samesite="strict", path="/api")
    response.headers["Cache-Control"] = "no-store"
    return user_dict(user)

@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    token = request.cookies.get(COOKIE_NAME)
    db.execute(delete(AuthSession).where(AuthSession.token_hash == token_digest(token)))
    commit(db, user, "logout", user, [])
    response.delete_cookie(COOKIE_NAME, path="/api", httponly=True, samesite="strict", secure=get_settings().app_env != "development")

@router.get("/me")
def me(response: Response, user: User = Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return user_dict(user)
