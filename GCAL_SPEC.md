# GCAL_SPEC.md — Google Calendar Link + Per-Day Display

## Plan Summary
Let Max users link their Google Calendar (read-only) and see ALL their calendar events on the existing per-day surfaces — the Today/Home view (`TodayScreen`) and the week planner timeline (`DayPlannerScreen` → `ScheduleGrid`) — rendered alongside but visually distinct from app tasks. This is ~70% already built: backend OAuth (`/google/connect`, `/google/callback` with HMAC state, `exchange_code`, `store_connection`, `_fresh_access_token`), a server-side `calendar_events` sync table, a 30-min APScheduler poll (`sync_google_calendars`), and `/planner/today` already projecting calendar events into `structure[]` with `source:'calendar'` all exist. The chosen design is **backend-mediated OAuth**: the refresh token NEVER leaves the server, the client only opens an `auth_url` in the system browser and polls `/google/status`, so the entire mobile change ships **OTA with no EAS/dev rebuild** (uses only `expo-linking`, already installed). Remaining work is three buckets: (1) **harden** — encrypt the OAuth tokens at rest (currently plaintext JSON, the one real production blocker) and add `DELETE /google/disconnect`; (2) **display fixes** — `TodayScreen` currently drops `source`/`event_id` so calendar rows look identical to obligations, and `DayPlannerScreen` never fetches `/planner/today` so its timeline shows ZERO calendar events; (3) **gating** — put the whole feature behind a flag defaulting OFF, so unlinked users get byte-for-byte today's behavior. All-day events get a quiet "All day" treatment (excluded from busy-minutes), recurring events arrive pre-expanded (`singleEvents=true`), and revoked tokens degrade to `connected=false` with a reconnect affordance. The Ralph loop builds this unit-by-unit, stubbing/flagging around the human-only Google Cloud OAuth-client setup so it never blocks.

## Goal
Users link Google Calendar once; their real calendar events (next ~14 days) appear on BOTH the Today timeline and the planner timeline, clearly marked as read-only imported events (not app tasks), with tokens stored server-side encrypted and the feature fully gated behind a flag that, when off, leaves the app exactly as it is today.

## Current-state (real file refs)
Backend:
- `backend/api/google.py` — `router = APIRouter(prefix="/google")`; `_sign_state` (L48) / `_verify_state` (L55) HMAC CSRF; `GET /status` (L66), `GET /connect` (L88), `GET /callback` (L100), `POST /sync` (L128), `POST /gmail/scan` (L138), `GET /proposed` (L147), `POST /proposed/{event_id}` (L173). **No `/disconnect` yet.**
- `backend/services/google_integration.py` — `SCOPE_CALENDAR` (L50, calendar.readonly), `SYNC_WINDOW_DAYS=14` (L53), `build_auth_url` (L141, `access_type=offline` + `prompt=consent`), `exchange_code` (L157), `_fresh_access_token` (L170, refresh dance), `store_connection` (L206), `sync_google_calendar` (L249, window-replace into `calendar_events`).
- `backend/api/planner.py` — `_today_read` uses `calendar_busy_minutes` (L68/74). `GET /planner/today` queries `CalendarEvent` where `is_busy & starts_at<day_end & ends_at>day_start` (L180-189) and appends to `structure[]` as `{time,label,end,source:'calendar',event_id}`. `calendar_event_count` returned. `DELETE /planner/calendar-events/{id}` exists.
- `backend/services/scheduler_job.py` — `sync_google_calendars()` (L958) registered as a periodic interval job (~L1116-1123).
- `backend/models/sqlalchemy_models.py` — `CalendarConnection` (provider, `tokens` JSON **plaintext**, `selected_calendar_ids`, `last_synced_at`, `is_active`); `CalendarEvent` (user_id, connection_id, external_event_id, title, starts_at, ends_at, all_day, is_busy, status, recurrence_rule, raw).
- `backend/config.py` — `google_client_id`, `google_client_secret`, `google_redirect_uri` (no `ENCRYPTION_KEY` yet). **No `backend/services/secrets.py` yet. No `backend/services/feature_flags.py` yet.**

