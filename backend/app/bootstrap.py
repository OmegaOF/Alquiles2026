"""Crear el primer administrador sin contraseñas publicadas ni argumentos visibles."""
import argparse
import getpass
import sys
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.security import hash_password
from app.db.session import get_engine
from app.models.entities import User
from app.schemas.registry import UserCreate
from app.services.registry import commit, person_for_account, account_alias, record_audit

def main():
    parser = argparse.ArgumentParser(description="Crear el primer administrador de Mi Casa")
    parser.add_argument("--username", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--password-stdin", action="store_true", help="Leer una contraseña generada de stdin; nunca pasarla como argumento")
    args = parser.parse_args()
    with Session(get_engine()) as db:
        if db.scalar(select(User.id).where(User.role == "general_admin", User.is_active.is_(True))):
            parser.error("Ya existe un administrador. Ingrese al sistema para gestionar usuarios.")
        if args.password_stdin:
            password = sys.stdin.readline().rstrip("\r\n")
        else:
            password = getpass.getpass("Contraseña nueva (mínimo 12 caracteres): ")
            if password != getpass.getpass("Repita la contraseña: "):
                parser.error("Las contraseñas no coinciden.")
        try:
            data = UserCreate(username=args.username, full_name=args.full_name, password=password, role="general_admin")
        except ValidationError:
            parser.error("Revise el usuario (3 a 80 caracteres), nombre y contraseña (12 a 128 caracteres).")
        person, _ = person_for_account(db, data)
        user = User(**data.model_dump(exclude={"password", "property_ids", "full_name", "person_id", "display_name"}), person=person, display_name=account_alias(data, person), password_hash=hash_password(data.password))
        db.add(user)
        record_audit(db, None, "create", person, ["full_name", "is_owner"])
        commit(db, None, "bootstrap", user, ["username", "role", "person_id"])
        print("Administrador creado. Ya puede iniciar sesión.")

if __name__ == "__main__":
    main()
