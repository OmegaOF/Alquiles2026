from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.core.security import hash_password
from app.db.session import get_db
from app.models.entities import AuthSession, Person, Property, PropertyOwner, Unit, User
from app.schemas.registry import PersonCreate, PersonPatch, PropertyCreate, PropertyPatch, UnitCreate, UnitPatch, UserCreate, UserPatch
from app.services.registry import ADMIN, apply_fields, commit, person_dict, property_dict, property_for_user, replace_access, replace_managers, replace_owners, require_admin, unit_dict, user_dict, validate_user_person, visible_properties, snapshot, person_for_account, account_alias, record_audit

router = APIRouter(tags=["Propiedades y personas"])

@router.get("/persons")
def persons(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Person).order_by(Person.full_name, Person.id)
    if user.role != ADMIN:
        from app.services.tenancy import contact_ids
        ids = list(db.scalars(visible_properties(db, user).with_only_columns(Property.id)))
        people = set()
        for property_id in ids:
            people.update(db.scalars(contact_ids(db, property_id)))
        query = query.where(Person.id.in_(people))
    return [person_dict(p) for p in db.scalars(query)]

@router.post("/persons", status_code=201)
def create_person(data: PersonCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    obj = Person(**data.model_dump())
    db.add(obj)
    commit(db, user, "create", obj, list(data.model_fields_set))
    return person_dict(obj)

@router.patch("/persons/{person_id}")
def update_person(person_id: int, data: PersonPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    obj = db.get(Person, person_id)
    if obj is None:
        raise HTTPException(404, "La persona no existe.")
    before = snapshot(obj)
    values = data.model_dump(exclude_unset=True)
    if values.get("is_owner") is False and (db.scalar(select(PropertyOwner).where(PropertyOwner.person_id == obj.id)) or db.scalar(select(User).where(User.person_id == obj.id, User.role == "owner"))):
        raise HTTPException(409, "Esta persona está vinculada como propietaria. Conserve su condición para mantener el historial.")
    apply_fields(obj, values)
    commit(db, user, "update", obj, list(values), before=before)
    return person_dict(obj)

@router.get("/properties")
def properties(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [property_dict(p) for p in db.scalars(visible_properties(db, user).order_by(Property.name, Property.id))]

@router.post("/properties", status_code=201)
def create_property(data: PropertyCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    values = data.model_dump(exclude={"owners", "manager_ids"})
    obj = Property(**values)
    db.add(obj)
    db.flush()
    replace_owners(db, obj, data.owners)
    replace_managers(db, obj, data.manager_ids)
    commit(db, user, "create", obj, list(data.model_fields_set))
    return property_dict(obj)

@router.get("/properties/{property_id}")
def property_detail(property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return property_dict(property_for_user(db, user, property_id))

@router.patch("/properties/{property_id}")
def update_property(property_id: int, data: PropertyPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    obj = property_for_user(db, user, property_id, write=True)
    before = snapshot(obj)
    values = data.model_dump(exclude_unset=True)
    if user.role != ADMIN and ({"owners", "manager_ids", "is_active"} & values.keys()):
        raise HTTPException(403, "Solo el administrador general puede cambiar propietarios, permisos o archivar propiedades.")
    apply_fields(obj, values, excluded={"owners", "manager_ids"})
    if "owners" in values:
        replace_owners(db, obj, data.owners)
    if "manager_ids" in values:
        replace_managers(db, obj, data.manager_ids)
    commit(db, user, "update", obj, list(values), before=before)
    return property_dict(obj)

@router.get("/properties/{property_id}/units")
def units(property_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    property_for_user(db, user, property_id)
    return [unit_dict(unit) for unit in db.scalars(select(Unit).where(Unit.property_id == property_id).order_by(Unit.code, Unit.id))]

@router.post("/properties/{property_id}/units", status_code=201)
def create_unit(property_id: int, data: UnitCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    property_for_user(db, user, property_id, write=True, units=True)
    obj = Unit(property_id=property_id, **data.model_dump())
    db.add(obj)
    commit(db, user, "create", obj, list(data.model_fields_set))
    return unit_dict(obj)

@router.patch("/properties/{property_id}/units/{unit_id}")
def update_unit(property_id: int, unit_id: int, data: UnitPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    property_for_user(db, user, property_id, write=True, units=True)
    obj = db.scalar(select(Unit).where(Unit.id == unit_id, Unit.property_id == property_id))
    if obj is None:
        raise HTTPException(404, "El cuarto no existe en esta propiedad.")
    before = snapshot(obj)
    values = data.model_dump(exclude_unset=True)
    apply_fields(obj, values)
    commit(db, user, "update", obj, list(values), before=before)
    return unit_dict(obj)

@router.get("/users")
def users(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    return [user_dict(u) for u in db.scalars(select(User).join(User.person).order_by(Person.full_name, User.id))]

@router.post("/users", status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    person, created_person = person_for_account(db, data)
    obj = User(**data.model_dump(exclude={"password", "property_ids", "full_name", "person_id", "display_name"}), person=person, display_name=account_alias(data, person), password_hash=hash_password(data.password))
    db.add(obj)
    validate_user_person(db, obj)
    if created_person:
        record_audit(db, user, "create", person, ["full_name", "is_owner"])
    replace_access(db, obj, data.property_ids)
    commit(db, user, "create", obj, list(data.model_fields_set))
    return user_dict(obj)

@router.patch("/users/{user_id}")
def update_user(user_id: int, data: UserPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    # Serializa cambios de administradores para no desactivar al último por carrera.
    admins = db.scalars(select(User).where(User.role == ADMIN, User.is_active.is_(True)).with_for_update()).all()
    obj = db.get(User, user_id)
    if obj is None:
        raise HTTPException(404, "El usuario no existe.")
    before = snapshot(obj)
    values = data.model_dump(exclude_unset=True)
    was_admin = obj.role == ADMIN and obj.is_active
    if was_admin and len(admins) == 1 and (values.get("is_active") is False or ("role" in values and values["role"] != ADMIN)):
        raise HTTPException(409, "Debe conservar al menos un administrador general activo.")
    if "person_id" in values:
        person = db.get(Person, data.person_id)
        if person is None:
            raise HTTPException(422, "La persona seleccionada no existe.")
        obj.person = person
    apply_fields(obj, values, excluded={"password", "property_ids", "person_id", "full_name"})
    if "full_name" in values and "display_name" not in values and data.full_name != obj.person.full_name:
        obj.display_name = data.full_name
    validate_user_person(db, obj)
    if "password" in values:
        if data.password is None:
            raise HTTPException(422, "La nueva contraseña no puede estar vacía.")
        obj.password_hash = hash_password(data.password)
    if "property_ids" in values:
        replace_access(db, obj, data.property_ids)
    elif obj.role in {ADMIN, "owner"}:
        replace_access(db, obj, [])
    if {"password", "role", "person_id", "is_active"} & values.keys():
        db.execute(delete(AuthSession).where(AuthSession.user_id == obj.id))
    commit(db, user, "update", obj, list(values), before=before)
    return user_dict(obj)