Mobile:
- `mobile/services/api.ts` — `getPlannerToday` (L1277, returns `structure[]` + `calendar_event_count`), `getGoogleStatus` (L1310), `getGoogleAuthUrl` (L1321), `googleSyncNow` (L1328), `getGoogleProposed` (L1338), `resolveGoogleProposed` (L1345), `removeCalendarEvent` (L1350). **No `disconnectGoogle` yet.**
- `mobile/screens/today/TodayScreen.tsx` — merges `structure[]`+`tasks` into rows at L155-162; **`rows.push({kind:'struct', time, label})` DROPS `source` and `event_id`** (bug).
- `mobile/screens/profile/DayPlannerScreen.tsx` — builds `ScheduleGrid` purely from onboarding obligations; **never calls `getPlannerToday`** (bug — no calendar events on the planner timeline).
- `mobile/components/planner/ScheduleGrid.tsx` — `buildEvents` (L76) builds `Ev[]` from `DayShape` + `Obligation[]`; `OB_INK='#34343B'` (L30); obligations pushed at L111-119; renders accent tick at L348. **No `calendarEvents` prop.**
- `mobile/app.json` — scheme `cannon` already registered.
- `mobile/package.json` — `expo-linking`, `expo-web-browser`, `expo-auth-session`, `@react-native-google-signin` ALL already installed/compiled into the current dev client.

## The Design

### OAuth / link flow (backend-mediated, zero token on client)
1. User taps "Connect Google Calendar" (Settings row + dedicated `GoogleCalendarConnectScreen` modeled on `SendblueConnectScreen`).
2. Client `GET /google/connect` → backend `build_auth_url()` returns `{auth_url}` with scope `calendar.readonly` ONLY, `access_type=offline`, `prompt=consent`, and HMAC-signed `state` (`_sign_state`).
3. Client opens `auth_url` in the SYSTEM BROWSER via `Linking.openURL` (no native SDK).
4. Google consent → redirect to `settings.google_redirect_uri` = `GET /google/callback?code&state`.
5. Backend `_verify_state` (CSRF), `exchange_code`, `store_connection` (writes ENCRYPTED tokens), best-effort initial `sync_google_calendar`.
6. Callback returns tiny self-closing HTML; browser closes.
7. App regains focus, polls `getGoogleStatus()` every ~4s until `connected=true`, then invalidates the `plannerToday` query.

No new native dep → **no EAS rebuild**. Optional later nicety: `/callback` 302 to `cannon://google/callback?success=1` handled in `App.tsx` (scheme already registered) — NOT required for v1.

### Token storage + at-rest encryption
Tokens live in `calendar_connections.tokens` (one row/user, `provider='google'`). Today it is **plaintext JSON** = the one must-fix. Fix = app-level Fernet:
- New `backend/services/secrets.py`: `encrypt_token(str)->bytes`, `decrypt_token(bytes)->str`, key from env `ENCRYPTION_KEY` (32+ bytes, Render secret). If `ENCRYPTION_KEY` unset → functions are pass-through no-ops (so dev/tests never break) and log a single warning.
- Add column `calendar_connections.tokens_encrypted` (LargeBinary, nullable). Keep `tokens` JSON during migration.
- Add `tokens_decrypted` ORM `@property`: decrypt `tokens_encrypted`, **fall back to plaintext `tokens`** if encrypted is null (dual-read).
- `store_connection` writes `tokens_encrypted = encrypt(json.dumps(tokens))`, sets `tokens=None`. `_fresh_access_token` reads via `tokens_decrypted`, persists refreshed tokens back encrypted.
- Backfill SQL encrypts existing rows then nulls plaintext; **do NOT drop `tokens` until verified.**

