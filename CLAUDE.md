# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

Monorepo for **Max**, a looksmaxxing coaching app.

- `backend/` — FastAPI API (Python **3.12**), the main server. Postgres via Supabase. (The root `README.md` is stale: it says "FastAPI + MongoDB / Python 3.8" — neither is true.)
- `mobile/` — Expo / React Native app (Expo SDK 54, RN 0.81), iOS-first, ships to TestFlight via EAS.
- `cannon_facial_analysis/` — a **separate** FastAPI + MediaPipe service computing face-scan metrics. The backend calls it over HTTP (`settings.facial_analysis_api_url`); it is not imported.
- `web/` — a few static/Stripe-embedded pages. `docs/`, `legal/`, `data/`, `rds_templates/` — assets/docs.

## Commands

### Backend
```bash
cd backend
# CRITICAL: Python 3.14 breaks langchain/pydantic at import. Use 3.12.
# A prebuilt venv exists at backend/.venv312 (create with: python3.12 -m venv .venv312 && .venv312/bin/pip install -r requirements.txt)
.venv312/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000   # add --reload for dev
.venv312/bin/pytest                                                  # all tests
.venv312/bin/pytest tests/test_chat_routing.py::test_name -q         # one test
```
- The local backend connects to the **production Supabase DB** — local test users/data land in prod.
- For reliable local chat, pin the LLM: prefix uvicorn with `LLM_PROVIDER=openai` (the default `gemini` has no local key and the failover hits a Claude timeout, returning the "trouble reaching my brain" fallback).
- Prod start (Render, see `backend/Dockerfile`): `uvicorn main:app --host 0.0.0.0 --port ${PORT}`.

### Mobile
```bash
cd mobile
npx expo start --lan          # or: npm run start:clear
# compile-check one file without a full bundle:
node -e "require('@babel/core').transformFileSync('screens/x.tsx', {presets:['babel-preset-expo']})"
```
- No JS unit-test runner. UI tests are **Maestro** flows in `mobile/maestro/*.yaml`.
- iOS builds: `eas build --platform ios --profile production --auto-submit`. `buildNumber` lives in `app.json`. The production API URL is hardcoded in `eas.json` (`.env.local` is ignored by EAS).
- `mobile/.env.local` (gitignored) overrides the API base URL for local dev — point it at the Mac's **LAN IP** (changes when the network changes), not `127.0.0.1`.

## Backend architecture

- **Entry** `backend/main.py` registers ~23 routers under `/api` (auth, users, scans, payments, courses, chat, schedules, maxes, marketplace, personalization, achievements, …). A global exception handler redacts internals in production and maps DB-connectivity errors to a clean 503.
- **DB** `backend/db/sqlalchemy.py` — SQLAlchemy async + asyncpg against Supabase. Production **must** use the transaction pooler: host `aws-…pooler.supabase.com`, `SUPABASE_DB_PORT=6543`, user `postgres.<project-ref>`. **Gotcha:** never send `search_path` as an asyncpg startup parameter through the pooler — Supavisor closes the connection on the first query ("connection was closed in the middle of operation"). The DB role already defaults `search_path` to `public, extensions`. `/health` returns `{build, db}`; boot logs print `[DB] mode=transaction|session|direct`.
- **Config** `backend/config.py` — pydantic settings, all from env. `is_production` hard-gates dev-only endpoints (faux-signup, dev Google, test-activate) so they can't mint paid accounts in prod.
- **LLM** `backend/services/lc_providers.py` — multi-provider with failover, selected by `LLM_PROVIDER` (`huggingface` fine-tuned default, `gemini`, `openai`, `mistral`). `backend/services/claude_service.py` is Anthropic single-shot (used for task guides). No provider SDKs are imported outside these two files.
- **Chat agent** `backend/services/lc_agent.py` — a LangChain tool-calling `AgentExecutor` (~22 tools: schedule CRUD, `recommend_product`, `search_knowledge`, `web_search`, `remember_about_user`). `build_agent_system_prompt` assembles the prompt: persona (`services/prompt_constants.MAX_CHAT_SYSTEM_PROMPT`) + appended voice/MCQ/product-link rules + injected `KNOWN PROFILE` (user facts). `backend/api/chat.py` routes a turn through a **fast RAG path** (`answer_from_rag`, early-returns) OR the **full agent** (`run_chat_agent`) — they are mutually exclusive. MCQ markers `[CHOICES]a|b|c[/CHOICES]` / `[CHOICES_MULTI]` are emitted by the model and parsed out into a `choices` array in `api/chat.py`.
- **RAG / maxxes** the five programs are `skinmax`, `hairmax`, `fitmax`, `heightmax`, `bonemax`; their coaching docs live in `backend/rag_content/<maxx>/`.
- **Personalization** `services/personalization.py` (unified brief) + `services/user_facts_service.py` (the persisted `KNOWN PROFILE` blob) — injected into the chat prompt; this is the "never re-ask known facts" mechanism.
- **Schedules** `services/master_schedule.py`, `schedule_master_merge.py`, `schedule_*.py` build/merge a user's program schedule. **Task guides** (`services/task_guide_service.py`) are LLM-generated step-by-step guides, cached in the `task_guides` table and pre-warmed via `pregenerate_for_schedule`.
- **Marketplace** `backend/api/marketplace.py` + `backend/data/product_catalog.yaml`. Native maxes are **included** in the subscription (Chad/premium = 3 active-program slots, 7-day swap lock; legacy Lite = 2, grandfathered); creator courses are paid via **Apple IAP** (`com.cannon.creator.*`). `product_catalog.yaml` is the **only** source for product recommendations — `services/link_validator.py` rejects any URL not in it.
- **Payments** **Apple IAP (StoreKit) ONLY** — `services/apple_iap_service.py` verifies via the App Store Server API. **Stripe billing is retired** (every Stripe subscription endpoint 410s via `STRIPE_BILLING_RETIRED`; webhook/`/status` stay mounted inert). One plan: **Chad** (`premium`); Chad Lite (`basic`) retired but grandfathered, `basic→premium` everywhere. **Trial = subscription = full access** (never gate on trial-vs-sub). See `MAX_BIBLE.md` for the canonical product + entitlement truth.

