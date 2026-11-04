#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export RUN_MYSQL_TESTS=1
(cd backend && ../.venv/bin/alembic upgrade head && ../.venv/bin/pytest -q && ../.venv/bin/alembic check)
npm --prefix frontend test
npm --prefix frontend run build
