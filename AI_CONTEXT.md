# Max App - Complete System Context

This document is a self-contained briefing on the Max application. It is written so that an AI or engineer with zero prior context can read it and understand the whole system: what the product is, how the code is laid out, the architecture, the data model, external integrations, deployment, local dev, and the conventions and gotchas that matter.

No secret values appear in this document. Where a credential or key is relevant, only the environment variable NAME is given. Real values live in `.env` files and in the Render dashboard.

---

## 1. TL;DR

Max is a mobile self-improvement ("looksmaxxing") app. A user signs up, answers an onboarding questionnaire, ranks five improvement goals, optionally scans their face, subscribes, and then gets an AI-generated daily routine plus an AI coach they can chat with and that texts them reminders.

- Frontend: React Native via Expo (TypeScript), ships to iOS (App Store), Android, and web.
- Backend: FastAPI (Python), hosted on Render at `https://maxapp-api.onrender.com/api/`.
- Data: Supabase Postgres (per-user data) + AWS RDS Postgres (shared catalog) + AWS S3 (images) + MongoDB (legacy/optional).
- AI: HuggingFace dedicated endpoint for chat (default), Google Gemini for face-scan vision, with OpenAI and Mistral as fallbacks. RAG over markdown docs using BM25.
- Payments: Stripe (web) and Apple In-App Purchase (iOS).
- Messaging: Apple Push (APNs) and Sendblue (iMessage/SMS) for coaching reminders, scheduled by an in-process APScheduler.

Important naming note: the PRODUCT is called "Max", but the CODEBASE internal codename is "cannon" everywhere (bundle id `com.cannon.mobile`, scheme `cannon://`, slug `cannon-mobile`, DB names `cannon_db` / `cannon_shared`, S3 bucket `cannon-app-uploads`). Treat "cannon" and "Max" as the same project.

---

## 2. The Product

### The five "Maxes"

The whole app is organized around five improvement verticals, each called a "Maxx":

1. Skinmax - facial skin (hydration, glow, acne, redness, aging).
2. Hairmax - hair density, regrowth, texture.
3. Heightmax - posture, spinal decompression, deep sleep (posturemaxxing).
4. Bonemax - bone density, jaw, frame.
5. Fitmax - physique, strength, body composition (workouts, macros, cardio).

Each Maxx is effectively a program with: modules (some free, some premium), concerns (inferred from the face scan), a schedule generator (AI builds a daily routine), and access tiers. Fitmax has its own extra subsystem (macro targets, workout tracker, calorie log, progress).

### Core user journey

1. Landing -> Sign up (email + password, optional phone).
2. Onboarding: an 8-step form (gender, age, height, weight, daily schedule/obligations, drag-to-rank the five Maxes, intensity preference chill/standard/sweatmode, optional Onairos personalization). Top 3 ranked Maxes become the user's goals.
3. The backend immediately generates a routine for the #1 ranked Maxx; the app shows it on a "Routine Reveal" payoff screen.
4. Features intro -> Face scan (camera captures front + left + right photos) -> results (face metrics, suggested modules).
5. Paywall: subscribe via Stripe (web) or Apple IAP (iOS). Tiers are basic and premium, billed weekly.
6. Post-subscription: optional SMS coaching setup (Sendblue), notification preferences, pick first Maxx.
7. Main app (tabbed): Home dashboard, AI Chat coach, Planner (weekly schedule), Forums (coming soon).
8. Ongoing: the backend scheduler sends SMS/push reminders for routine tasks, a nightly progress-photo prompt, and coaching check-ins.

---

## 3. Repository Layout

Repo root: `/Users/home/maxapp/`

- `backend/` - FastAPI application (Python 3.11/3.12).
- `mobile/` - React Native / Expo app (TypeScript).
- `data/` - RAG content as markdown ("MaxDoc" format), loaded into memory at backend startup and packaged into the production Docker image.
- `cannon_facial_analysis/` - a separate legacy FastAPI face-analysis service (port 8001). NOT used by the current scan flow; Gemini vision replaced it. Kept for backward compatibility.
- `web/` - sparse web bits.
- `docs/`, `legal/`, `rds_templates/` - documentation, legal templates, RDS schema helpers.
- `render.yaml` - Render Blueprint for deploying the backend.
- `Dockerfile` - production image (repo-root build context; copies `backend/` and `data/`).
- `README.md` - quick-start for the three services.
- `DEPLOY.md` - the authoritative Render + Vercel deploy guide.

