#!/usr/bin/env bash
# Sobe a aplicação inteira (API + frontend) em http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
. .venv/bin/activate
pip install -q -r backend/requirements.txt

exec uvicorn app.main:app --app-dir backend --reload --port 8000
