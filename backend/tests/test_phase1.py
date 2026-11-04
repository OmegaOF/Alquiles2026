"""Seguridad y flujos de fase 1; MySQL solo mediante URL de pruebas explícita."""
import os
import secrets
from datetime import timedelta
from app.core.clock import utc_now
from functools import lru_cache

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.models.entities import User, AuditEvent, AuthSession
from app.core.security import hash_password

PASSWORD = secrets.token_urlsafe(20)

@lru_cache
def password_hash():
    return hash_password(PASSWORD)

@pytest.fixture(params=['sqlite', 'mysql'])
def db(request):
    if request.param == 'mysql':
        url = os.getenv('PHASE1_TEST_DATABASE_URL')
        if not url:
            pytest.skip('PHASE1_TEST_DATABASE_URL no configurada: solo se omite repetición MySQL')
        assert make_url(url).database.endswith('_test'), 'La base descartable debe terminar en _test'
        engine = create_engine(url)
    else:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        admin = User(username='admin_test', full_name='Administración de pruebas', role='general_admin', password_hash=password_hash(), is_active=True)
        session.add(admin)
        session.commit()
    def override():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = override
    yield engine
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()

@pytest.fixture
def client(db):
    with TestClient(app) as client:
        yield client

@pytest.fixture
def admin(client):
    result = client.post('/api/v1/auth/login', json={'username': 'admin_test', 'password': PASSWORD})
    assert result.status_code == 200, result.text
    return client

def post(client, path, data):
    response = client.post('/api/v1' + path, json=data)
    assert response.status_code in (200, 201), response.text
    return response.json()

def person(client, name='Ana Propietaria', document=None):
    return post(client, '/persons', {'full_name': name, 'document': document, 'is_owner': True})

def property_(client, owner, name='Casa del Prado', **extra):
    return post(client, '/properties', {'name': name, 'address': 'Calle de prueba 10', 'city': 'La Paz', 'owners': [{'person_id': owner['id'], 'share': 100}], **extra})

def user(client, role, person_id=None, property_ids=None):
    return post(client, '/users', {'username': role + secrets.token_hex(3), 'full_name': 'Usuario de prueba', 'password': PASSWORD, 'role': role, 'person_id': person_id, 'property_ids': property_ids or []})

def login_as(client, account):
    result = client.post('/api/v1/auth/login', json={'username': account['username'], 'password': PASSWORD})
    assert result.status_code == 200, result.text


def test_people_properties_and_units(admin):
    first = person(admin, document='CI-100')
    second = person(admin, 'Luis Propietario', 'CI-200')
    a = property_(admin, first)
    b = property_(admin, first, 'Casa Norte')
    property_(admin, second, 'Casa Sur')
    one = post(admin, f"/properties/{a['id']}/units", {'code': '1', 'name': 'Cuarto con patio', 'unit_type': 'cuarto'})
    post(admin, f"/properties/{a['id']}/units", {'code': '2', 'name': 'Cuarto interior', 'unit_type': 'cuarto'})
    post(admin, f"/properties/{b['id']}/units", {'code': '1', 'name': 'Otro cuarto', 'unit_type': 'cuarto'})
    duplicate = admin.post(f"/api/v1/properties/{a['id']}/units", json={'code': ' 1 ', 'name': 'Repetido', 'unit_type': 'cuarto'})
    assert duplicate.status_code == 409
    assert len(admin.get(f"/api/v1/properties/{a['id']}/units").json()) == 2
    users = admin.get('/api/v1/users').json()
    assert not any(u['person_id'] in [first['id'], second['id']] for u in users)
    response = admin.patch(f"/api/v1/properties/{a['id']}/units/{one['id']}", json={'maintenance': True, 'is_enabled': False})
    assert response.status_code == 200
    assert response.json()['maintenance'] is True
    assert 'occupied' not in response.json()


