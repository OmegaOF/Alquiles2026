"""Contraseñas derivadas con PBKDF2 y sesiones opacas; nunca se guardan tokens en claro."""
import hashlib
import hmac
import secrets

ITERATIONS = 600_000
COOKIE_NAME = "mi_casa_session"

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest.hex()}"

def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
