#!/usr/bin/env bash
# One-command local start: backend (FastAPI, port 8001) + dashboard (Next.js, port 3001). Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PY="$(command -v python3.12 || command -v python3.11 || command -v python3)"
echo "Using $($PY --version) at $PY"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — add OPENCODE_API_KEY (or another LLM key) so resumes can be tailored, then rerun."
  exit 1
fi
if ! grep -Eq '^(OPENCODE_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|LLM_BASE_URL)=.+' .env; then
  echo "Warning: no LLM key in .env. Scanning works, tailoring will not."
fi

cd backend
[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
cd ..

[ -d frontend/node_modules ] || (cd frontend && npm install)
if [ ! -f frontend/.env.local ]; then
  TOKEN="$(grep -E '^API_TOKEN=' .env | cut -d= -f2- || true)"
  printf 'BACKEND_URL=http://127.0.0.1:8001\nAPI_TOKEN=%s\n' "${TOKEN}" > frontend/.env.local
fi

for port in 8001 3001; do lsof -ti tcp:$port | xargs -r kill -9 2>/dev/null || true; done
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd backend && source .venv/bin/activate && python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload) &
sleep 3
(cd frontend && npm run dev) &

echo
echo "  Job Pilot is starting"
echo "  Dashboard -> http://localhost:3001"
echo "  API docs  -> http://127.0.0.1:8001/docs"
echo "  Ctrl-C to stop"
echo
wait
