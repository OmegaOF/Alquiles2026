"""Autorización y operaciones transaccionales del registro de propiedades."""
import json
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.entities import AuditEvent, Person, Property, PropertyAccess, PropertyOwner, Unit, User

ADMIN = "general_admin"

def require_admin(user: User):
    if user.role != ADMIN:
        raise HTTPException(403, "Esta operación requiere un administrador general.")

def visible_properties(db: Session, user: User):
    query = select(Property)
    if user.role == ADMIN:
        return query
    if user.role == "owner":
        return query.where(Property.id.in_(select(PropertyOwner.property_id).where(PropertyOwner.person_id == user.person_id))) if user.person_id else query.where(False)
    return query.where(Property.id.in_(select(PropertyAccess.property_id).where(PropertyAccess.user_id == user.id)))

def property_for_user(db: Session, user: User, property_id: int, write: bool = False, units: bool = False):
    query = visible_properties(db, user).where(Property.id == property_id)
    if write:
        query = query.with_for_update()
    obj = db.scalar(query)
    if obj is None:
        raise HTTPException(404, "No se encontró la propiedad o no tiene acceso.")
    if write and user.role not in ({ADMIN, "property_admin", "operator"} if units else {ADMIN, "property_admin"}):
        raise HTTPException(403, "No tiene permiso para modificar esta información.")
    return obj

def person_dict(person):
    return {k: getattr(person, k) for k in ("id", "full_name", "document", "phone", "whatsapp", "email", "address", "notes", "is_owner")}

def user_dict(user):
    return {**{k: getattr(user, k) for k in ("id", "username", "full_name", "display_name", "role", "person_id", "is_active")}, "property_ids": sorted(a.property_id for a in user.accesses)}

def property_dict(obj):
    return {**{k: getattr(obj, k) for k in ("id", "name", "address", "zone", "city", "description", "is_active")}, "owners": [{"person_id": o.person_id, "share": str(o.share) if o.share is not None else None} for o in obj.owners], "manager_ids": sorted(a.user_id for a in obj.accesses if a.user.role == "property_admin")}

def unit_dict(unit):
    return {k: getattr(unit, k) for k in ("id", "property_id", "code", "name", "unit_type", "description", "maintenance", "is_enabled", "notes")}

def snapshot(obj):
    """Historial transaccional de datos y asociaciones, sin hashes ni secretos."""
    if isinstance(obj, Person):
        return person_dict(obj)
    if isinstance(obj, Property):
        return property_dict(obj)
    if isinstance(obj, Unit):
        return unit_dict(obj)
    if isinstance(obj, User):
        return user_dict(obj)
    return {}

def record_audit(db: Session, user: User | None, action: str, obj, fields: list[str], before=None):
    """Agregar un evento a la transacción actual sin confirmarla por separado."""
    db.flush()
    db.add(AuditEvent(actor_id=user.id if user else None, action=action, entity_type=obj.__tablename__, entity_id=obj.id, details=json.dumps({"fields": sorted(k for k in fields if k != "password"), "password_changed": "password" in fields, "before": before, "after": snapshot(obj) if action not in {"login", "logout"} else None}, ensure_ascii=False)))

def commit(db: Session, user: User | None, action: str, obj, fields: list[str], before=None):
    try:
        record_audit(db, user, action, obj, fields, before=before)
        db.commit()
        db.refresh(obj)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe un registro con esa identificación, usuario o número de cuarto; revise los datos.") from None

def apply_fields(obj, data, excluded=()):
    for key, value in data.items():
        if key in excluded:
            continue
        if value is None and key in {"name", "full_name", "address", "city", "username", "role", "code", "unit_type", "is_active", "is_enabled", "maintenance", "is_owner"}:
            raise HTTPException(422, "Complete los campos obligatorios; no pueden quedar vacíos.")
        setattr(obj, key, value)

def replace_owners(db, obj, owners):
    if owners is None:
        raise HTTPException(422, "Debe seleccionar al menos un propietario.")
    people = [db.get(Person, owner.person_id) for owner in owners]
    if any(p is None or not p.is_owner for p in people):
        raise HTTPException(422, "Seleccione personas registradas como propietarios.")
    # Delete first so MySQL can reuse composite keys without unique-key collisions.
    obj.owners.clear()
    db.flush()
    obj.owners.extend(PropertyOwner(person_id=o.person_id, share=o.share) for o in owners)

def replace_managers(db, obj, ids):
    if ids is None or len(set(ids)) != len(ids):
        raise HTTPException(422, "Revise la lista de administradores.")
    users = [db.get(User, id) for id in ids]
    if any(u is None or not u.is_active or u.role != "property_admin" for u in users):
        raise HTTPException(422, "Seleccione administradores de propiedades activos.")
    for access in list(obj.accesses):
        if access.user.role == "property_admin":
            obj.accesses.remove(access)
    db.flush()
    obj.accesses.extend(PropertyAccess(user_id=id) for id in ids)

def replace_access(db, user, ids):
    if ids is None or len(set(ids)) != len(ids) or any(db.get(Property, id) is None for id in ids):
        raise HTTPException(422, "Revise las propiedades autorizadas.")
    if user.role in {ADMIN, "owner"} and ids:
        raise HTTPException(422, "Este rol recibe acceso por sus funciones o titularidad; no admite asignaciones manuales.")
    user.accesses.clear()
    db.flush()
    user.accesses.extend(PropertyAccess(property_id=id) for id in ids)

def person_for_account(db: Session, data):
    """Seleccionar identidad existente o crearla, sin modificar personas compartidas."""
    if data.person_id is not None:
        person = db.get(Person, data.person_id)
        if person is None:
            raise HTTPException(422, "La persona seleccionada no existe.")
        return person, False
    if data.role == "owner":
        raise HTTPException(422, "Vincule una persona registrada como propietaria a esta cuenta.")
    if data.full_name is None:
        raise HTTPException(422, "Escriba el nombre completo para registrar a la persona.")
    person = Person(full_name=data.full_name, is_owner=False)
    db.add(person)
    return person, True

def account_alias(data, person: Person):
    """El nombre legado distinto se conserva como alias si no se indicó uno explícito."""
    if "display_name" in data.model_fields_set:
        return data.display_name
    if data.full_name is not None and data.full_name != person.full_name:
        return data.full_name
    return None

def validate_user_person(db, user):
    person = user.person
    if person is None:
        raise HTTPException(422, "La cuenta debe estar vinculada a una persona existente.")
    if user.role == "owner" and not person.is_owner:
        raise HTTPException(422, "Vincule una persona registrada como propietaria a esta cuenta.")
