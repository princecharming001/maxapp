# RALPH LOOP — Level up maxapp AI: static → adaptive personalization

## STATUS / READ THIS FIRST
- **Nothing in this spec is implemented yet.** You are done ONLY when EVERY success criterion
  (RC1–RC14) is implemented AND verified — almost all via backend tests/scripts; two are also
  confirmable in the mobile UI. Plus the work is committed in logical chunks (per phase).
- **Do the PHASES IN ORDER (0 → 1 → 2 → 3 → 4).** Phase 0 (the eval/telemetry instrument) MUST land
  first so every later change is measurable and regressions across the ~18 prompt sites are catchable.
- **THE UNIVERSAL SHIP GATE (RC1):** every change in this plan is ADDITIVE and FLAG-GATED, default
  OFF, with a **byte-identical OFF path**. Before flipping any flag, a golden-prompt snapshot test
  must prove the OFF path is byte-for-byte today's behavior. This is what makes it safe to land on a
  live, production app.
- This was designed by an adversarial review that corrected several tempting-but-wrong ideas. **Do
  NOT re-introduce the cut items in §6** — they were cut for grounded reasons (dead code, phantom
  tables, false latency claims, redundant stores). Read §6 before "improving" the plan.

---

## 1. THE GOAL (through-line)
maxapp's personalization is **static today**: it dumps a cached per-dimension brief into every
prompt, learns nothing from outcomes, and can't prove any change helps. This makes it **adaptive**:
- **Phase 0 — Measurement spine.** Eval harness + per-turn telemetry, so every later change is
  measurable and regressions are caught.
- **Phase 1 — Retrievable memory.** Embed `user_memories` IN PLACE; retrieve top-k *query-relevant*
  facts UNIONed with an **always-on safety set**, replacing the query-agnostic brief-dump on the
  agent path — with the full brief kept as a byte-identical OFF-path fallback. (This is the actual
  user-facing win.)
- **Phase 2 — Safety grader + consent/forget.** A model safety grader scoped to emotional turns
  (off the happy path), a `memory_consent` column, and a right-to-forget endpoint.
- **Phase 3 — Learning loop.** An append-only outcome ledger that finally populates the
  already-defined-but-unused `task_best_times` and decays stale *inferred* guesses — deterministically,
  no new LLM calls.
- **Phase 4 — Task-difficulty routing.** Swap only the verified-hot `fast_rag_answer` generation
  path to a cheaper tier (cost reducer, opportunistic).

Highest-leverage sequence: **Phase 0 → Phase 1.**

---

## 2. THE DISCIPLINE (non-negotiable on a live app)
- **Additive + flag-gated, default OFF.** No existing behavior changes until a flag flips.
- **Byte-identical OFF path**, proven by a golden-prompt snapshot test (RC1) before any cohort flip.
- **Every HNSW index is an OUT-OF-BAND runbook step** run on the **direct (non-pooler) DB URL** —
  never an inline boot migration. `CREATE INDEX CONCURRENTLY` fails on the Supabase 6543 pooler, and
  an inline build times out under the existing 5s `lock_timeout` (and the boot block *swallows* the
  exception, leaving prod silently index-less).
- **New columns** are nullable `IF NOT EXISTS` additions to the existing boot migration list in
  `db/sqlalchemy.py` (house style — NOT Alembic).
- **Hot path is sacred.** No new synchronous LLM/embedding call on the happy chat path. Telemetry is
  `put_nowait`/drop-on-full, never awaits blocking I/O. Capture writes are fire-and-forget and never
  raise.
- **Backfill scripts** are idempotent/resumable.

---

## 3. KEY FILES & GROUNDING (verified — start here, don't re-discover)
**Backend** (`/Users/home/maxapp/backend`, FastAPI + SQLAlchemy async + Postgres/Supabase, Python
3.12 in `.venv312`):
- RAG: `services/rag_service.py` — `embed_text`:358, `embed_batch`:381, `_vec_to_pg_str`:404,
  `vector_search`:434 (template for the user-memory variant), `hybrid_retrieve`:479, `_chunk_id`:50.