def test_document_duplicates_and_optional_contacts(admin):
    person(admin, document='  ab-123  ')
    duplicate = admin.post('/api/v1/persons', json={'full_name': 'Otra persona', 'document': 'AB-123'})
    assert duplicate.status_code == 409
    person(admin, 'Sin documento 1')
    person(admin, 'Sin documento 2')
    assert admin.post('/api/v1/persons', json={'full_name': '  '}).status_code == 422
    assert admin.post('/api/v1/persons', json={'full_name': 'Correo inválido', 'email': 'sin-arroba'}).status_code == 422


def test_authentication_and_cookies(client):
    assert client.get('/api/v1/properties').status_code == 401
    assert client.post('/api/v1/auth/login', json={'username': 'admin_test', 'password': 'incorrecta'}).status_code == 401
    response = client.post('/api/v1/auth/login', json={'username': 'admin_test', 'password': PASSWORD})
    assert response.status_code == 200
    assert 'password' not in response.text
    cookie = response.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'samesite=strict' in cookie
    assert client.get('/api/v1/auth/me').status_code == 200
    assert client.post('/api/v1/auth/logout').status_code in (200, 204)
    assert client.get('/api/v1/auth/me').status_code == 401


@pytest.mark.parametrize('role', ['property_admin', 'operator', 'owner'])
def test_role_isolation_and_nested_unit_idor(admin, role):
    a_person = person(admin)
    b_person = person(admin, 'Propietaria ajena')
    home = property_(admin, a_person)
    other = property_(admin, b_person, 'Casa privada')
    foreign_unit = post(admin, f"/properties/{other['id']}/units", {'code': 'A', 'name': 'Privado', 'unit_type': 'cuarto'})
    account = user(admin, role, a_person['id'] if role == 'owner' else None, [home['id']] if role != 'owner' else [])
    login_as(admin, account)
    assert [p['id'] for p in admin.get('/api/v1/properties').json()] == [home['id']]
    assert admin.get(f"/api/v1/properties/{other['id']}").status_code in (403, 404)
    assert admin.get(f"/api/v1/properties/{other['id']}/units").status_code in (403, 404)
    assert admin.patch(f"/api/v1/properties/{home['id']}/units/{foreign_unit['id']}", json={'name': 'Intrusión'}).status_code in (403, 404)
    assert admin.get('/api/v1/users').status_code == 403
    assert b_person['id'] not in [p['id'] for p in admin.get('/api/v1/persons').json()]
    assert admin.post('/api/v1/persons', json={'full_name': 'No autorizado'}).status_code == 403
    assert admin.post('/api/v1/properties', json={'name': 'No autorizado', 'address': 'Prueba', 'city': 'La Paz', 'owners': [{'person_id': a_person['id']}]}).status_code == 403
    response = admin.patch(f"/api/v1/properties/{home['id']}", json={'name': 'Nombre permitido'})
    assert response.status_code == (200 if role == 'property_admin' else 403)
    response = admin.post(f"/api/v1/properties/{home['id']}/units", json={'code': 'B', 'name': 'Nuevo', 'unit_type': 'cuarto'})
    assert response.status_code == (403 if role == 'owner' else 201)


def test_manager_cannot_grant_access(admin):
    owner = person(admin)
    home = property_(admin, owner)
    manager = user(admin, 'property_admin', property_ids=[home['id']])
    login_as(admin, manager)
    for body in [{'manager_ids': []}, {'owners': [{'person_id': owner['id']}]}]:
        assert admin.patch(f"/api/v1/properties/{home['id']}", json=body).status_code == 403
    assert admin.patch(f"/api/v1/users/{manager['id']}", json={'role': 'general_admin'}).status_code == 403


def test_origin_protection(admin):
    response = admin.post('/api/v1/persons', json={'full_name': 'Ataque'}, headers={'Origin': 'https://untrusted.example'})
    assert response.status_code == 403
    assert admin.get('/api/v1/persons').json() == []


def test_user_deactivation_revokes_session(admin):
    account = user(admin, 'operator')
    with TestClient(app) as other:
        login_as(other, account)
        assert other.get('/api/v1/auth/me').status_code == 200
        assert admin.patch(f"/api/v1/users/{account['id']}", json={'is_active': False}).status_code == 200
        assert other.get('/api/v1/auth/me').status_code == 401