---

## 4. Tech Stack at a Glance

Frontend
- Expo SDK ~54, React Native 0.81.5, TypeScript.
- React Navigation (native stack + bottom tabs).
- State: React Context (auth/user) + TanStack React Query (server state). No Redux/Zustand.
- HTTP: axios with JWT auth interceptors and refresh.
- Storage: expo-secure-store on native, localStorage on web.
- Payments: @stripe/stripe-react-native (web) + react-native-iap (iOS).
- Fonts: Matter (sans), Playfair Display (serif).

Backend
- FastAPI + Uvicorn, async throughout.
- SQLAlchemy 2.x async ORM + asyncpg (two Postgres engines).
- LangChain + LangGraph for the chat agent; provider SDKs for OpenAI, Gemini, Mistral; HuggingFace TGI via OpenAI-compatible API.
- APScheduler for background notifications.
- boto3 (S3), stripe, httpx (HTTP/2 for APNs), passlib/bcrypt + python-jose/PyJWT (auth), tiktoken (token budgeting), pgvector (optional), Pillow.
- pytest + pytest-asyncio for tests.

---

## 5. System Architecture

```
                 +-----------------------------+
                 |   Mobile app (Expo RN/TS)    |
                 |  iOS / Android / Web         |
                 |  axios -> EXPO_PUBLIC_API_..  |
                 +--------------+--------------+
                                |  HTTPS, JWT Bearer
                                v
                 +-----------------------------+
                 |   FastAPI backend (Render)   |
                 |  /api/* routers              |
                 |  lifespan: init DBs, warm    |
                 |  RAG, start scheduler        |
                 +--+-------+-------+--------+--+
                    |       |       |        |
        Supabase PG |  AWS RDS PG   |  AWS S3 |  MongoDB (legacy)
        (per-user)  |  (shared)     | (images)|
                    |       |       |        |
        +-----------+       |       |        +-- LLMs: HuggingFace (chat),
        chat, scans,        courses,  scan/progress     Gemini (vision),
        schedules,          maxes,    photos            OpenAI/Mistral (fallback)
        users, RAG docs     forums                +-- Stripe + Apple IAP (billing)
                                                  +-- APNs + Sendblue (notify)
                                                  +-- Onairos (personalization)
```

The backend is the single hub. The mobile app never talks to the databases or third parties directly (except the Onairos consent SDK and the IAP/Stripe client SDKs); everything else flows through `/api`.

---

## 6. Frontend (mobile/)

### Identity and build config
- App display name: Max. Slug: `cannon-mobile`. Scheme: `cannon://`.
- iOS bundle id: `com.cannon.mobile`. Android package: `com.cannon.mobile`.
- Version: app.json `3.0.8`, iOS build number `309` (app.json is authoritative for builds; package.json may lag).
- EAS project id: `f3fa5d9c-7073-4b53-9376-6b2f693c6a39`.
- iOS submit: ASC App ID `6761345332`, Apple Team ID `3TJ8RC3JCX`.
- iOS entitlement: `aps-environment: production` (APNs).
- Plugins/permissions: expo-camera (face scan), expo-media-library, expo-video, expo-audio, expo-notifications, Stripe RN, react-native-iap. Android perms include CAMERA, RECORD_AUDIO, READ_MEDIA_IMAGES.

### Navigation (navigation/RootNavigator.tsx)
Conditional stacks chosen by auth + payment + role:
- Guest (not authenticated): Landing, Login, Signup, ForgotPassword, Settings, Legal.
- Scan-only user: a trimmed scan-only navigator.
- Admin: admin navigator.
- Unpaid (onboarding funnel): Onboarding -> RoutineReveal -> FeaturesIntro -> FaceScan/Results -> Payment -> ThankYou.
- Paid (full app): Main tab navigator plus repeat scans, SMS setup, notification channels, module select, profile/account screens, course/schedule/maxx screens, the Fitmax subsystem.

Bottom tabs (navigation/TabNavigator.tsx): Home, Chat, Planner, Forums (gated as "coming soon").