- Answer gen: `services/fast_rag_answer.py` — 4 generation call sites at **467/618/674/822** (the real
  fast-tier reroute target); `_CITATION_RE`, `_LEAKAGE_PATTERNS`, `_TEMPLATE_OUTPUT_MARKERS` (reused
  by deterministic graders).
- Memory/personalization: `services/personalization.py` — `remember_fact`:179 (commit ~268),
  `get_memories`:294, `_safe_rebuild`, `resolve_keyed_conflict` (supersede semantics),
  `_line_*`/`_as_list` formatters:464–606, `build_personalization_brief`:616, `personalization_brief`:862.
  **Leave the brief assembler INTACT** — scheduler, "What Max knows" screen, ~18 sites depend on it.
- Prompt assembly: `services/lc_agent.py` — `build_agent_system_prompt`:412, brief-injection site
  **521–528** (flag-branch here), system-prompt token cap 748–755, `hard_constraints_reminder`:2237
  (independent safety layer — keep), agent build `get_chat_llm_with_tools_and_fallback`:2262.
- Chat endpoint: `api/chat.py` — `_looks_like_self_harm`:2170 + crisis gate:2306, brief population
  **2388–2398**, fast-path knowledge return ~2635, after-agent return ~3452, `_bg_detect_tone`:3480.
- Intent: `services/intent_classifier.py` — `classify_turn`:117 is **SYNCHRONOUS** (no LLM, no await).
- Providers/config: `services/lc_providers.py` — `get_chat_llm_with_fallback`:~,
  `_build_openai_llm`:160, tool-bind-before-fallback invariant ~367, `_FALLBACK_ORDER`:256
  (`huggingface` == `[]`, intentional no-silent-failover). `config.py` rag_* flag pattern ~99.
- Migrations: `db/sqlalchemy.py` — `_run_column_migrations`:401, `SET lock_timeout='5s'` block ~414.
- Telemetry: `services/chat_telemetry.py` — `log_*`/`log_retrieval`/`log_agent_run`/`log_prompt_budget`.
- Learning: `services/learner.py` — `recompute_learned_prefs`:74, `_local_minutes`, `window_stats`,
  `fresh_insights`:274. `api/planner.py` — `skip_task`:429, 24h stale-guard:250–258.
- Models: `models/sqlalchemy_models.py` — `UserMemory`:734, `UserPersonalizationProfile`:788,
  `ChatHistory`:318, `RagDocument`:646 (pgvector guard `_PGVECTOR_AVAILABLE`:656),
  `UserCoachingState.preferred_tone`:141 (values **direct|aggressive|chill**), `AppEvent`:626,
  `UserLearnedPrefs.task_best_times` (defined-but-unused — Phase 3 populates it).
- Existing assets to REUSE (do not reinvent): `scripts/sql/rag_hybrid_hnsw_index.sql` (the HNSW index
  already exists), `scripts/bench_rag_retrieval.py` + `scripts/seed_rag_organized.DOCS` (BM25-in-memory
  eval pattern), `scripts/backfill_embeddings.py` (backfill template), `scripts/run_evals.py` +
  `evals/questions.jsonl`, `services/user_facts_validator.find_violations`.

---

## 4. PHASES & DELIVERABLES

### Phase 0 — Measurement spine + telemetry (lands FIRST) → RC2, RC3, RC4
- `backend/evals/golden/{skinmax,fitmax,hairmax,heightmax,bonemax,general}.jsonl` (~15 cases/maxx,
  ~90 total) as a STRICT superset of today's `{question, expected_module, expected_keywords}` +
  `reference_answer`, `must_include[]`, `must_not_include[]` (leak phrases), optional
  `relevant_doc_titles[]`. **Relevance keyed on doc_title + keyword substring, NOT chunk_id** (BM25
  `retrieve_chunks` emits stable `_chunk_id`; `vector_search` emits the DB-row uuid — chunk-id keying
  silently mismatches half the retrievals). Plus `backend/evals/safety.jsonl` (~10 crisis-bypass +
  medical-deflection + fact-adherence cases).