## Mobile architecture

- **Entry** `mobile/App.tsx` → `navigation/RootNavigator.tsx`. The root `Stack.Navigator` is **keyed on auth/paid state** (`stackKey`) — flipping `isPaid` remounts the whole navigator, swapping the unpaid funnel for the paid app. Post-purchase routing depends on this remount.
- **API** `mobile/services/api.ts` — axios client. `resolveApiBaseUrl()` chooses the base URL: production from `.env`, or in dev swaps a loopback URL to the Metro LAN host (falling back to prod if it can't detect one). Auth via Bearer token in `context/AuthContext.tsx`.
- **State** `@tanstack/react-query`. Use the canonical keys in `lib/queryClient` (`queryKeys`) — e.g. all `/active/full` fetches must use `queryKeys.schedulesActiveFull` or achievement celebrations are routed to the wrong cache and lost. Task toggles use optimistic updates (no network-gated spinner).
- **Auth tiers** `isPaid` = any subscription; `isPremium` = Chad (premium) or admin. Gate Chad-only features (e.g. daily face rating) on `isPremium`, not `isPaid`.
- **DevDrawer** `components/DevDrawer.tsx` switches guest/onboarding/paid by calling faux-signup endpoints, which are **404 in production** — it only works against a local backend (see `.env.local`).
- **Feature flags** `constants/featureFlags.ts` (`faceScan`, `onboardingV2`, `todayV2`, …) gate funnel and home behavior.

## Deploy & ops

- **Backend → Render** (service `maxapp-api`), auto-deploys on push to `main`. Render env vars are the prod config source of truth (DB pooler creds, `GOOGLE_IOS_CLIENT_ID`, Stripe, Apple keys). A **failed** deploy keeps serving the last good build — confirm a deploy actually went live via `/health`'s `build` string and `[DB] mode=transaction` in the boot logs.
- **Mobile → EAS → TestFlight** (bundle id `com.cannon.mobile`, App Store Connect app id `6761345332`). Native config (Google sign-in URL scheme, IAP, etc.) is baked into the binary, so changes there require a new build.
- **⚠️ `eas update` (OTA) and `eas build` read DIFFERENT env.** A build uses `eas.json`'s `build.<profile>.env` (correct prod API URL) and ignores `.env.local`. **`eas update` runs `expo export` locally, which DOES load `.env.local`** — and `mobile/.env.local` points `EXPO_PUBLIC_API_BASE_URL` at localhost for dev. Publishing an OTA without neutralizing it ships a bundle that points every phone at localhost → "network error" on every API call, app unusable (this happened 2026-07-15). **Always publish OTAs like this:**
  ```bash
  cd mobile && mv .env.local .env.local.bak
  EXPO_PUBLIC_API_BASE_URL="https://maxapp-api.onrender.com/api/" \
    eas update --branch production --message "..." --non-interactive
  mv .env.local.bak .env.local
  ```
  Verify in the output: it must log `env: load .env` (NOT `.env.local .env`).