### Screens (~56 total), by feature area
- Auth: Login, Signup, ForgotPassword, Landing.
- Onboarding: Onboarding (8-step), FeaturesIntro, RoutineReveal.
- Scan: FaceScan, FaceScanResults, ScanDetail, Analyzing.
- Payment: Payment (Stripe SetupIntent + tier select), PaymentThankYou.
- Chat: MaxChatScreen (multi-turn AI coach, conversation history).
- Courses/Maxes: CourseList, CourseDetail, ChapterView (rich-text reader), Schedule, MaxxDetail, MasterSchedule.
- Fitmax: FitmaxPlan, FitmaxWorkoutTracker, FitmaxCalorieLog, FitmaxProgress, FitmaxModule.
- Profile/Account: Profile, EditPersonal, PersonalInfo, DayPlanner, MyProducts, ManageSubscription, ProgressArchive, FaceScanArchive.
- Settings: Settings (legal, support, version, coaching tone, response length, notif prefs).
- SMS/Notifications: SmsCoachingIntro, SendblueConnect, NotificationChannels.
- Forums v2: ForumsHomeV2, SubforumThreadsV2, ThreadV2, NewThreadV2, ForumNotificationsV2, plus legacy ChannelChat.
- Leaderboard: Leaderboard.
- Admin: Dashboard, UserManage, ForumManage, LeaderboardManage, ChannelReports, UserChat, Support.
- Legal: LegalDocument.

### State management
- AuthContext (context/AuthContext.tsx): holds `user`, `isLoading/isAuthenticated/isPaid/isPremium/isScanUser`, `subscriptionTier`. Methods: login, signup, faux* (dev shortcuts), logout, refreshUser, deleteAccount. On boot it restores the JWT and fetches `/api/users/me`, registers the iOS APNs token, and subscribes to an "auth lost" event to tear down state on permanent 401.
- React Query (lib/queryClient.ts, hooks/useAppQueries.ts): server state with 5-min stale time, 30-min gc. Query keys cover maxes, maxx schedules, active schedules, forum v2 entities, chat history/conversations, channels. Retries skip 401/403.
- No Redux/Zustand. Local component state otherwise.

The `User` object carries an `onboarding` blob (goals, priority_ranking, body metrics, unit system, timezone, flags like `post_subscription_onboarding`, `main_app_tour_completed`, `sendblue_sms_engaged`) and a `profile` blob (level, rank, streak_days, avatar, bio, master schedule streak).

### API client (services/api.ts)
- One axios instance. Base URL from `EXPO_PUBLIC_API_BASE_URL`.
- Request interceptor attaches the JWT; strips Content-Type for multipart.
- Response interceptor: on 401 it refreshes the token once (deduplicated across concurrent calls) and retries; transient network errors get one retry on idempotent GETs; permanent failure emits "auth lost".
- Per-call timeouts: default ~12s, auth 45s, chat 120s, schedule generation 60s, scan upload 60s.
- Notable methods: auth (signup/login/refresh/logout/deleteAccount), getMe, saveOnboarding, uploadScanTriple (uses fetch + FormData because axios multipart fails 422 in RN), analyzeScan/getLatestScan (poll), getMaxxes/getMaxx, getCourses, sendChatMessage, getChatHistory, generateSchedule/generateMaxxSchedule/getMaxxSchedule/getActiveSchedulesFull, Stripe + Apple IAP verification, leaderboard, admin, Onairos connect/status.

### Theme (theme/dark.ts)
- Light, editorial palette (off-white background `#f8f8fa`, white cards, charcoal `#111113` primary text/accent, gold `#D4A017` for premium, standard green/amber/red/blue semantics). Fitmax accent is teal `#0f766e`.
- Spacing scale, border radii, typography (Matter + Playfair), shadow tokens. No external UI kit; all components are custom (components/ has CachedImage, course readers, chat widgets, section headers, streak badge, modals, a Stripe provider gate, and a DEV-only DevDrawer).

### Persistence (services/storage.ts)
- Secure store (Keychain/Keystore) on native, localStorage on web.
- Stores access_token and refresh_token, and a face-scan draft (`faceScanDraft`, `pendingFaceScanSubmit`) so an interrupted upload resumes after relaunch.

---

## 7. Backend (backend/)