- `backend/evals/retrieval_metrics.py` (pure `recall_at_k`/`mrr`/`ndcg_at_k`/`citation_correctness`) +
  `backend/evals/run_retrieval_eval.py` (refactor of `bench_rag_retrieval.py`). **CI gate measures
  BM25 `retrieve_chunks` recall ONLY** — DB-free, key-free. The hybrid-vs-BM25 delta is an OPT-IN
  nightly/local job needing a seeded pgvector + `OPENAI_API_KEY` (the vector half opens its own
  `AsyncSessionLocal` and returns `[]` on failure, so a monkeypatched-DB CI run would report BM25
  mislabeled as "hybrid").
- `backend/evals/graders.py` — DETERMINISTIC, key-free: leak-phrase scan (reuse
  `_TEMPLATE_OUTPUT_MARKERS`/`_LEAKAGE_PATTERNS`), fact-adherence (`user_facts_validator.find_violations`),
  em-dash, citation-correctness (`_CITATION_RE`), crisis-regex reuse.
- `services/eval_telemetry.py`: `start_drainer()` launched in `main.py` lifespan beside
  `warm_indexes()` (~main.py:50); `record_turn()` enqueues onto an `asyncio.Queue` (`put_nowait`,
  drop-on-full) drained by ONE background task batch-inserting into `chat_turn_eval`. Call once per
  turn at the two existing return points in `api/chat.py` (~2635 fast-path, ~3452 after agent). Whole
  drainer + every enqueue `try/except`-wrapped. Reuse the `retrieved_chunk_ids` already passed to
  `ChatHistory` — don't recompute.
- `chat_turn_eval` table (ONE table) via `CREATE TABLE IF NOT EXISTS` in `db/sqlalchemy.py`:
  `id/user_id/conversation_id/created_at/path/maxx_hints/retrieved_chunk_ids(jsonb)/injected_fact_keys(text[] null)/tools_fired/agent_iterations/latency_ms/prompt_tokens/completion_tokens/est_cost_usd/llm_provider/response_length`;
  indexes on `(created_at desc)` and `(path)` only.
- `.github/workflows/evals.yml` — single blocking job on PRs touching
  `backend/services/{lc_agent,fast_rag_answer,rag_service,prompt_constants}.py`, `backend/evals/**`,
  or `rag_content/**`: `pytest` + `run_retrieval_eval --ci`; thresholds in
  `backend/evals/thresholds.yaml` vs committed `backend/evals/baseline.json` (>5pt recall@4 drop / any
  new leak / safety pass_rate<1.0 = red). `baseline.json` regenerated only by an explicit maintainer
  `make eval-baseline` commit.
- `config.py`: `eval_telemetry_enabled` (default True) + `eval_telemetry_sample_rate`.

### Phase 1 — Retrievable memory → RC1, RC5, RC6, RC7, RC14
- `ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS embedding vector(1536), embedded_at timestamptz,
  is_safety boolean DEFAULT false` — in the boot migration list under the 5s lock block; reflect on
  `UserMemory` ORM behind the `_PGVECTOR_AVAILABLE` guard (mirror `RagDocument`). **NO inline HNSW.**
- `services/rag_service.py`: `vector_search_user_memory(user_id, query_embedding, k, min_similarity)`
  — a copy of `vector_search` over `user_memories WHERE user_id AND status='active' AND embedding IS
  NOT NULL`, reusing `_vec_to_pg_str`, same `try/except → []` contract. `rag_documents` `vector_search`
  untouched.
