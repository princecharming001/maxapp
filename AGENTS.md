# AGENTS.md — read this first

This repo is **Max** ("the maxx app"), a **live, paid iOS app with real paying
customers**. Treat every change as production.

## Start here, in order

1. **`AI_HANDOFF.md`** (repo root) — the full brief: stack, infrastructure,
   credentials, the exact deploy/OTA/build/submit commands, and the traps.
2. **`docs/ai-context/INDEX.md`** — 61 notes, one per incident or subsystem,
   accumulated while building and shipping this app. Open the one matching what
   you're about to touch.

## Non-negotiables

- **Never push, deploy, OTA, or build without the owner's explicit, per-time
  go-ahead.** The app is live. Implement locally, show the diff, and wait.
  Local commits are fine.
- **Before ANY OTA**, read `docs/ai-context/maxapp_ota_runtime_targeting_trap.md`.
  There are four live OTA runtimes (3.0.9, 3.1.0, 3.1.1, 3.1.2) and an update
  must be published to *each* or it silently reaches only some users.
- **Verify against reality** — the live DB, the deployed API, a real device or
  the simulator — rather than asserting from the code. Say plainly when
  something is unverified.
- The Mac's clock runs behind; never trust local time and never change it. Get
  "now" from the database.

## Quick facts

| | |
|---|---|
| GitHub | `git@github.com:princecharming001/maxapp.git`, branch `main` |
| Backend | FastAPI + SQLAlchemy async, Python 3.11.7, venv `/Users/home/maxapp/.venv`, runs on **:8002** locally |
| Mobile | React Native 0.81.5 / Expo SDK 54, bundle `com.cannon.mobile`, scheme `cannon` |
| API | Render `srv-d6vik1h5pdvs738m8l2g` → https://maxapp-api.onrender.com (deploys are **manual**, via API) |
| DB | Supabase Postgres, transaction pooler, port **6543** |
| Secrets | `backend/.env` — read from disk |
| Apple | key `422MKHNWD5`, issuer `c4c8d671-d14d-48b8-a605-94c23a63b2fa`, app `6761345332`, team `3TJ8RC3JCX` |

Tests: the backend suite has ~14 **pre-existing** failures that only appear in
full-suite runs. Diff failure *sets* against a clean tree before blaming your
change.