### Entry point and lifespan (main.py)
FastAPI app with an async lifespan that on startup runs, in order:
1. `settings.validate_production_config()` (fail fast on missing prod secrets).
2. `init_db()` (Supabase: create/verify tables, run idempotent column migrations).
3. `refresh_prompt_cache()` (load system prompts from DB into memory).
4. `init_rds_db()` (AWS RDS; no-op if no RDS password).
5. Warm RAG BM25 indexes and the task catalog in parallel.
6. `start_scheduler(app)` (APScheduler for notifications).

Middleware: GZip, CORS (explicit origins + a localhost/LAN regex enabled when not production or when debug), a PrivateNetworkAccess middleware for Chrome local-network preflight, and a global exception handler that always attaches CORS headers. Routers mount under `/api`. Static: `/` returns a banner, `/health` returns `{"status":"healthy","build":...}`, `/uploads` serves local files. Critical detail: the lifespan runs before Uvicorn serves traffic, so a slow startup step (Supabase migration round-trips) delays first response.

### Routers (backend/api/, all under /api)
auth (signup, login, token refresh, SMS forgot-password), users (me, profile, coaching-tone, leaderboard-rank), scans (upload, analyze, fetch), payments (Stripe setup-intent/subscribe/webhook, subscription status, Apple IAP verify), courses, events, forums (legacy channels), forums_v2 (categories/subforums/threads/posts/votes/watches), admin_forums_v2 (moderation), chat (send-message, history, rag-query, face-scan-analysis, scripted onboarding flows), leaderboard, admin (analytics, prompt/RAG reloads), notifications, schedules (generate, generate-maxx, adapt, complete-task, edit-task), maxes (catalog, modules, check-ins, progress), sendblue_webhook (inbound SMS), onairos (consent handoff).

