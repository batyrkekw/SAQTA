#!/usr/bin/env bash
set -euo pipefail
saqta_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
saqta_api_port="${SAQTA_API_PORT:-8001}"
saqta_web_port="${SAQTA_WEB_PORT:-3000}"
if [[ ! -x "$saqta_root/backend/.venv/bin/python" || ! -d "$saqta_root/frontend/node_modules" ]]; then
  echo "Install the backend and frontend dependencies first; see README.md."
  exit 1
fi
"$saqta_root/backend/.venv/bin/python" - "$saqta_api_port" "$saqta_web_port" <<'PY'
import socket, sys
for port in sys.argv[1:]:
    with socket.socket() as sock:
        try: sock.bind(('127.0.0.1', int(port)))
        except OSError: sys.exit(f'Port {port} is occupied. Stop your existing SAQTA server or set SAQTA_API_PORT / SAQTA_WEB_PORT.')
PY
(
  cd "$saqta_root/backend"
  export WORKSPACE_MODE="${WORKSPACE_MODE:-real}"
  export AUTO_SEED_DEMO=false
  .venv/bin/python -m alembic upgrade head
  export CORS_ORIGINS="http://127.0.0.1:$saqta_web_port,http://localhost:$saqta_web_port"
  exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$saqta_api_port"
) &
saqta_api_pid=$!
trap 'kill "$saqta_api_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
cd "$saqta_root/frontend"
NEXT_PUBLIC_API_URL="http://127.0.0.1:$saqta_api_port/api" npm run dev -- --port "$saqta_web_port"