def test_validation_and_shares(admin):
    owner = person(admin)
    for owners in [[], [{'person_id': owner['id'], 'share': 101}], [{'person_id': owner['id'], 'share': -1}], [{'person_id': owner['id']}, {'person_id': owner['id']}]]:
        response = admin.post('/api/v1/properties', json={'name': 'Inválida', 'address': 'Prueba', 'city': 'La Paz', 'owners': owners})
        assert response.status_code in (400, 422)
    assert admin.post('/api/v1/users', json={'username': 'baduser', 'full_name': 'Prueba', 'password': 'corta', 'role': 'general_admin'}).status_code == 422
    assert admin.post('/api/v1/users', json={'username': 'badrole', 'full_name': 'Prueba', 'password': PASSWORD, 'role': 'tenant'}).status_code == 422


def test_archive_and_audit_preserve_history(admin, db):
    owner = person(admin)
    home = property_(admin, owner)
    assert admin.patch(f"/api/v1/properties/{home['id']}", json={'is_active': False}).status_code == 200
    detail = admin.get(f"/api/v1/properties/{home['id']}")
    assert detail.status_code == 200 and detail.json()['is_active'] is False
    assert admin.delete(f"/api/v1/properties/{home['id']}").status_code == 405
    with Session(db) as session:
        assert session.scalar(select(AuditEvent)) is not None


def test_last_admin_and_unknown_fields(admin):
    me = admin.get('/api/v1/auth/me').json()
    assert admin.patch(f"/api/v1/users/{me['id']}", json={'is_active': False}).status_code in (400, 409)
    owner = person(admin)
    home = property_(admin, owner)
    assert admin.patch(f"/api/v1/properties/{home['id']}", json={'occupied': True}).status_code == 422


def test_expired_session_is_rejected(admin, db):
    from app.core.security import COOKIE_NAME, token_digest
    token = admin.cookies.get(COOKIE_NAME)
    with Session(db) as session:
        stored = session.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
        assert stored is not None
        stored.expires_at = utc_now() - timedelta(seconds=1)
        session.commit()
    assert admin.get('/api/v1/auth/me').status_code == 401
    assert admin.get('/api/v1/properties').status_code == 401


def test_login_rotates_token_and_stores_only_hash(admin, db):
    from app.core.security import COOKIE_NAME, token_digest
    previous = admin.cookies.get(COOKIE_NAME)
    response = admin.post('/api/v1/auth/login', json={'username': 'admin_test', 'password': PASSWORD})
    assert response.status_code == 200
    current = admin.cookies.get(COOKIE_NAME)
    assert current and current != previous
    with Session(db) as session:
        hashes = list(session.scalars(select(AuthSession.token_hash)))
        assert token_digest(current) in hashes
        assert token_digest(previous) not in hashes
        assert current not in hashes and previous not in hashes
    with TestClient(app) as stale:
        stale.cookies.set(COOKIE_NAME, previous, path='/api')
        assert stale.get('/api/v1/auth/me').status_code == 401


def test_password_change_revokes_session_and_preserves_spaces(admin, db):
    from app.core.security import verify_password
    account = user(admin, 'operator')
    changed = ' ' + secrets.token_urlsafe(20) + ' '
    with TestClient(app) as other:
        login_as(other, account)
        result = admin.patch(f"/api/v1/users/{account['id']}", json={'password': changed})
        assert result.status_code == 200
        assert other.get('/api/v1/auth/me').status_code == 401
        assert other.post('/api/v1/auth/login', json={'username': account['username'], 'password': PASSWORD}).status_code == 401
        assert other.post('/api/v1/auth/login', json={'username': account['username'], 'password': changed.strip()}).status_code == 401
        assert other.post('/api/v1/auth/login', json={'username': account['username'], 'password': changed}).status_code == 200
    with Session(db) as session:
        stored = session.get(User, account['id'])
        assert stored.password_hash != changed
        assert verify_password(changed, stored.password_hash)