### Services (backend/services/, ~79 modules) - the important clusters
- LLM/chat core: `llm_provider.py` (provider selector), `lc_providers.py` (LangChain builders + fallback chains), `lc_agent.py` (agent executor, large), `lc_graph.py` (optional LangGraph state machine: guardrail -> classify -> retrieve -> trim -> agent -> finalize), `lc_chains.py`, `lc_tools.py`, `lc_memory.py`, `gemini_service.py` (face vision + fallback), `openai_service.py` (vision + HF TGI via OpenAI compat).
- RAG: `rag_service.py` (BM25 over the `rag_documents` table, lazy per-maxx, warmed at startup; no vector search by default), `fast_rag_answer.py` (cheap grounded answer without the agent), `rag_prompt_selector.py`, `task_catalog_service.py` (in-memory task definitions from data/maxes), `max_doc_loader.py`, `web_search.py` (DuckDuckGo fallback).
- Scheduling/planner: `schedule_service.py` (core generator, very large), `schedule_dsl.py` (hand-written eligibility-expression and time-window evaluator, no eval()), `schedule_validator.py` (deterministic validate + auto-fix), `schedule_skeleton.py` (places empty time slots first), `schedule_generator.py`, `schedule_adapter.py` (regenerate on feedback), `schedule_runtime.py` (today's tasks, completion, streaks), `schedule_streak.py`, `schedule_master_merge.py`, `multi_module_collision.py` (caps total daily tasks across active Maxes).
- Chat support: `chat_intent_detector.py` (KNOWLEDGE/SOCIAL/CHECK_IN/SCHEDULE/COACHING/CUSTOM), `chat_conversations_service.py`, `chat_telemetry.py`, `coaching_service.py` (builds coaching context), `conversation_memory.py` (trim/summarize), `persona_prompts.py` (tone), `user_context_service.py`.
- Per-Maxx logic and notifications: `skinmax.py`, `fitmax_plan.py`, `maxx_guidelines.py` (large protocol/concern definitions), and per-Maxx notification engines (skinmax/fitmax/hairmax/heightmax/bonemax), plus bonemax scripted chat prompt.
- Products: `product_catalog.py`, `product_search.py`, `fast_product_links.py`, `link_validator.py`.
- Storage/media: `storage_service.py` (S3 in prod, local filesystem fallback in dev).
- Payments: `stripe_service.py`, `apple_iap_service.py`.
- Notifications/scheduling: `scheduler_job.py` (APScheduler jobs, dedup by intent bucket, grace windows), `apns_service.py` (HTTP/2 + JWT), `sendblue_service.py` (iMessage/SMS), `push_scheduling_service.py`, `notification_prefs.py`, `sms_mms_ingest.py`, `sms_reply_style.py`.
- User data: `user_facts_service.py`, `user_facts_validator.py`, `user_facts_async_extractor.py`, `guideline_service.py`.
- Onboarding: `onboarding_questioner.py`.
- Personalization: `onairos_service.py`.
- Prompts: `prompt_loader.py` (DB-cached, hourly refresh, hardcoded fallback), `prompt_constants.py`, `token_budget.py`.

### Data models (backend/models/)
SQLAlchemy models split across two databases (see section 8), plus pydantic request/response schemas (user, schedule, scan, payment, course, event, forum, forum_v2, leaderboard).

### Scheduling pipeline (the signature feature)
1. Skeleton: given wake/sleep, day count, and an intensity cap (chill 0.5x, standard 1.0x, sweatmode 1.5x, with a week-1 ramp), place empty task slots across the day respecting work hours, obligations, and preferred workout windows.
2. LLM fill: build a prompt with module guidelines and user context, send to Gemini, get back per-slot title/description/type/duration. Titles are constrained (short, action-first, no filler, no em-dashes).
3. Validate and fix: deterministic checks (valid task ids, counts, time collisions, sleep violations, duplicate titles, oversized descriptions). Soft issues auto-fixed; hard errors trigger an LLM retry.
4. Adapt: on user feedback ("too intense"), regenerate only affected days in a compact mode.
5. Runtime: fetch active schedule, expose today's tasks, mark completion, compute streaks.
6. Background: APScheduler ticks (every ~5 min), and for each due task sends one SMS/push per intent bucket within a grace window, plus a nightly progress-photo prompt and daily coaching check-in. Multi-module collision logic caps total daily load when a user runs several Maxes at once.

### Auth
JWT (HS256) signed with `JWT_SECRET_KEY`. Access token ~24h, refresh ~10 months. Passwords are SHA-256 pre-hashed (to handle >72 chars) then bcrypt-hashed. Middleware extracts the Bearer token, verifies it, injects the current user, and a paid-user guard protects premium routes.

### Tests
~22 pytest files under backend/tests covering schedule quality/regressions, planner chat, starter routine, time overrides, RAG retrieval and prompt selection, max-doc parsing, persona matrix, chat routing/conversations/telemetry, context building, token budgets, bedtime prompt timing, Onairos, and routine part removal. Plus schedule-quality eval harness scripts.

---

## 8. Data Architecture (what lives where)

There are two Postgres databases on purpose, plus S3 and an optional MongoDB.

Supabase Postgres - per-user data (db/sqlalchemy.py, models/sqlalchemy_models.py)
- Users (`app_users`), password reset OTPs, coaching state, scans, payments, course progress, leaderboard entries, chat conversations + chat history, scheduled notifications, progress photos, user schedules, RAG documents (`rag_documents`), channel message reports, system prompts, Onairos connections.
- Connection via asyncpg with a small pool. Production should use the Supabase Transaction pooler (port 6543) to avoid connection exhaustion. `statement_cache_size=0` for PgBouncer compatibility.
- Session dependency: `get_db()`.

AWS RDS Postgres - shared catalog data (db/rds.py, models/rds_models.py)
- Maxes (the five programs with protocols/concerns/schedule rules), courses, forum categories/subforums/threads/posts/votes/watches, legacy forums and channel messages, events.
- Only initialized when `AWS_RDS_PASSWORD` is set; otherwise it degrades gracefully. `get_rds_db()` raises 503 if unconfigured; `get_rds_db_optional()` yields None.

AWS S3 - image storage (services/storage_service.py)
- Bucket `cannon-app-uploads` (region in `AWS_S3_REGION`). Stores scan stills (`scans/{user_id}/...`) and progress photos (`progress_pics/{user_id}/...`).
- Production only. Locally, with no AWS keys, it falls back to the filesystem under `backend/uploads/` and serves via `/uploads`.

MongoDB - configured but secondary
- `MONGODB_URI` / `MONGODB_DATABASE` (default db `cannon_db`). Present in config and connectable; in practice the primary stores are Supabase + RDS. Treat Mongo as legacy/optional/ephemeral rather than a source of truth.

---

## 9. External Integrations

LLM providers
- HuggingFace dedicated inference endpoint is the default chat provider (`LLM_PROVIDER=huggingface`, `HF_TOKEN`, `HF_ENDPOINT_URL`, `HF_MODEL=tgi`), called through the OpenAI-compatible API. Text only.
- Google Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash`) is the vision model for face scans and a chat fallback. If absent, scans return neutral placeholder metrics.
- OpenAI (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL`) and Mistral (`MISTRAL_API_KEY`) are fallbacks. `LLM_TIMEOUT_SECONDS` bounds calls.