### Sync
Background-sync-to-table (never on render path). Initial sync on `/callback`; periodic `sync_google_calendars` every 30 min per active google connection (refresh token first); on-demand `POST /google/sync`. Per sync: one GET to primary calendar, `timeMin=now-1d`, `timeMax=now+14d`, `singleEvents=true` (Google expands recurrences), `maxResults=250`; window-replace delete+insert per `connection_id`. Read path (`/planner/today`) is one indexed DB query — zero live Google calls; ~1 list call/user/30min.

### Data-model changes (additive only)
- `calendar_connections.tokens_encrypted` LargeBinary nullable (+ optional `tokens_key_id` VARCHAR(8) for rotation).
- Reuse all existing `calendar_events` columns as-is. No new tables. No onboarding JSON change (events are projected at read time, never written to `onboarding.obligations`).

### Per-day DISPLAY integration (reuse the REAL render path)
- **Today (`TodayScreen`)**: `/planner/today` already appends calendar events to `structure[]` and folds `calendar_busy_minutes` into `today_read`. Fix the row mapper (L158-159) to **carry `source` + `event_id`**; for `kind==='struct'` rows with `source==='calendar'` render quiet MUTE (`#97928A`) + a small calendar glyph + "Calendar" tag, **no completion check-circle**, optional long-press "Remove from Max" → `removeCalendarEvent(event_id)`.
- **Planner (`ScheduleGrid` via `DayPlannerScreen`)**: `DayPlannerScreen` must fetch `getPlannerToday(selectedIso)` (gated on connected-state), derive `structure.filter(s=>s.source==='calendar')`, and pass as a NEW optional `calendarEvents` prop. `ScheduleGrid.buildEvents` (after the obligations loop ~L119) pushes one `Ev` per event: `key=cal-${event_id}`, read-only accent `#B0B0B8` (lighter than `OB_INK`), `onPress:undefined`, `source:'calendar'` so the card omits/hairlines the tick and shows a calendar/lock glyph. The existing overlap-column clustering handles task↔calendar collisions for free. All-day events render as a top-of-day "All day · {title}" pill, NOT a full-height block, and are excluded from `calendar_busy_minutes`.

