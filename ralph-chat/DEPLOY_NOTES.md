# DEPLOY_NOTES — production follow-ups the loop can't do itself

Everything ralph-chat fixes is committed LOCAL-ONLY on `creator-plus-v4` (per
standing deploy preference: nothing reaches prod without an explicit
per-time "push it now"). This file accumulates the things a human needs to
do at actual deploy time that a local-only commit can't cover.

## Standing items (known before the loop starts)

- **Prompt fixes need a Supabase row update, not just a code commit.**
  `state/prompt_sources.json` confirms all 34 `PromptKey`s resolve from the
  Supabase `system_prompts` table locally (0 fallback) — see LEARNINGS.md.
  Any fix that edits a persona/behavior prompt's in-code FALLBACK constant
  must also update the corresponding Supabase row (test project) to be
  locally testable; append the exact row diff here as it happens so the prod
  Supabase project gets the same update at deploy time.
- **Rate limiter is per-IP (XFF-trusting), not per-authenticated-user**
  (`backend/middleware/rate_limit.py:29-35`) — the harness exploits this
  locally (unique X-Forwarded-For per faux user = separate rate buckets,
  enabling battery parallelism) but it's a real production hardening gap:
  a shared NAT/proxy IP could exhaust another user's quota, and the trusted
  first-XFF-hop pattern is spoofable by a client that sets its own header
  unless the edge (Render/load balancer) strips inbound XFF before setting
  its own. Not fixed by this loop (backend-behavior scope, not chat-quality
  scope) — flagged here for a separate hardening pass.

## Per-fix entries (appended by the loop as findings are closed)

<!-- Format:
- **F-NNN <title>** — Supabase row `system_prompts.<key>` changed from
  "<old>" to "<new>" (test project). Apply the same UPDATE to the production
  Supabase project before/with the next OTA that ships this fix.
-->
- **F-014 ERR-01 multi-domain plan** — `CHAT_VISUAL_GRAMMAR` in `services/prompt_constants.py` is code-only (no Supabase row); no DB update needed. The multi-domain guard (`_broad_question_mcq` change) and marker-strip fix (`_extract_inline_choices` always called) are pure code changes and ship with the commit.