Payments
- Stripe (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_WEEKLY_BASIC`, `STRIPE_PRICE_ID_WEEKLY_PREMIUM`): SetupIntent then subscription, with webhook handling. Used on web/Android.
- Apple IAP (`APPLE_APP_STORE_CONNECT_ISSUER_ID`, `..._KEY_ID`, `..._PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `APPLE_IAP_PRODUCT_ID_BASIC`, `APPLE_IAP_PRODUCT_ID_PREMIUM`, `APPLE_ASN_SHARED_SECRET`): transaction verification + subscription sync on iOS.

Notifications
- APNs (`APNS_AUTH_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_USE_SANDBOX`): direct HTTP/2 push. Optional; silently skipped if unconfigured. Device tokens stored on the user row.
- Sendblue (`SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`, `SENDBLUE_FROM_NUMBER`, `SENDBLUE_WEBHOOK_SECRET`): iMessage/SMS coaching reminders driven by the scheduler. Inbound replies hit `/api/sendblue/receive`. The product SMS number is +1 (646) 830-4204. `SMS_SCHEDULER_TEST_FAST_MODE=true` speeds up ticks in dev.

Personalization
- Onairos (`ONAIROS_PARTNER_API_KEY` optional, `ONAIROS_HTTP_TIMEOUT_SECONDS`, `ONAIROS_TRAITS_TTL_SECONDS`): the mobile SDK runs a consent flow, then posts a per-user token to `/api/onairos/connect`. The backend caches personality traits (12h TTL) and injects them into coaching context. Tokens are per-user and rotate on re-consent.

Legacy/unused
- `cannon_facial_analysis/` service (EC2 `13.236.183.141:8001`, `FACIAL_ANALYSIS_API_URL`) is superseded by Gemini vision. `GROQ_API_KEY` exists but is disabled.

---

## 10. Environments and Config

Config is `backend/config.py` (pydantic settings) loaded from `.env`. The app distinguishes dev vs prod via `APP_ENV` (development/staging/production) and `DEBUG`.

Frontend target selection
- Dev app `.env`: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/` (so the local app calls the local backend).
- EAS development and production build profiles: `EXPO_PUBLIC_API_BASE_URL=https://maxapp-api.onrender.com/api/` (builds call Render).

Designed fallbacks (so local dev works without prod infra)
- No AWS keys -> S3 falls back to local filesystem storage.
- No `AWS_RDS_PASSWORD` -> RDS init is skipped; RDS-only routes degrade (503 or optional None).
- No `GEMINI_API_KEY` -> scans return neutral placeholder metrics.
- APNs/Sendblue unconfigured -> push/SMS are silently skipped.

Production validation refuses to boot if `JWT_SECRET_KEY` is still the placeholder, or if Supabase host/password look like local defaults.

Other config groups (names only): JWT (`JWT_SECRET_KEY`, `JWT_ALGORITHM`, expiry settings), RAG (`RAG_TOP_K`, `RAG_SCORE_THRESHOLD`, `RAG_HYBRID_ENABLED`, embedding + BM25/RRF knobs), chat (`CHAT_USE_LANGGRAPH`, context token caps, scripted-onboarding flags), `SCHEDULE_ADAPT_MAX_OUTPUT_TOKENS`, `CORS_ORIGINS`, `APP_NAME`, `SQL_ECHO`.

---

## 11. Deployment

Backend (Render)
- `render.yaml` blueprint: service `maxapp-api`, Docker runtime, Oregon region, Starter plan (must be always-on because APScheduler runs in-process; free tier would spin down and stop SMS). Health check `GET /health`.
- Dockerfile (python:3.12-slim): installs build/Postgres libs, installs `backend/requirements.txt`, copies `backend/` and `data/`, exposes 8000, starts `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`.
- Production URL: `https://maxapp-api.onrender.com/api/`. The Render auto-deploy webhook has been broken since a repo transfer, so deploys may need a manual trigger in the Render dashboard.