- `services/memory_retrieval.py` (NEW): `retrieve_recall_block(db, user_id, query, *, k) -> str`
  (`''` on any failure): embed query once via `embed_text`; `vector_search_user_memory(k)`; **ALWAYS
  UNION an always-on safety set** via a plain indexed SELECT (`is_safety=True` OR `dimension in
  ('diet','constraints')` matching allergy/condition/medication) so safety facts can NEVER be
  relevance-gated out; dedupe; render reusing `personalization.py` formatters.
- `services/personalization.py` `remember_fact`: after commit (~268), behind the flag,
  `asyncio.create_task(_embed_memory(mem_id))` opening its own `AsyncSessionLocal` (zero user-turn
  latency); set `is_safety=True` at write when `dimension in ('diet','constraints')` and the slot is
  allergy/condition/medication; add `mark_facts_safety()` one-time backfill helper. **Leave
  `build_personalization_brief`/`personalization_brief`/`assemble_profile` INTACT.**
- `services/lc_agent.py:521–528`: branch on `settings.memory_retrieval_enabled` — ON prepends
  `user_context['recall_block']` in place of `personalization_brief`; OFF keeps `brief` byte-for-byte.
  Keep the recall block BELOW the diet absolute-rules / `hard_constraints_reminder` (independent
  defense-in-depth).
- `api/chat.py:2388–2398`: when flag ON, `user_context['recall_block'] = await
  retrieve_recall_block(db, user_id, message_text, k=settings.memory_recall_k)`, same try/except-swallow;
  keep setting `personalization_brief` so OFF path + the non-agent fast_rag path are untouched.
  **Do NOT thread recall into `fast_rag_answer` in v1 (deferred).**
- `scripts/backfill_memory_embeddings.py` (NEW) — near-verbatim mirror of `scripts/backfill_embeddings.py`.
- `scripts/sql/<user_memories hnsw>.sql` (NEW) — out-of-band `CREATE INDEX CONCURRENTLY ... USING hnsw
  (embedding vector_cosine_ops)`, run manually on the direct DB URL after backfill. **Not a launch
  dependency** (per-user fact counts are tens; a filtered scan is sub-ms).
- `config.py`: `memory_retrieval_enabled` (default False) + `memory_recall_k` (default 8).
- **Ablation harness ships in THIS PR (RC14):** the one-line `if ablate is None or 'brief' not in
  ablate` guard in `build_agent_system_prompt` + `run_ab_eval` over `{full, recall_on}` variants +
  the deferred LLM-judge graders (`get_judge_llm` wrapping `_build_openai_llm` pinned independent of
  `LLM_PROVIDER`, temp 0.0, `score=None` on failure). Gate the Phase-1 flip on recall beating the
  brief on the held-out golden set AND safety presence == 100%.

### Phase 2 — Safety grader + consent/forget → RC8, RC9, RC10
- Operationalize the EXISTING `scripts/sql/rag_hybrid_hnsw_index.sql`: run once on the **direct**
  (session-mode) DB URL; document as a deploy step. Do NOT author a competing index.
- `services/rag_service.py` `vector_search`: prepend `SET LOCAL hnsw.ef_search = :ef` (new
  `settings.rag_hnsw_ef_search` default 80) in its own session; extend `log_retrieval` with
  `ann_used` + `ef_search`.
- `services/safety_classifier.py` (NEW): `classify_safety(text)` behind
  `settings.safety_model_grader_enabled` (default False), reusing the existing temp-0.2 JSON LLM path
  (no new provider). Runs ONLY when `_looks_like_self_harm` did NOT fire AND `classify_turn` tagged the
  turn emotional/vent/distress. Synchronous gate on that small slice; `severity>=2` → crisis/resources.
  **Fail-OPEN** on error/timeout. Regex always fires first; grader can never suppress a regex hit.
  Happy-path p50 untouched. (Do NOT claim "parallel with intent classification" — `classify_turn` is
  synchronous.)
