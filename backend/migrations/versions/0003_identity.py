"""Una identidad personal canónica por cuenta, sin perder etiquetas anteriores.

MySQL confirma DDL implícitamente. Esta revisión usa etapas reentrantes y una
transacción explícita para las altas de personas y enlaces de cuentas. Debe
aplicarse con la aplicación detenida y un respaldo verificado de 0002.
"""
from contextlib import contextmanager

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0003_identity"
down_revision = "0002_phase1"
branch_labels = None
depends_on = None


def _columns(table):
    return {column["name"]: column for column in sa.inspect(op.get_bind()).get_columns(table)}


def _require_online():
    if op.get_context().as_sql:
        raise RuntimeError("0003_identity necesita conexión online para conservar y vincular identidades existentes.")


@contextmanager
def _data_transaction():
    """En MySQL, confirmar todo el backfill antes del siguiente ALTER TABLE."""
    if op.get_bind().dialect.name == "mysql":
        with op.get_context().autocommit_block():
            connection = op.get_bind()
            connection.exec_driver_sql("START TRANSACTION")
            try:
                yield connection
            except BaseException:
                connection.exec_driver_sql("ROLLBACK")
                raise
            else:
                connection.exec_driver_sql("COMMIT")
    else:
        yield op.get_bind()


def _validate_links():
    connection = op.get_bind()
    orphan = connection.execute(sa.text(
        "SELECT u.id FROM users u LEFT JOIN persons p ON p.id=u.person_id "
        "WHERE u.person_id IS NOT NULL AND p.id IS NULL LIMIT 1"
    )).first()
    if orphan:
        raise RuntimeError("Hay una cuenta con persona inexistente. Restaure/verifique el respaldo y corrija la integridad antes de migrar.")


def _person_nullable(nullable):
    """Preservar la FK RESTRICT; completar también una etapa DDL interrumpida."""
    connection = op.get_bind()
    column = _columns("users")["person_id"]
    keys = [fk for fk in sa.inspect(connection).get_foreign_keys("users")
            if fk["constrained_columns"] == ["person_id"]]
    if connection.dialect.name == "sqlite":
        if column["nullable"] != nullable:
            with op.batch_alter_table("users") as batch:
                batch.alter_column("person_id", existing_type=sa.Integer(), nullable=nullable)
        return
    if column["nullable"] != nullable:
        for key in keys:
            op.drop_constraint(key["name"], "users", type_="foreignkey")
        op.alter_column("users", "person_id", existing_type=sa.Integer(), nullable=nullable)
        # El índice de apoyo de MySQL se conserva al quitar/reponer la FK.
        name = keys[0]["name"] if keys else "fk_users_person_id_persons"
        op.create_foreign_key(name, "users", "persons", ["person_id"], ["id"], ondelete="RESTRICT")
    elif not keys:
        op.create_foreign_key("fk_users_person_id_persons", "users", "persons", ["person_id"], ["id"], ondelete="RESTRICT")


def _backfill():
    if "full_name" not in _columns("users"):
        if op.get_bind().execute(sa.text("SELECT id FROM users WHERE person_id IS NULL LIMIT 1")).first():
            raise RuntimeError("Migración parcial sin nombre de origen y con cuentas sin persona. Recupere el respaldo; no se inventarán identidades.")
        return
    users = sa.table("users", sa.column("id", sa.Integer()), sa.column("full_name", sa.String(160)),
                     sa.column("person_id", sa.Integer()), sa.column("display_name", sa.String(160)),
                     sa.column("created_at", sa.DateTime()), sa.column("updated_at", sa.DateTime()))
    persons = sa.table("persons", sa.column("id", sa.Integer()), sa.column("full_name", sa.String(160)),
                       sa.column("is_owner", sa.Boolean()), sa.column("created_at", sa.DateTime()),
                       sa.column("updated_at", sa.DateTime()))
    with _data_transaction() as connection:
        # Orden estable y sin deduplicación por nombre o contactos no inequívocos.
        for user in connection.execute(sa.select(users).order_by(users.c.id)).mappings().all():
            person_id = user["person_id"]
            if person_id is None:
                result = connection.execute(persons.insert().values(
                    full_name=user["full_name"], is_owner=False,
                    created_at=user["created_at"], updated_at=user["updated_at"]))
                person_id = result.lastrowid
                connection.execute(users.update().where(users.c.id == user["id"]).values(person_id=person_id))
            canonical = connection.execute(sa.select(persons.c.full_name).where(persons.c.id == person_id)).scalar_one()
            # Comparación exacta en Python: la collation de MySQL podría ignorar mayúsculas/acentos.
            if user["full_name"] != canonical and user["display_name"] is None:
                connection.execute(users.update().where(users.c.id == user["id"]).values(display_name=user["full_name"]))


