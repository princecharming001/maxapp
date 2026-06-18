#!/usr/bin/env bash
# Phase 1 local setup — run from repo root: bash scripts/phase1_setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ ! -d "$ROOT/.git" ]]; then
  echo "ERROR: $ROOT is not a git repo. Use: cd ~/maxapp (not backend/)"
  exit 1
fi

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip -q install -r requirements.txt

grep -q 'DYNAMIC_ONBOARDING_ENABLED' .env 2>/dev/null || echo 'DYNAMIC_ONBOARDING_ENABLED=true' >> .env

echo "==> Seeding system prompts..."
python scripts/seed_prompts.py

echo "==> Ingesting max docs + RAG embeddings (needs OPENAI_API_KEY)..."
python scripts/ingest_max_docs.py

echo "==> Phase 1 seed done."
echo "Start API: cd ~/maxapp/backend && source venv/bin/activate && uvicorn main:app --reload --port 8001"
echo "Mobile .env should use: EXPO_PUBLIC_API_BASE_URL=http://localhost:8001/api/"