### API surface
Reuse: `GET /google/status`, `GET /google/connect`, `GET /google/callback`, `POST /google/sync`, `GET /planner/today`, `DELETE /planner/calendar-events/{id}`. NEW: `DELETE /google/disconnect` (best-effort Google revoke, `is_active=False`, clear tokens/tokens_encrypted, purge that connection's `calendar_events`) + `api.ts` `disconnectGoogle()`. Gmail endpoints stay gated OFF (calendar.readonly only for v1).

### Mobile changes + native rebuild
Pure JS/TS: Settings row + `GoogleCalendarConnectScreen`, thread `source`/`event_id` through Today, add `calendarEvents` prop + render in `ScheduleGrid`, `DayPlannerScreen` fetch, `disconnectGoogle()`. **NO new native module → NO EAS/dev rebuild → ships OTA.**

## HARD GUARDRAILS
- **Feature flag default OFF.** Add a single backend flag (e.g. `settings.calendar_link_enabled=False` in `config.py`, env-overridable) surfaced via `GET /google/status` as a boolean the client reads to show/hide the connect entry point. When off OR unlinked, the app behaves byte-for-byte as today.
- **App fully works when unlinked.** No `calendar_events` rows → `structure[]` = wake/obligations/sleep exactly as today; `today_read` ignores calendar density. Every new consumer must be null-safe.
- **Refresh tokens stored SERVER-SIDE ENCRYPTED, never in the client.** Client only ever sees `auth_url` + status booleans. Never log tokens.
- **Least scope:** `calendar.readonly` ONLY. Do NOT enable Gmail scope in v1.
- **NO new native module.** If any unit would require one, STOP and flag an EAS-rebuild requirement in `## Needs Human Decision` instead of adding it. v1 must stay OTA-shippable.
- **No secrets committed.** `ENCRYPTION_KEY`, client id/secret live in env/Render only. Never hardcode in source or tests.
- **Timezones/all-day/recurring/revoked:** events stored tz-aware wall-clock UTC; `/planner/today` clamps to `[day_start,day_end)` and only renders same-local-date events (document the midnight-crossing limitation). All-day → quiet pill, excluded from busy-minutes. Recurring → `singleEvents=true` pre-expanded, no client RRULE. Revoked/expired → `_fresh_access_token` returns None → status `connected=false` + reconnect banner.
- **Green-bar rule:** mobile `npx tsc --noEmit` MUST stay clean; backend `pytest` MUST stay green (ignore pre-existing known failures only). Each unit verifies before check-off.
- **iOS sim/Maestro is FLAKY and MULTIPLE sims may be booted.** Do NOT block on it. If you must run the app, pin `--device <UDID>` (pick one booted sim explicitly) and treat failure as non-blocking; prefer tsc + pytest + reading code as the real verification.

## BUILD UNITS
Do them in order. Each: touch the listed files, then run the VERIFY. Early units stub/flag around human-only Google Cloud setup so the loop never blocks.

- [x] **U0 — Feature flag + status gating (no Google needed). (2026-06-28)**
  Files: `backend/config.py` (add `calendar_link_enabled: bool = False`), `backend/api/google.py` (`GET /status` returns `calendar_link_enabled` alongside `oauth_available`), `mobile/services/api.ts` (`getGoogleStatus` return type adds `calendar_link_enabled: boolean`).
  VERIFY: `cd backend && python -c "import config"`; `cd mobile && npx tsc --noEmit`. Confirm `/status` works with NO Google keys set (`oauth_available=false`, no crash).

- [x] **U1 — Token encryption helper (no Google needed). (2026-06-28)**
  Files: NEW `backend/services/secrets.py` (`encrypt_token`/`decrypt_token`, Fernet keyed off env `ENCRYPTION_KEY`; pass-through no-op + one-time warning when unset). NEW test `backend/tests/test_secrets.py` (round-trip with a key; pass-through without a key).
  VERIFY: `cd backend && pytest tests/test_secrets.py -q`.

- [x] **U2 — Encrypted token column + dual-read property (additive migration). (2026-06-28)**
  Files: `backend/models/sqlalchemy_models.py` (`CalendarConnection.tokens_encrypted` LargeBinary nullable; `tokens_decrypted` @property: decrypt-then-fallback-to-`tokens`). Add a migration SQL under `backend/scripts/sql/` (additive `ADD COLUMN`, no drop).
  VERIFY: `cd backend && python -c "from models.sqlalchemy_models import CalendarConnection"`; pytest collection still green. Property returns plaintext when `tokens_encrypted` is null.

- [x] **U3 — Wire encryption into store/refresh. (2026-06-28)**
  Files: `backend/services/google_integration.py` (`store_connection` writes `tokens_encrypted=encrypt(json.dumps(tokens))`, sets `tokens=None`; `_fresh_access_token` reads via `tokens_decrypted`, persists refreshed tokens encrypted). Keep dual-read fallback so legacy plaintext rows still work.
  VERIFY: `cd backend && pytest -q -k "google or calendar or planner"` stays green (or unchanged from baseline). Add/extend a unit test that stores then reads a connection round-trips tokens.

- [x] **U4 — `DELETE /google/disconnect`. (2026-06-28)**
  Files: `backend/api/google.py` (new endpoint: best-effort POST Google `oauth2/revoke` with refresh token, `is_active=False`, clear `tokens`+`tokens_encrypted`, purge that connection's `calendar_events`). `mobile/services/api.ts` (`disconnectGoogle(): Promise<{disconnected:boolean}>`).
  VERIFY: `cd backend && pytest -q -k google`; `cd mobile && npx tsc --noEmit`.

- [x] **U5 — All-day handling in projection. (2026-06-28)**
  Files: `backend/api/planner.py` (in the calendar-merge block ~L180-206: for `all_day` events emit a distinct `structure` row `{label, all_day:true, source:'calendar', event_id}` WITHOUT consuming the timeline, and EXCLUDE all-day from `calendar_busy_minutes`). Optionally refactor the inline projection into a shared `project_calendar_day(uid,target,db)` helper returning `(structure_rows, cal_spans)`.
  VERIFY: `cd backend && pytest -q -k planner`. Confirm an all-day-only day does not flip `today_read` to red.

- [x] **U6 — Today display fix (thread source/event_id + read-only styling). (2026-06-28)**
  Files: `mobile/screens/today/TodayScreen.tsx` (row mapper L155-162: carry `source` + `event_id` + `all_day`; render `source==='calendar'` rows MUTE with calendar glyph + "Calendar" tag, NO check-circle, long-press → `removeCalendarEvent`; render `all_day` as a quiet pill).
  VERIFY: `cd mobile && npx tsc --noEmit`. Read the file to confirm calendar rows are visually distinct and non-completable.

- [x] **U7 — ScheduleGrid `calendarEvents` prop. (2026-06-28)**
  Files: `mobile/components/planner/ScheduleGrid.tsx` (new optional `calendarEvents` prop; in `buildEvents` after obligations loop push read-only `Ev` per event: `key=cal-${event_id}`, accent `#B0B0B8`, `onPress:undefined`, `source:'calendar'`; card omits/hairlines tick + glyph; all-day → top pill).
  VERIFY: `cd mobile && npx tsc --noEmit`. Existing planner with no calendarEvents prop renders unchanged (prop optional, defaults `[]`).

- [ ] **U8 — DayPlannerScreen fetches merged day.**
  Files: `mobile/screens/profile/DayPlannerScreen.tsx` (add a `getPlannerToday(selectedIso)` query gated on `getGoogleStatus().connected && calendar_link_enabled`; derive `structure.filter(s=>s.source==='calendar')`; pass as `calendarEvents` to `ScheduleGrid`). Null-safe: when not connected, pass `[]` and incur no extra fetch.
  VERIFY: `cd mobile && npx tsc --noEmit`. Confirm unconnected users do NOT trigger the extra call.

- [ ] **U9 — Connect screen + Settings entry (OTA, browser flow).**
  Files: NEW `mobile/screens/integrations/GoogleCalendarConnectScreen.tsx` (mirror `SendblueConnectScreen`: title, `getGoogleAuthUrl()` → `Linking.openURL`, poll `getGoogleStatus()` every ~4s until `connected`, success + Skip + Disconnect states; hidden unless `calendar_link_enabled`). `mobile/screens/profile/SettingsScreen.tsx` (row after "My products"). `mobile/navigation/RootNavigator.tsx` (register modal/screen).
  VERIFY: `cd mobile && npx tsc --noEmit`. Confirm the row/screen is gated off when flag is false.

- [ ] **U10 — Background sync hardening (already-registered job).**
  Files: `backend/services/scheduler_job.py` (`sync_google_calendars` L958: on refresh failure mark connection `is_active=False`; skip inactive). Confirm interval registration intact.
  VERIFY: `cd backend && pytest -q -k "sched or google"`; `python -c "import services.scheduler_job"`.

- [ ] **U11 — Full green-bar + flag-off smoke.**
  Files: none (verification unit).
  VERIFY: `cd backend && pytest -q` (only pre-existing known failures allowed); `cd mobile && npx tsc --noEmit`. With `calendar_link_enabled=False` and no Google keys, confirm `/planner/today` and `/google/status` behave exactly as today (no calendar rows, no crashes).

## COMPLETION CRITERIA
- Feature flag `calendar_link_enabled` exists, defaults OFF; with it off OR unlinked the app is byte-for-byte today.
- OAuth tokens stored encrypted at rest (`tokens_encrypted` populated on new connects; dual-read fallback for legacy rows); refresh tokens never reach the client.
- `DELETE /google/disconnect` revokes + purges; `disconnectGoogle()` wired in mobile.
- `TodayScreen` shows calendar events as read-only "Calendar" rows (glyph, no check-circle, removable); `DayPlannerScreen`/`ScheduleGrid` show them as read-only `#B0B0B8` blocks via the `calendarEvents` prop.
- All-day events render as quiet pills and are excluded from `calendar_busy_minutes`.
- `npx tsc --noEmit` clean; `pytest` green except pre-existing known failures.
- NO new native module added; v1 ships OTA (no EAS rebuild).

## OPERATING PROTOCOL
1. Read this entire file each iteration.
2. Do the FIRST unchecked BUILD UNIT only.
3. Run its VERIFY. If it fails, fix within that unit's scope before checking off.
4. Check off the unit with today's date appended (e.g. `[x] U3 — ... (2026-06-28)`), and append a one-line note to `## Iteration-Log`.
5. Commit + push to main with commit prefix `gcal:` (per standing deploy pref; do NOT kick an EAS/TestFlight build).
6. Continue to the next unit.
7. NEVER block on the iOS sim/Maestro (flaky, multiple sims may be booted; pin `--device <UDID>` if you must run it). Prefer tsc + pytest + reading code.
8. If a unit requires a product/credential decision (Google Cloud OAuth client, env vars, scopes, which calendars), STOP that unit, record it under `## Needs Human Decision`, and move to the next unblocked unit.
9. When every unit is checked and COMPLETION CRITERIA hold, emit the completion promise.

## Completion promise
When all units are checked and completion criteria are met, output exactly:
<promise>GCAL INTEGRATION COMPLETE</promise>

## Needs Human Decision
- **Google Cloud OAuth client (human-only):** create/verify an OAuth 2.0 Web client in Google Cloud Console; add the redirect URI matching `settings.google_redirect_uri` (e.g. `https://<api-host>/api/google/callback`) EXACTLY; enable the Google Calendar API. The loop cannot create this — it stubs/flags around it (units U0–U5 need no Google keys).
- **Env vars (human-only, Render secrets, never committed):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and NEW `ENCRYPTION_KEY` (32+ byte Fernet key). Flip `CALENDAR_LINK_ENABLED=true` only when ready to roll out.
- **Scopes:** v1 = `calendar.readonly` ONLY (Gmail scope stays off; requires Google CASA review).
- **Sync cadence:** 30-min APScheduler poll + on-demand `POST /google/sync`; confirm acceptable (≤30-min staleness) or request tighter.
- **Which calendars:** v1 syncs the PRIMARY calendar only (14-day window). Multi-calendar picker (`selected_calendar_ids`) is deferred — confirm primary-only is acceptable for v1.

## Deferred
- (none yet)

## Iteration-Log
- U0 (2026-06-28): Added `calendar_link_enabled` flag to config + `/status` response + mobile type; verified import + tsc clean.
- U1 (2026-06-28): Created `services/secrets.py` (Fernet encrypt/decrypt, pass-through no-op without key) + `tests/test_secrets.py` (3 tests pass).
- U2 (2026-06-28): Added `tokens_encrypted` LargeBinary column + `tokens_decrypted` property to `CalendarConnection`; migration SQL added; import + pytest collection verified.
- U3 (2026-06-28): `store_connection` + `_fresh_access_token` now write `tokens_encrypted` + clear plaintext; `/status` reads via `tokens_decrypted`; baseline tests unchanged.
- U4 (2026-06-28): `DELETE /google/disconnect` added (best-effort revoke, clear tokens, purge events); `disconnectGoogle()` added to mobile api.ts; tsc + import clean.
- U5 (2026-06-28): All-day events emit `{all_day:true, source:'calendar', event_id}` pill row, excluded from `cal_spans`/`calendar_busy_minutes`; timed events unchanged.
- U6 (2026-06-28): TodayScreen threads `source`/`event_id`/`all_day` through row mapper; calendar rows render MUTE with calendar glyph + "Calendar" tag, no check-circle, long-press removes; all-day as pill; tsc clean.
- U7 (2026-06-28): ScheduleGrid: `calendarEvents` optional prop + `CalendarEventRow` type; calendar Ev pushed after obligations with `#B0B0B8` accent, `onPress:undefined`, hairline tick, calendar glyph; tsc clean.