def upgrade():
    _require_online()
    _validate_links()
    if "display_name" not in _columns("users"):
        op.add_column("users", sa.Column("display_name", sa.String(160), nullable=True))
    _backfill()
    if op.get_bind().execute(sa.text("SELECT id FROM users WHERE person_id IS NULL LIMIT 1")).first():
        raise RuntimeError("No se pudo completar la identidad de todas las cuentas; no se eliminará full_name.")
    _person_nullable(False)
    if op.get_bind().dialect.name == "mysql" and not isinstance(_columns("audit_events")["details"]["type"], mysql.MEDIUMTEXT):
        op.alter_column("audit_events", "details", existing_type=sa.Text(), type_=mysql.MEDIUMTEXT(), existing_nullable=False)
    if "full_name" in _columns("users"):
        op.drop_column("users", "full_name")


def downgrade():
    _require_online()
    connection = op.get_bind()
    # Comprobar ANTES de la primera alteración. Nunca truncar una auditoría.
    if connection.dialect.name == "mysql":
        maximum = connection.execute(sa.text("SELECT COALESCE(MAX(OCTET_LENGTH(details)),0) FROM audit_events")).scalar_one()
        if maximum > 65535:
            raise RuntimeError("No se puede volver a TEXT: hay auditorías mayores de 65535 bytes. Conserve 0003 y restaure un respaldo compatible; no se truncarán datos.")
    if "full_name" not in _columns("users"):
        op.add_column("users", sa.Column("full_name", sa.String(160), nullable=True))
    has_alias = "display_name" in _columns("users")
    with _data_transaction() as connection:
        rows = connection.execute(sa.text(
            "SELECT u.id, p.full_name AS canonical" + (",u.display_name" if has_alias else "") +
            " FROM users u JOIN persons p ON p.id=u.person_id WHERE u.full_name IS NULL"
        )).mappings().all()
        for row in rows:
            full_name = row["display_name"] if has_alias and row["display_name"] is not None else row["canonical"]
            connection.execute(sa.text("UPDATE users SET full_name=:name WHERE id=:id"), {"name": full_name, "id": row["id"]})
    if connection.execute(sa.text("SELECT id FROM users WHERE full_name IS NULL LIMIT 1")).first():
        raise RuntimeError("No se pudo reconstruir el nombre de una cuenta; recupere el respaldo sin eliminar aliases.")
    if _columns("users")["full_name"]["nullable"]:
        if connection.dialect.name == "sqlite":
            with op.batch_alter_table("users") as batch:
                batch.alter_column("full_name", existing_type=sa.String(160), nullable=False)
        else:
            op.alter_column("users", "full_name", existing_type=sa.String(160), nullable=False)
    _person_nullable(True)
    if "display_name" in _columns("users"):
        op.drop_column("users", "display_name")
    if connection.dialect.name == "mysql":
        op.alter_column("audit_events", "details", existing_type=mysql.MEDIUMTEXT(), type_=sa.Text(), existing_nullable=False)
    # Conservar personas creadas y sus enlaces: borrarlas perdería identidades y
    # podría romper relaciones incorporadas después del upgrade. Para restaurar
    # exactamente el conjunto de filas de 0002 se necesita su respaldo previo.