- Consent: `ALTER TABLE app_users ADD COLUMN IF NOT EXISTS memory_consent VARCHAR DEFAULT 'standard'`
  in `_run_column_migrations()`. In `remember_fact`, after the empty-text check (~202), if
  `memory_consent=='off'` AND dimension is sensitive (identity/culture/diet/constraints/misc) → no-op
  + log + return None. **No PII scrubber in v1** (consent tier delivers the gate).
- Right-to-forget: `forget_user_memory(db, user_id, *, hard=False)` reusing `_safe_rebuild`
  (hard=False retracts active facts; hard=True DELETEs all rows) + authed `DELETE /me/memory` in the
  personalization router. `app_users ON DELETE CASCADE` covers account deletion.
- `config.py`: `safety_model_grader_enabled` (default False), `rag_hnsw_ef_search` (default 80).

### Phase 3 — Learning loop → RC11, RC12
- `CREATE TABLE outcome_events` (`id, user_id FK ON DELETE CASCADE, kind varchar(32), subject_kind,
  subject_ref, value double precision default 0, props jsonb, created_at`) + indexes `(user_id, kind)`
  and `(user_id, created_at)`. Append-only (mirror `AppEvent` discipline).
- `record_outcome()` — single guarded, never-raising, flag-gated writer. Emit from EXISTING
  chokepoints only: `task_completed` at `schedule_service.complete_task` (~2722, the single chokepoint
  for BOTH the planner endpoint AND the agent tool), deduped on `props.task_id`; `task_skipped` at
  `planner.skip_task` (~429); `rec_accepted` derived from the EXISTING `product_tap` AppEvent (no new
  endpoint, **no per-card `rec_shown` loop** on the hot path). ZERO new work in the request cycle.
- `recompute_from_outcomes` — ONE deterministic, no-LLM reduce pass piggybacked on the existing 24h
  stale-guard (`planner.py:250`): populate `UserLearnedPrefs.task_best_times` from completed-task
  local-minute medians (reuse `learner._local_minutes`/`window_stats`), surfaced **confirm-first** via
  the existing `fresh_insights` card path — NEVER silently mutating the plan.
- `sweep_stale_inferred` — inferred-source facts (`source in {onairos,inferred}`) not re-observed for
  `memory_decay_days` AND already below the retire floor get `status='superseded'` (soft, reversible)
  + `_safe_rebuild`. Explicit facts (chat/onboarding/scan) never touch.
- `config.py`: `learning_loop_enabled` (default False) + `memory_decay_days`.

### Phase 4 — Task-difficulty model routing (opportunistic; after Phase 0) → RC13
- PREREQUISITE (one-off, out of band): resolve the `lc_providers.py:9–11` "fine-tune" comment vs
  audit "fine-tuning NONE" conflict via a manual HF-endpoint diagnostic.
- `services/model_router.py` (NEW, ~80 lines): `TaskClass` enum (`FAST_TEXT, AGENT_TOOLS, JSON`) +
  `route_task()` that delegates byte-identically when `model_routing_enabled=False`; when True,
  `FAST_TEXT`/`JSON` build the configured fast provider; `AGENT_TOOLS` always returns today's strong
  path. **Never invents cross-provider failover for the HF primary.** `log_route()` once per decision.
- `services/lc_providers.py`: ONE helper `get_chat_llm_with_fallback_for(provider_name, max_tokens,
  temperature)`; existing `get_chat_llm_with_fallback` becomes a 1-line shim. No tools+fallback `_for`
  variant (agent not rerouted).
- `services/fast_rag_answer.py` 467/618/674/822: swap `get_chat_llm_with_fallback` →
  `route_task(FAST_TEXT, ...)`. Flag off = unchanged.
- `services/chat_telemetry.py`: `log_route(task, provider, model, est_tokens)`.
- `config.py`: `model_routing_enabled` (default False), `model_tier_fast_provider` (default `''` =
  no-op even when flag on), `model_router_log_traces` (default False, reserved).

---

## 5. SUCCESS CRITERIA (done only when ALL pass)
Verify backend criteria with pytest/scripts (`backend/.venv312`); RC10 and RC12 are ALSO confirmable
in the mobile "What Max knows" / planner UI.