def test_audit_retains_owner_changes_without_credentials(admin, db):
    import json
    from app.core.security import COOKIE_NAME
    first = person(admin)
    second = person(admin, 'Nueva propietaria')
    home = property_(admin, first)
    result = admin.patch(f"/api/v1/properties/{home['id']}", json={'owners': [{'person_id': second['id'], 'share': 100}]})
    assert result.status_code == 200
    with Session(db) as session:
        events = list(session.scalars(select(AuditEvent)))
        updates = [e for e in events if e.entity_type == 'properties' and e.entity_id == home['id'] and e.action == 'update']
        assert len(updates) == 1
        details = json.loads(updates[0].details)
        assert details['before']['owners'][0]['person_id'] == first['id']
        assert details['after']['owners'][0]['person_id'] == second['id']
        for event in events:
            assert PASSWORD not in event.details
            assert admin.cookies.get(COOKIE_NAME) not in event.details
            assert 'password_hash' not in event.details and 'token_hash' not in event.details


def test_share_total_rejected_without_partial_ownership_change(admin):
    first = person(admin)
    second = person(admin, 'Segunda propietaria')
    home = property_(admin, first)
    response = admin.patch(f"/api/v1/properties/{home['id']}", json={'owners': [{'person_id': first['id'], 'share': 60}, {'person_id': second['id'], 'share': 50}]})
    assert response.status_code == 422
    owners = admin.get(f"/api/v1/properties/{home['id']}").json()['owners']
    assert len(owners) == 1 and owners[0]['person_id'] == first['id']
    assert float(owners[0]['share']) == 100


def test_duplicate_user_with_permissions_returns_conflict_and_rolls_back(admin):
    owner = person(admin)
    home = property_(admin, owner)
    first = user(admin, 'operator', property_ids=[home['id']])
    second = user(admin, 'operator')
    create = admin.post('/api/v1/users', json={'username': first['username'], 'full_name': 'Duplicado', 'password': PASSWORD, 'role': 'operator', 'property_ids': [home['id']]})
    assert create.status_code == 409
    update = admin.patch(f"/api/v1/users/{second['id']}", json={'username': first['username'], 'full_name': 'No conservar este cambio', 'property_ids': [home['id']]})
    assert update.status_code == 409
    accounts = admin.get('/api/v1/users').json()
    preserved = next(account for account in accounts if account['id'] == second['id'])
    assert preserved['username'] == second['username']
    assert preserved['full_name'] == second['full_name']
    assert preserved['property_ids'] == []
    assert sum(account['username'] == first['username'] for account in accounts) == 1


def test_last_admin_cannot_lose_role_and_inactive_login_rejected(admin):
    me = admin.get('/api/v1/auth/me').json()
    assert admin.patch(f"/api/v1/users/{me['id']}", json={'role': 'operator'}).status_code == 409
    assert admin.get('/api/v1/auth/me').json()['role'] == 'general_admin'
    account = user(admin, 'operator')
    assert admin.patch(f"/api/v1/users/{account['id']}", json={'is_active': False}).status_code == 200
    with TestClient(app) as other:
        result = other.post('/api/v1/auth/login', json={'username': account['username'], 'password': PASSWORD})
        assert result.status_code == 401
        assert 'password_hash' not in result.text


def test_manager_assignment_grants_only_selected_property(admin):
    owner = person(admin)
    manager = user(admin, 'property_admin')
    operator = user(admin, 'operator')
    assigned = property_(admin, owner, manager_ids=[manager['id']])
    unrelated = property_(admin, owner, 'Casa sin autorización')
    denied = admin.patch(f"/api/v1/properties/{assigned['id']}", json={'manager_ids': [operator['id']]})
    assert denied.status_code == 422
    assert admin.get(f"/api/v1/properties/{assigned['id']}").json()['manager_ids'] == [manager['id']]
    with TestClient(app) as other:
        login_as(other, manager)
        assert other.get('/api/v1/auth/me').json()['property_ids'] == [assigned['id']]
        assert other.get(f"/api/v1/properties/{assigned['id']}").status_code == 200
        assert other.get(f"/api/v1/properties/{unrelated['id']}").status_code == 404
