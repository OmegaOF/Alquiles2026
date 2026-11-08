"""Inventario reproducible, de solo lectura, de las tablas heredadas de fase 7.

Ejecutar con la .venv del proyecto y DATABASE_URL de una base descartable migrada.
No deduce dependencias funcionales a partir de los datos ni certifica 3FN.
"""

import ast
import hashlib
import json
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


ROOT = Path(__file__).resolve().parents[1]


def inventory():
    url = os.environ["DATABASE_URL"]
    parsed = make_url(url)
    if parsed.get_backend_name() != "mysql" or not parsed.database.endswith("_test"):
        raise ValueError(
            "Use exclusivamente una base MySQL descartable terminada en _test."
        )
    engine = create_engine(url)
    inspector = inspect(engine)
    names = sorted(set(inspector.get_table_names()) - {"alembic_version"})
    with engine.connect() as connection:
        version = connection.scalar(text("SELECT VERSION()"))
        revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
        tables = {}
        for name in names:
            columns = inspector.get_columns(name)
            primary = inspector.get_pk_constraint(name)["constrained_columns"]
            unique = inspector.get_unique_constraints(name)
            required = {c["name"] for c in columns if not c["nullable"]}
            candidates = [primary]
            conditional = []
            for key in unique:
                fields = key["column_names"]
                if set(fields) <= required:
                    if fields not in candidates:
                        candidates.append(fields)
                else:
                    conditional.append(fields)
            tables[name] = {
                "columns": [
                    {
                        "name": c["name"],
                        "type": str(c["type"]),
                        "nullable": c["nullable"],
                        "default": c["default"],
                    }
                    for c in columns
                ],
                "primary_key": primary,
                "candidate_keys_enforced": candidates,
                "nullable_unique": conditional,
                "foreign_keys": inspector.get_foreign_keys(name),
                "unique_constraints": unique,
                "checks": inspector.get_check_constraints(name),
                "indexes": inspector.get_indexes(name),
                "ddl": connection.exec_driver_sql(f"SHOW CREATE TABLE `{name}`").one()[
                    1
                ],
            }
    migrations = {}
    for path in sorted((ROOT / "backend/migrations/versions").glob("000[1-8]*.py")):
        source = path.read_bytes()
        tree = ast.parse(source)
        metadata = {}
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in {
                        "revision",
                        "down_revision",
                    }:
                        metadata[target.id] = ast.literal_eval(node.value)
        migrations[path.name] = {
            **metadata,
            "sha256": hashlib.sha256(source).hexdigest(),
            "created_tables": [
                node.args[0].value
                for node in ast.walk(tree)
                if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "create_table"
                and node.args
                and isinstance(node.args[0], ast.Constant)
            ],
        }
    engine.dispose()
    return {
        "mysql": version,
        "alembic_revision": revision,
        "application_table_count": len(tables),
        "tables": tables,
        "historical_migrations": migrations,
        "scope": "Esquema de prueba; sin filas, credenciales ni URL de conexión.",
    }


if __name__ == "__main__":
    result = inventory()
    destination = ROOT / "docs/phase-7-verification/schema.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"MySQL {result['mysql']}: {result['application_table_count']} tablas de aplicación; {result['alembic_revision']}."
    )
    print(
        "Inventario de columnas, claves, FK, CHECK, índices y DDL guardado sin datos personales."
    )
