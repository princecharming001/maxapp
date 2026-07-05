# LEARNINGS — durable operational gotchas

Append here whenever an iteration discovers something that would otherwise
be re-learned the hard way in a later, fresh-context iteration.

- **All 34 PromptKeys resolve from Supabase locally (0 fallback).** Confirmed
  via `preflight.py`'s prompt-source snapshot on the very first run
  (`state/prompt_sources.json`). This means editing an in-code FALLBACK
  constant (e.g. in `prompt_constants.py`) is **not enough** to test a
  persona-prompt fix locally — the Supabase row wins. `CHAT_VISUAL_GRAMMAR`
  is the one prompt that's genuinely code-only (never loaded from
  Supabase) and is safe to edit directly. For every other prompt fix: edit
  the fallback (so it's correct for when Supabase is unreachable) AND
  update the Supabase `system_prompts` row in the test project, then log
  the row diff in `DEPLOY_NOTES.md` — otherwise the fix will look
  "verified" locally while doing nothing in the actual DB-backed path.
- **Backend restart is required after ANY backend/ code change**, not just
  prompt changes — `services/prompt_loader.py`'s cache and Python module
  state are both loaded once at process start. `preflight.py --ensure-backend`
  handles this automatically (fingerprints `git diff -- backend/` + HEAD,
  bounces the process on :8002 via `lsof -tiTCP:8002` if it changed since
  last check) — always run preflight before the FULL battery, not just once
  per session.
- **Port 8002 is safe for ralph-chat to manage even if it didn't start the
  process** — it's maxapp's backend exclusively. Port 8000 is a DIFFERENT
  project's server (Marque) and must never be touched.
- **`POST /api/chat/conversations` response is nested**: `{"conversation":
  {"id": ..., ...}}`, not a bare `{"id": ...}` — `harness/client.py::new_conversation`
  unwraps this. If a future backend change flattens the response, this
  breaks silently (returns a KeyError, not a wrong id) so it fails loudly.
- **Concurrency probes must pin an explicit `conversation_id`.** Firing two
  concurrent turns with `conversation_id=None` races on
  auto-create/reuse-latest routing (a DIFFERENT hazard than the per-user
  chat-lock serialization ERR-02 is meant to test) and produces confusing
  cross-answer bleed that looks like a lock bug but isn't. Always create the
  conversation first, then fire concurrent turns into it.
- **Onboarding intake answers must match the ACTUAL question's taxonomy**,
  not a plausible-sounding free-text guess — e.g. HairMax's first question
  is hair TEXTURE (Straight/Wavy/Curly/Coily), not hair GOAL ("less
  thinning" fails to parse and the driver falls into a "didn't quite catch
  that" retry loop, which looks like a product bug but is a scenario-script
  mismatch). Check the transcript before trusting a scenario's own report.
- **`_broad_question_mcq`'s fact-first gate has a real, reproducible bug**
  (confirmed by hand-running CLAR-02 before the loop ever started): stating
  "my main skin concern is acne breakouts" then asking "give me a skincare
  routine" ~5s later STILL re-triggers the full concern clarifier with chips,
  ignoring the just-stated fact. This matches the predicted root cause
  (`user_brief.py`'s 30s TTL cache and/or fact-extraction timing), not a
  scenario artifact — reproduced live during harness validation, iteration 0.
- **Onboarding mid-intake interruptions get NO real answer.** Asking a genuine
  question ("does minoxidil have side effects?") mid-HairMax-intake doesn't
  hand off to the general agent — it just re-presents the exact same rigid
  choice question with a "didn't quite catch that" wrapper. Confirmed live,
  iteration 0 (ONB-02 hand-run).
- **VIS-01 (explicit "compare X vs Y" request) did not reliably emit a
  `comparison` visual block** in a hand-run — good prose, but no block. The
  model needs a clearer nudge via `CHAT_VISUAL_GRAMMAR` and/or its injection
  sites to treat "compare ... them" phrasing as a block-worthy signal.