- **RC1 — OFF-path byte-identical (universal ship gate).** With all four flags OFF,
  `build_agent_system_prompt` output AND `route_task`'s returned builder-args are byte-for-byte today,
  and no telemetry/outcome-driven behavior changes. Golden-prompt snapshot test.
- **RC2 — Retrieval-eval is deterministic, DB-free, key-free.** `run_retrieval_eval --ci` prints
  recall@4/MRR/nDCG@4 per maxx in <15s via BM25 `retrieve_chunks`, no DB, no key; relevance keyed on
  doc_title+keyword.
- **RC3 — Deterministic graders + CI gate catch seeded regressions.** Graders flag 100% of seeded
  leak/fact-violation/em-dash/bad-citation cases; `evals.yml` reds on >5pt recall@4 drop / new leak /
  safety failure — demonstrated by an intentional regression.
- **RC4 — `chat_turn_eval` never touches the hot path.** Rows carry path/retrieved_chunk_ids/
  tools_fired/latency/tokens/cost; a test asserts `record_turn` never raises and never awaits blocking
  I/O, and disabling the flag or crashing the drainer leaves chat latency/success unchanged.
- **RC5 — Always-on safety facts in EVERY recall block.** A topically-unrelated query ("how do I get
  taller") for a nut-allergy user still includes the allergy. **Safety gate — ship only if it passes.**
- **RC6 — Constant-size, query-relevant recall replaces the brief (agent path).** "plan my lunch" for
  a 50+-fact user injects ≤ `memory_recall_k` + safety set of top-k relevant facts; a keyless anecdote
  the per-dimension brief truncates is recalled when relevant; p50 added latency < 40ms, no HNSW
  required at current per-user counts.
- **RC7 — Write path zero user-visible latency + graceful degrade.** `remember_fact` returns before
  the fire-and-forget embed; un-embedded facts still retrievable via the safety/keyed fallback; an
  embedding outage → empty recall (full brief still serves OFF path), never an error. Backfill
  idempotent.
- **RC8 — HNSW proven engaged, out-of-band.** Existing `rag_hybrid_hnsw_index.sql` applied on the
  direct DB URL; `EXPLAIN ANALYZE` shows `Index Scan using rag_documents_embedding_hnsw_idx`;
  `log_retrieval` emits `ann_used=true`; top-k overlap vs exact-scan baseline within tolerance.
- **RC9 — Safety grader off the happy path, fail-open.** Regex-missed paraphrases caught at
  `severity>=2` ONLY on emotional/distress turns; regex fires first and can't be suppressed; safe
  non-emotional messages don't run the grader (p50 unchanged); error/timeout falls back to normal chat.
- **RC10 — Consent + right-to-forget on real tables.** `memory_consent='off'` no-ops sensitive-dimension
  writes; `DELETE /me/memory` hard=False retracts (brief reflects removal), hard=True leaves zero rows.
  (UI-confirmable in "What Max knows".)
- **RC11 — Outcome ledger from single chokepoints, deduped, never-raising.** Completing a task via the
  planner OR the agent tool writes exactly ONE `task_completed` (retry on same `props.task_id` writes
  none); a `product_tap` yields one `rec_accepted`; no measurable latency; never raises.
- **RC12 — Deterministic learning populates `task_best_times` + decays stale guesses.** After ~10
  clustered completions, `recompute_from_outcomes` populates `task_best_times` and `fresh_insights`
  surfaces a confirm-first card WITHOUT mutating the plan; an inferred fact >45d unseen + below floor →
  `superseded` (drops from brief), an equally-stale EXPLICIT fact untouched. (Card UI-confirmable.)
- **RC13 — Routing reroutes only `fast_rag_answer`; invariants intact.** With routing ON + a fast
  provider, the 4 sites resolve to the fast tier; empty `model_tier_fast_provider` is a no-op even with
  the flag on; the agent still binds tools before `with_fallbacks`; `_FALLBACK_ORDER['huggingface']==[]`
  never violated; one `[TELEMETRY]` route line per decision.
- **RC14 — Ablation A/B harness ships with the first memory candidate and proves lift.** `run_ab_eval`
  over `{full, recall_on}`; `build_agent_system_prompt(ablate=None)` byte-identical to current; produces
  a recall-vs-brief delta so the Phase-1 flip is gated on recall beating the brief AND safety == 100%.

---

## 6. DO NOT RE-INTRODUCE (cut by adversarial review — grounded reasons)
- **conversation_summaries table + post-response LLM summarizer** — redundant; distilled facts already
  route through `remember_fact` into `user_memories` which now has its own embedding+index.
- **A separate `memory_embeddings` table** — phantom (zero repo references). The embedding lives ON
  `user_memories`. So embedding-versioning columns, a separate per-user ANN index, `upsert_rag_chunk`
  refactor, and `content_sha`/model-bump backfill rewrite are all cut.
- **Inline boot-time `CREATE INDEX CONCURRENTLY`** — times out under the 5s lock / fails on the pooler
  and silently skips. Always out-of-band on the direct DB URL.
- **Routing `lc_maxx_intent` (dead code — zero callers), the agent tool path, an in-process response
  cache (per-worker → ~0 hit rate; key folds in the per-turn brief), `llm_router`/VISION reconciliation,
  and the distillation/`llm_traces` pipeline** — cut from routing v1.
- **Tone bandit with `{hardcore,gentle,influencer,default}`** — wrong vocabulary; the real schema is
  `direct|aggressive|chill` (`coaching_service.py:602` hard-filters to those). Defer tone learning to a
  v2 that uses the real values, gated on the Phase-0 harness.
- **LLM-judge graders / `get_judge_llm` / `eval_run` table** in Phase 0 — ship them WITH the first
  memory candidate (Phase 1, RC14); there's nothing to grade until a change exists. `baseline.json`
  (a committed file) gates PRs without the table.
- **PII placeholder-substitution scrubber** — replaced by the `memory_consent` tier for v1.
- **fast_rag recall threading, "pinned comms_style/personality" top-k, sentiment/re-ask/rec_shown
  capture** — deferred.

---

## 7. LOCAL DEV / VERIFY
- Backend tests: `cd /Users/home/maxapp/backend && .venv312/bin/python -m pytest tests/ -q` (ignore
  the known pre-existing failures; add new tests under `tests/`). Use `LLM_PROVIDER=openai` locally for
  reliable LLM calls.
- Eval runner: `.venv312/bin/python -m backend.evals.run_retrieval_eval --ci` must be DB-free + key-free.
- Migrations land via the boot path in `db/sqlalchemy.py` (no Alembic). HNSW `.sql` is run manually on
  the **direct** (non-pooler) DB URL — document it, don't automate it.
- This is BACKEND work — verify with pytest/scripts, not the simulator. RC10/RC12 are additionally
  visible in the mobile "What Max knows" screen + planner once the relevant flag is on.

## 8. WORK ORDER
Phase 0 → 1 → 2 → 3 → 4, strictly. Within a phase, land the data model + service code + tests, then
the flag, then the OFF-path snapshot test (RC1) before considering any flip. Commit per phase with a
clear message. Everything is default-OFF + byte-identical, so it is safe to land incrementally — even
on `main` (no behavior changes until a flag flips). Commit your work in logical chunks; do not flip any
flag in this loop (rollout is a human decision).

## 9. DEFINITION OF DONE
All of RC1–RC14 implemented and verified (backend tests/scripts; RC10/RC12 also UI-checkable). All five
phases landed, additive + flag-gated default-OFF, OFF path proven byte-identical. No cut item from §6
re-introduced. `pytest` green for new tests; `run_retrieval_eval --ci` green; `evals.yml` gate works.
Work committed in logical per-phase chunks.