Mobile (EAS)
- Profiles in `mobile/eas.json`: development (internal), preview, production (iOS auto-increment, Android app-bundle). API base URL points to Render in development and production profiles.
- iOS submit config carries the ASC App ID and Apple Team ID.

Web (Vercel)
- Root `mobile/`, build `npm run build:web` (expo export), output `mobile/dist/`, SPA rewrites to index.html. `EXPO_PUBLIC_API_BASE_URL` injected at build time.

CI/CD
- No GitHub Actions. Deploys are manual (Render blueprint, EAS build, Vercel import). Tests run locally with pytest, not in CI.

---

## 12. Local Development

Run the backend
- Interpreter with deps: pyenv Python 3.11.7. Command: `python -m uvicorn main:app --host 0.0.0.0 --port 8000` from `backend/`.
- First boot can take ~45s because the lifespan runs Supabase migrations and warms caches before serving; this is normal, not a hang.
- Locally it logs "AWS not configured - using local file storage" and "RDS not configured - skipping RDS init"; both are expected.

Run the mobile app (web) for quick iteration
- `npm run start:web:local` in `mobile/` (expo start --web --localhost --clear). The `--clear` flag forces a cold ~11MB Metro bundle compile each launch.
- The web app calls the backend at `http://localhost:8000/api/`; backend CORS already allows localhost and LAN origins in non-production.

Ports: backend 8000, legacy facial analysis 8001 (unused), Expo/Metro 8081, Expo web preview commonly 19006.

Environment notes specific to this machine
- macOS has no `timeout` binary; the AWS CLI default region was misconfigured (pass `--region us-east-2` explicitly); some AWS IAM read permissions are missing for the dev user, so prod AWS health is usually inferred from the running Render backend rather than the AWS control plane.

---

## 13. Conventions and Gotchas

Naming
- Product is "Max", codebase codename is "cannon". Same thing. Expect `cannon` in bundle ids, scheme, DB names, and the S3 bucket.

Copy rules (enforced in all user-facing app text and backend user-facing copy)
- No em-dashes, en-dashes, or curly quotes. No markdown bold/italic in app strings. Blunt, plain, gym-coach voice. No emojis (code comments and JSDoc are exempt). The schedule generator and validator actively strip em-dashes and enforce short, plain titles.

Secrets and safety
- Never commit or print secret values. Secrets live only in `.env` and the Render dashboard.
- Standing deploy default: when changes are ready and green, commit and push to main only. Do not trigger an EAS/TestFlight build unless explicitly asked to "push to TestFlight".

Architecture gotchas
- The FastAPI lifespan runs before serving, so any slow startup step delays the first HTTP response (looks like a hang but is just first-boot migration latency).
- A stale local `uvicorn --reload` process can hold port 8000 and table locks, causing the next start's idempotent column migrations to time out; kill stale workers if startup logs show lock timeouts.
- Scan upload uses fetch + FormData instead of axios, because axios multipart fails with 422 in React Native.
- The Forums tab is built (v2 thread UI) but gated behind a "coming soon" overlay.
- Two payment paths exist: Stripe for web/Android, Apple IAP for iOS. Keep them in sync on subscription state.

Known follow-ups (not blocking)
- SMS re-entry UI for settled users; some long-form copy still needs em/en-dash cleanup; a handful of pre-existing TypeScript errors in a couple of course/scan screens; Android notification-channel coercion.

---

## 14. Glossary

- Maxx / the five Maxes: the improvement verticals (skinmax, hairmax, heightmax, bonemax, fitmax). Each is a program with modules, concerns, and a schedule generator.
- Routine / schedule: the AI-generated set of daily tasks for a Maxx, placed across the day around the user's real obligations.
- Intensity: chill / standard / sweatmode, a multiplier on daily task load with a gentler week-1 ramp.
- Onboarding blob: the JSON on the user row capturing goals, priority ranking, body metrics, and progress flags.
- RAG document: a markdown chunk in `rag_documents` retrieved by BM25 to ground chat answers.
- Intent bucket: a category (morning wake, workout, evening, etc.) used to dedupe notifications so a user gets at most one SMS per bucket per day.
- Scan triple: the three face photos (front, left, right) captured for analysis.
- Sendblue: the iMessage/SMS provider for coaching texts (replaced Twilio).
- Onairos: a personalization provider; a per-user consent SDK hands the backend a token to fetch personality traits.
- cannon: the internal codename for the Max project.
