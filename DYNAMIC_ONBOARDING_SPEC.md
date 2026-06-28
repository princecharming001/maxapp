# DYNAMIC_ONBOARDING_SPEC.md

> Persistent build spec for a Ralph loop. Read this file **in full** at the start of every iteration, do the **first unchecked BUILD UNIT**, verify it, check it off (dated), commit + push, then continue. Do not skip ahead. Do not refactor beyond the unit. When all units are checked and COMPLETION CRITERIA pass, emit the completion promise verbatim.

---

## GOAL

Make each Max's onboarding questions **generated per user** instead of fixed/hardcoded. At intake we look at everything already known about the user (prior Max onboarding answers, UserMemory, chat-derived facts, scan results, profile) plus the per-Max plan doc's **information requirements**, and ask ONLY the genuine gaps — never re-asking what we already know (e.g. don't re-ask exercise-routine questions in `bonemax` if `fitmax` already captured them). Chat-volunteered info updates known-context and shrinks future questions, including across Maxes.

This must ship **behind feature flags**, default to safe behavior, and keep the **current fixed-question onboarding as a working fallback** at every failure point.

---

## CURRENT-STATE (grounded in the real codebase; repo root = `/Users/home/maxapp`)

The per-Max onboarding today is a **deterministic state machine** (no LLM):

- **Entry / orchestration:** `backend/api/chat.py::_run_onboarding_questioner` (def at **chat.py:3982**). Imports the questioner helpers (chat.py:3994-3999) and `get_context, merge_context, merged_user_state` (chat.py:4003). Flow:
  - `pending = get_pending(state)` (chat.py:4016)
  - Fresh start → `peek_next_question(new_max, state)` (chat.py:4029), persist pending via `merge_context(user_id, {**clear_pending(), "_onboarding_pending": make_pending(new_max, next_field["id"])}, db)` (chat.py:4033-4036), build wire payload `field_to_question_payload(next_field)` (chat.py:4038).
  - Answer turn → `coerce_answer(last_field, msg)` (chat.py:4063), advance `peek_next_question(maxx_id, next_state)` (chat.py:4110), persist `merge_context(user_id, {**update, "_onboarding_pending": new_pending}, db)` (chat.py:4114), mirror facts `_mirror_intake_to_facts(user_id, update, db)` (chat.py:4115 / def chat.py:4152).
  - Queue exhaustion → `merge_context(user_id, {**update, **clear_pending()}, db)` (chat.py:4123) then `generate_and_persist(...)` (import chat.py:4126, call 4127).
  - Second peek/re-render path at chat.py:4806-4824.
- **Questioner driver:** `backend/services/onboarding_questioner.py`
  - `PENDING_KEY = "_onboarding_pending"` (40); `get_pending` (43), `make_pending(maxx_id, field_id)` (51 → `{"max":..,"last_question":..}`), `clear_pending` (55 → `{PENDING_KEY: None}`).
  - `peek_next_question(maxx_id, user_state)` (**82**) is a thin wrapper: `missing = missing_required(...); return missing[0] if missing else None`.
  - `field_to_question_payload(field_spec)` (**92**) → wire `{text, field_id, choices|input_widget, multi_choice, allow_custom, _value_map}`.
  - `coerce_answer(field_spec, raw)` (**161**) parses enum/yes_no/int/clock/str.
  - `detect_max_start_intent(message)` (**431**).
- **Missing-field logic:** `backend/services/task_catalog_service.py::missing_required(maxx_id, user_ctx)` (**218**) walks `doc.required_fields`, returns specs where `f.get("required", True)` and `user_ctx.get(fid)` is None/empty. `required_field_ids` (210). `get_doc(maxx_id)` (72), `warm_catalog` (41).
- **Doc model:** `backend/services/max_doc_loader.py` — `MaxDoc` dataclass at **95** with `required_fields` (100), `optional_context` (101), `prompt_modifiers` (102). `parse_max_doc` reads `front_matter.get("required_fields")...` (165-167). Six docs: `data/maxes/{skinmax,hairmax,fitmax,bonemax,heightmax,coloringmax}.md`.
- **DSL:** `backend/services/schedule_dsl.py` — `evaluate` (53), `evaluate_all` (153), `evaluate_any` (159), **`referenced_fields(exprs) -> set[str]` already exists at line 208** (use it; do not reinvent).
- **Known-context sources (already wired):**
  - `backend/services/user_context_service.py`: `get_context` (41), `merge_context` (60), `scan_derived_signals` (124), `merged_user_state(onboarding, context, extras)` (155).
  - `backend/services/personalization.py`: `_SOURCE_RANK` (73), `remember_fact` (179), `profile_to_state_signals(profile, *, brief=None)` (676), `assemble_profile` (788), `_safe_rebuild` (873), `get_profile(db, user_id, *, rebuild_if_missing=True)` (880).
  - `backend/services/user_facts_service.py`: `FACTS_KEY="user_facts"` (45), `ONBOARDING_FACT_MAP` (59 — only 13 entries; does NOT cover cross-Max overlaps like sleep/equipment/injury), `merge_facts` (268).
- **Config:** `backend/config.py` — `class Settings(BaseSettings)` (18), Pydantic `Field(default=...)`. `anthropic_model` exists (default `claude-haiku-4-5`). Provider factory: `backend/services/lc_providers.py::get_sync_json_llm` / `claude_service.py::simple_completion`.
- **Mobile:** `mobile/screens/chat/MaxChatScreen.tsx` already renders a variable-length, server-driven question stream (restores `serverChoices`/`inputWidget` from `pendingQuestion`, ~558-568). `forceNewConversation=true` on max-start (max-bleed guard, ~615) MUST be preserved.
- **Tests:** `backend/tests/` (`test_onboarding_multi_custom.py`, `test_max_doc_pipeline.py`, `test_personalization.py`, `test_chat_routing.py`, `conftest.py`, etc.).

**The real gap today:** field IDs are disjoint by name across docs, and `ONBOARDING_FACT_MAP` does not bridge the cross-Max overlaps. So even when an answer exists, the next Max re-asks it. There is no "what does this plan actually consume" definition driving the questions.

---

## THE DESIGN

### Architecture (end-to-end, reuses the real hooks)

1. **Doc info-schema (new primitive).** Each max-doc declares `info_schema`: an ordered list of *slots* (canonical, cross-Max information requirements), each cross-linked to an existing `required_fields` entry. Decouples WHAT a plan needs from HOW to ask. Auto-derives from `required_fields` if absent.
2. **compile_info_schema (cached per-Max).** At catalog warm, compile each doc's `info_schema`: cross-link each slot to its `field` spec; static-scan the existing DSL via `schedule_dsl.referenced_fields()` over `prompt_modifiers[].if` + every task `applies_when`/`contraindicated_when` + `skeleton.blocks[].if` to mark slots whose field no rule reads as `dead` (excluded unless `keep: true`); CI-warn DSL fields with no slot.
3. **assemble_known_context (deterministic, NO LLM).** Union of `merged_user_state` + `profile_to_state_signals(get_profile(...))` + `user_facts` + `scan_derived_signals`, normalized to slot vocabulary via `satisfied_by` aliases + optional `derive`. Precedence = `_SOURCE_RANK` with min-confidence + freshness gates. Emits `prefill = {field_id: value}` + provenance `{slot: {value, source, confidence}}`.
4. **Deterministic gap = reuse `missing_required` unchanged.** Merge `prefill` into user_state, call the **existing** `missing_required(maxx_id, prefilled_state)`. True subset of today's questions — cross-Max dedup, NO LLM, NO downstream change. The **`slot_prefill` rung** (ship first).
5. **One LLM call at intake-start (`plan_questions`).** Takes the deterministic gap set + brief + provenance, returns ORDERED `[{slot, action: ask|confirm, adapted_question, reason}]`. Fenced server-side (intersect gap, drop hallucinated, dedup, re-sort by `importance`). `confirm` → one-tap yes_no. Prompt-cached on static (system + info_schema) prefix. One call per intake, NOT per turn.
6. **Plan → queue → pure-Python per-turn.** Pending extends to `{max, last_question, plan:[slot_ids], idx, adapted:{slot:text}, plan_dirty, generated_by}`. `peek_next_question` reads `plan[idx]`, resolves to its `field` spec, overrides `question` with adapted text, hands to UNCHANGED `field_to_question_payload`. `coerce_answer` unchanged; advance `idx` only on success.
7. **plan_dirty chat-update path.** After a chat-volunteered fact triggers `remember_fact`, set `pending.plan_dirty=true` (no synchronous LLM). NEXT `peek_next_question` recomputes, drops now-known slots, re-anchors `idx`. Facts persist → auto-suppress in FUTURE maxes.
8. **Generate (unchanged).** Queue exhaustion → same `clear_pending()` + `generate_and_persist`. Generator's `missing_required` gate is an INDEPENDENT backstop.

### Doc info-schema format (precise)

New optional `info_schema` block in max-doc YAML front-matter, parsed alongside `required_fields`:

```yaml
info_schema:
  - slot: sleep_hours              # canonical id, SHARED across maxes (the dedup key)
    needs: "typical nightly sleep duration in hours"   # NL description for the LLM
    field: sleep_hours             # -> existing required_fields[].id (reuse widget/coerce verbatim)
    feeds: [modifier, task_gate]   # informational: what plan machinery consumes it
    plan_refs:                     # exact DSL/field refs it grounds (verified at compile)
      - "modifier:sleep_debt_recovery"
      - "field:sleep_hours"
    importance: high               # high | medium | low  (ordering + cold-start trimming)
    satisfied_by:                  # cross-source aliases that already answer this slot
      - "facts:sleep_hours"
      - "profile:lifestyle.sleep"
      - "onboarding:sleep_time"
    derive: "span(wake_time, sleep_time)"   # optional deterministic derivation
    min_confidence: 0.6            # optional; default from config
    keep: false                    # optional; force-keep even if DSL-scan says dead
```

Rules:
- `slot` is the canonical cross-Max id. `field` MUST reference a real `required_fields[].id` in the same doc (compile error/log otherwise) — how widget/type/options/coerce are reused with zero new rendering code.
- A slot with no `field` is "infer-only" (never asked; only resolved from known-context).
- `satisfied_by` alias syntax: `facts:<key>` (user_facts blob), `profile:<dim>.<field>` (profile_to_state_signals output), `onboarding:<id>` (merged_user_state), `scan:<key>` (scan_derived_signals). First alias resolving with confidence ≥ `min_confidence` wins, respecting `_SOURCE_RANK`.
- `derive` whitelist (hand-parse, NO eval): `span(a,b)` = hour difference between two HH:MM times (handles wraparound). Unknown derive → ignored + logged.
- **Auto-derive fallback:** if a doc has no `info_schema`, compile one at load: each `required_fields[]` → slot with `slot=field=id`, `importance=high`, `satisfied_by=["onboarding:<id>","facts:<id>"]`, no derive. Makes all 6 docs work day one before manual enrichment.

### Known-context assembly (precise)

`backend/services/onboarding_gap.py::assemble_known_context(db, user_id, maxx_id) -> KnownContext`:
- `onboarding = User.onboarding`; `context = get_context(...)`; `state = merged_user_state(onboarding, context)`.
- `profile = await get_profile(db, user_id)`; `signals = profile_to_state_signals(profile.get("profile"), brief=profile.get("brief"))`.
- `facts = context.get(FACTS_KEY) or {}`; `scan = scan_derived_signals(state)`.
- Per compiled slot: walk `satisfied_by` in order, resolve against the matching source, apply `derive` if inputs available, gate by `min_confidence` (slot or `slot_default_min_confidence`) and freshness (UserMemory `last_seen_at` vs `slot_freshness_ttl_days` where available), record `{slot:{value, field_id, source, confidence}}`.
- Output: `prefill = {field_id: value}` for confidently-resolved slots; `provenance`; `brief`.

### Question generation LLM step (precise)

`backend/services/onboarding_gap.py::plan_questions(maxx_id, gap_specs, provenance, brief) -> QuestionPlan | None`:
- gap_specs = `missing_required(maxx_id, prefilled_state)`.
- Routes through `lc_providers.get_sync_json_llm` (or `claude_service.simple_completion`), model = `settings.dynamic_questions_model`.
- SYSTEM (static, cache_control ephemeral): produce an ORDERED question plan from provided slots ONLY; never invent slot ids; drop confidently-known; emit `confirm` for low-confidence/stale; adapt wording to brief but answers must fit field type/options; strict JSON.
- USER (dynamic): `{maxx_id, slots:[{slot, needs, field_type, options, importance, known?}], brief}`.
- Output Pydantic `QuestionPlan`: `{plan:[{slot, action, adapted_question, reason}], skipped:[{slot, reason}]}`.
- **Server-side fence:** drop slots not in gap_specs; dedup; drop high-confidence-known unless `action=confirm`; re-sort by doc `importance`; cap length at `len(gap_specs)`. Memoize per `(maxx_id, hash(prefill))` for `dynamic_questions_cache_ttl_s`.
- On ANY exception/timeout/empty/parse-error → return None (caller falls to deterministic rung).

### Chat-update path (precise)

- New `mark_onboarding_plan_dirty(user_id, db)` called right after `remember_fact`/facts-merge in the chat turn handler (near chat.py:4159-4170 and chat.py:4421-4426): read pending; if an active onboarding plan exists, `merge_context(user_id, {"_onboarding_pending": {**pending, "plan_dirty": True}}, db)`. No LLM that turn.
- In the questioner peek path: if `pending.plan_dirty`, recompute (assemble→gap→plan_questions), reset flag, re-anchor `idx`.

### Plan integration (unchanged contract)

- Coerced answers still land via `merge_context(user_id, {field_id: value}, db)` + `_mirror_intake_to_facts`. Queue exhaustion → same `generate_and_persist`. Generator's `missing_required` gate is the independent backstop: if the LLM wrongly dropped a still-empty required field, generation returns missing_fields → re-enter questioner for just those.

### Data-model changes (minimal)

1. `_onboarding_pending` JSONB grows: add `plan:[slot_id]`, `idx:int`, `adapted:{slot_id:text}`, `plan_dirty:bool`, `generated_by:"llm"|"prefill"|"raw"`. Still ephemeral in `user_schedule_context.context`. `get_pending` stays backward-compatible (old `{max,last_question}` still valid).
2. `MaxDoc` dataclass (max_doc_loader.py:95): add `info_schema: list[dict]`; `parse_max_doc` reads `front_matter.get("info_schema")`.
3. Compiled `InfoSchema` cached on the task_catalog `_Entry` next to the doc.
4. NEW `backend/services/onboarding_gap.py` (compile_info_schema, assemble_known_context, plan_questions; Pydantic `InfoSlot`, `QuestionPlan`).
5. Config additions (see guardrails). NO new DB columns for answers — they stay in User.onboarding + user_schedule_context + user_facts + UserMemory.
6. Optional idempotent one-time backfill: replay User.onboarding → `remember_fact(source="onboarding", confidence=0.85)`.

### Mobile integration (near-zero)

- Wire format unchanged (one `field_to_question_payload` per turn). Adapted text rides the existing `text` field. Optional `progress:{index,total}` added (client ignores if absent). `confirm` slots reuse the existing yes_no widget. Preserve `forceNewConversation=true`. NO change to the 10-step OnboardingV2 wizard (account-level).

---

## HARD GUARDRAILS (read every iteration; never violate)

1. **Feature flags default OFF for the LLM path.** New config in `backend/config.py` (Pydantic `Field`):
   - `slot_prefill_enabled: bool = Field(default=False)` — deterministic dedup (prefill + missing_required). Ship/enable first.
   - `dynamic_questions_enabled: bool = Field(default=False)` — LLM phrasing/ordering. Requires slot_prefill.
   - `dynamic_questions_shadow: bool = Field(default=False)` — log "would-skip"/"would-ask" without enforcing.
   - `dynamic_questions_model: str = Field(default="claude-haiku-4-5")`
   - `dynamic_questions_cache_ttl_s: int = Field(default=600)`
   - `slot_default_min_confidence: float = Field(default=0.6)`
   - `slot_freshness_ttl_days: int = Field(default=180)`
2. **Keep the fixed onboarding as a working fallback.** When ALL new flags are off, `_run_onboarding_questioner` must be **byte-for-byte today's behavior** (`peek_next_question` → raw `missing_required`). New logic is purely additive in front of the existing machinery.
3. **Three-rung fallback ladder, every failure degrades to the previous system:** (1) LLM plan → (2) deterministic prefill+`missing_required` → (3) raw `missing_required` (today's exact flow). Wrap `plan_questions` and `assemble_known_context` in try/except; never raise into a chat turn.
4. **Ground every question in per-Max docs + known context.** A question may ONLY come from a doc-declared `info_schema` slot whose `field` is a real `required_fields[].id`, and only when the value is genuinely missing from known-context (verified deterministically, not trusted from the LLM). The LLM does set-difference + phrasing only; fence its output against the allow-list.
5. **Never re-ask known info.** Cross-Max dedup is the deterministic rung's job (prefill via `satisfied_by`), independent of the LLM. For low-confidence/stale known values, prefer `confirm` over blind re-ask or blind trust.
6. **Bounded / cheap / cached LLM.** One call per intake-start (and on plan_dirty recompute), NOT per turn; haiku model; ≤ ~1500 output tokens; ephemeral prompt-cache on the static prefix; memoized per (maxx, prefill-hash). Per-turn asking stays pure-Python (zero latency).
7. **No secrets in code or logs.** Use existing config/provider plumbing. Never log full profile/PII; log slot ids + sources only.
8. **`tsc` and tests stay green.** Backend: `cd backend && python -m pytest` must pass the suite you touch (ignore the documented pre-existing failures — do not "fix" unrelated red). Mobile: `cd mobile && npx tsc --noEmit` must stay clean for any TS you touch.
9. **Simulator/Maestro is flaky and out of scope for backend units.** There may be multiple booted sims — if you ever run Maestro, pin `--device <UDID>` and NEVER block the loop on it. Mobile units verify via `tsc` + code reading, not by booting a sim.
10. **The generator's `missing_required` gate stays the final authority.** Do not weaken it. It is the independent backstop against the LLM under-asking.

---

## BUILD UNITS (ordered, small, independently verifiable)

> After finishing a unit: run its VERIFY, then check it off with the date, commit + push with prefix `dyn-onboarding:`, and continue to the next unchecked unit.

- [x] **U1 — Config flags.** _(2026-06-28: added 7 dynamic-onboarding Fields after `anthropic_model`; prints `False False claude-haiku-4-5`; test_pure_utils 34 passed.)_
  Files: `backend/config.py`.
  Add the eight `Field`s from Guardrail 1 to `Settings`. Nothing reads them yet.
  VERIFY: `cd backend && python -c "from config import settings; print(settings.slot_prefill_enabled, settings.dynamic_questions_enabled, settings.dynamic_questions_model)"` prints `False False claude-haiku-4-5`. `python -m pytest tests/test_pure_utils.py -q`.

- [x] **U2 — MaxDoc carries info_schema (additive, auto-derive fallback).** _(2026-06-28: added `info_schema` field to MaxDoc + parse from front-matter; added `derive_info_schema_from_required`; helper prints `2`, loader imports, all 6 docs parse.)_
  Files: `backend/services/max_doc_loader.py`.
  Add `info_schema: list[dict]` to the `MaxDoc` dataclass (line 95 region). In `parse_max_doc`, set `info_schema=front_matter.get("info_schema") or []` (alongside 165-167). Add pure helper `derive_info_schema_from_required(required_fields) -> list[dict]` (slot=field=id, importance=high, satisfied_by=[`onboarding:<id>`,`facts:<id>`]). Do NOT call it here — just expose it.
  VERIFY: `cd backend && python -c "from services.max_doc_loader import derive_info_schema_from_required; print(len(derive_info_schema_from_required([{'id':'a','required':True},{'id':'b'}])))"` prints `2`; loader still imports.

- [x] **U3 — `onboarding_gap.py` skeleton + Pydantic models + compile_info_schema.** _(2026-06-28: new module with `InfoSlot`/`QuestionPlan`/`InfoSchema` + pure `compile_info_schema` (auto-derive, field cross-link, DSL dead-scan, coverage warn). All 6 docs compile, no dead/uncovered required slots. test_onboarding_gap passes.)_
  Files: NEW `backend/services/onboarding_gap.py`; read-only: `schedule_dsl.py` (use `referenced_fields` at 208), `task_catalog_service.py` (`get_doc`).
  Implement Pydantic `InfoSlot`, `QuestionPlan`. `compile_info_schema(doc) -> InfoSchema`: if `doc.info_schema` empty use `derive_info_schema_from_required`; cross-link each slot to its `required_fields[].id` (raise/log on bad ref); gather DSL exprs from `prompt_modifiers[].if`, every task `applies_when`+`contraindicated_when`, `skeleton.blocks[].if`; via `referenced_fields(...)` compute consumed fields; mark a slot `dead` if its `field` is in NO consumed set AND `keep` falsy; log coverage WARNING for any consumed field with no slot. Pure, no I/O.
  VERIFY: new `backend/tests/test_onboarding_gap.py::test_compile_autoderive_and_deadscan` — compile all 6 docs via the loader, assert every active slot's `field` exists in that doc's `required_fields`, no exception, dead-scan runs. `cd backend && python -m pytest tests/test_onboarding_gap.py -q`.

- [x] **U4 — Cache compiled InfoSchema in the catalog.** _(2026-06-28: `_Entry.info_schema` compiled at warm (try/except guards load); added `get_info_schema(maxx_id)`. test_get_info_schema_cached green; bonemax schema non-empty after warm.)_
  Files: `backend/services/task_catalog_service.py`.
  In `warm_catalog`/the `_Entry` cache, compute/store `info_schema = compile_info_schema(doc)` per maxx_id. Add `get_info_schema(maxx_id) -> InfoSchema | None`.
  VERIFY: `tests/test_onboarding_gap.py::test_get_info_schema_cached` asserts `get_info_schema("bonemax")` is non-empty after warm; `cd backend && python -m pytest tests/test_max_doc_pipeline.py tests/test_onboarding_gap.py -q`.

- [x] **U5 — `assemble_known_context` (deterministic, no LLM).** _(2026-06-28: pure `resolve_prefill` (alias resolution across onboarding/facts/profile/scan, source-rank ties, min_confidence + freshness gates, `span()` derive) + async `_gather_sources` + guarded `assemble_known_context`. test_assemble_prefill_dedup + source-rank test green.)_
  Files: `backend/services/onboarding_gap.py`; read-only: `user_context_service.py`, `personalization.py`, `user_facts_service.py`.
  Implement `assemble_known_context(db, user_id, maxx_id) -> {prefill, provenance, brief}` per Design. Implement `span()` derive. Respect `_SOURCE_RANK`, `min_confidence`, freshness.
  VERIFY: `tests/test_onboarding_gap.py::test_assemble_prefill_dedup` — fake db/user where onboarding has `sleep_time`+`wake_time` and facts has `equipment`; assert `prefill` contains derived `sleep_hours` and `equipment` field ids. Use `conftest.py` fixtures. `python -m pytest tests/test_onboarding_gap.py -q`.

- [x] **U6 — Deterministic prefill rung in the questioner (NO LLM), behind `slot_prefill_enabled`.** _(2026-06-28: `_apply_slot_prefill(user_id,maxx_id,state,db)` helper in chat.py — flag-gated, fills only missing keys, persists via merge_context+_mirror_intake_to_facts, never raises. Wired into all 4 peek paths (fresh start, switch, continue, history re-render). Flag OFF = state untouched. test_prefill_skips_known_question + multi_custom green (23 passed).)_
  Files: `backend/api/chat.py` (`_run_onboarding_questioner`, ~4012-4036 and ~4110), `backend/services/onboarding_questioner.py`.
  Add a wrapper at the start/peek points: when `slot_prefill_enabled`, compute `prefill = assemble_known_context(...).prefill`, merge into the user_state passed to `missing_required`/`peek_next_question`. Flag off → unchanged today's path. Mirror prefilled values into context/facts (`merge_context` + `_mirror_intake_to_facts`). On exception → fall back to raw.
  VERIFY: `tests/test_onboarding_gap.py::test_prefill_skips_known_question` — flag on + `sleep_hours` known → next question is NOT the sleep field; flag off → identical to today. `cd backend && python -m pytest tests/test_onboarding_gap.py tests/test_onboarding_multi_custom.py -q`.

- [x] **U7 — Extend pending state to a slot queue (backward compatible).** _(2026-06-28: `make_plan_pending`/`advance_plan`/`_peek_plan_field` + slot→field resolution via info_schema in onboarding_questioner.py. `peek_next_question` drives the plan when present, falls through to raw missing_required as backstop on exhaustion. `get_pending` accepts old + new shape. test_plan_queue_ordering + back-compat test green; fixed-question path (18 tests) unbroken.)_
  Files: `backend/services/onboarding_questioner.py`, `backend/api/chat.py`.
  Add `make_plan_pending(maxx_id, plan, idx, adapted) -> {max, last_question, plan, idx, adapted, plan_dirty:false, generated_by}`. `get_pending` still accepts old shape. `peek_next_question` wrapper: if `plan` present, return field spec for `plan[idx]` with `question` overridden by `adapted[slot]`. Advance `idx` only on successful coerce.
  VERIFY: `tests/test_onboarding_gap.py::test_plan_queue_ordering` — 3-slot plan peeks in order, advances on coerce, stops at idx==len. `python -m pytest tests/test_onboarding_gap.py -q`.

- [ ] **U8 — `plan_questions` LLM step + fence + fallback, behind `dynamic_questions_enabled`.**
  Files: `backend/services/onboarding_gap.py`; read-only: `lc_providers.py`/`claude_service.py`, `config.py`.
  Implement `plan_questions(...)`: build prompt, call provider with `settings.dynamic_questions_model`, parse strict JSON → `QuestionPlan`, FENCE (intersect gap, drop hallucinated, dedup, re-sort by importance, cap length), memoize per (maxx, prefill-hash) for TTL, ephemeral cache_control on static prefix. try/except → return None.
  VERIFY: `tests/test_onboarding_gap.py::test_plan_questions_fence` (stub provider returns hallucinated slot + dup + bad order → fenced output is in-gap, deduped, importance-ordered) and `test_plan_questions_fallback` (provider raises → None). `python -m pytest tests/test_onboarding_gap.py -q`.

- [ ] **U9 — Wire LLM rung into the questioner (full ladder), behind flags + shadow.**
  Files: `backend/api/chat.py` (`_run_onboarding_questioner`).
  Intake-start: if `dynamic_questions_enabled`, run assemble→gap→`plan_questions`; on success store plan via `make_plan_pending` (`generated_by="llm"`); on None → `slot_prefill` rung; if off/fails → raw. If `dynamic_questions_shadow`, compute plan and LOG would-ask/would-skip diffs but DRIVE the raw/prefill path. Render `action=confirm` as yes_no payload.
  VERIFY: `tests/test_onboarding_gap.py::test_ladder_degrades` — three sub-cases (LLM ok / LLM None→prefill / both off→raw) each produce a valid next-question payload. `cd backend && python -m pytest tests/test_onboarding_gap.py tests/test_chat_routing.py -q`.

- [ ] **U10 — plan_dirty chat-update hook.**
  Files: `backend/api/chat.py` (near `_mirror_intake_to_facts`/facts-merge ~4159-4170 and ~4421-4426), `backend/services/onboarding_questioner.py`.
  Add `mark_onboarding_plan_dirty(user_id, db)`; call after chat-volunteered facts persist. In the peek path, if `pending.plan_dirty`, recompute, re-anchor `idx`, clear flag. No synchronous LLM on the fact-write turn.
  VERIFY: `tests/test_onboarding_gap.py::test_plan_dirty_recompute` — mid-plan, inject a fact satisfying a queued slot, assert it's dropped on next peek. `python -m pytest tests/test_onboarding_gap.py -q`.

- [ ] **U11 — Optional `progress:{index,total}` on the wire + confirm widget.**
  Files: `backend/services/onboarding_questioner.py` (payload), `mobile/screens/chat/MaxChatScreen.tsx` (read-only; change only if needed — stream is already variable-length).
  Add `progress` to the payload when a plan exists (`index=idx+1,total=len(plan)`). Ensure `confirm` slots emit a yes_no payload the existing client renders. Do NOT change `forceNewConversation`.
  VERIFY backend: `tests/test_onboarding_gap.py::test_progress_field`. Mobile: `cd mobile && npx tsc --noEmit` clean for any TS touched (likely none).

- [ ] **U12 — Enrich the 6 docs with real `info_schema` (cross-Max `satisfied_by`).**
  Files: `data/maxes/{skinmax,hairmax,fitmax,bonemax,heightmax,coloringmax}.md`.
  Add explicit `info_schema` blocks prioritizing genuine cross-Max overlaps so dedup fires: e.g. `fitmax` captures sleep/equipment/injury/workout-frequency; declare matching slots in `bonemax` (`workout_frequency` satisfied_by `profile:lifestyle.workout_window`/`facts:experience_level`) and `heightmax` (`sleep_hours` satisfied_by span derive + `profile:lifestyle.sleep`). Set `importance`/`min_confidence` per field. Keep `field:` refs valid.
  VERIFY: `tests/test_onboarding_gap.py::test_all_docs_compile_no_dead_required` — every doc compiles, no required-backed slot wrongly dead, coverage warnings reviewed. `cd backend && python -m pytest tests/test_onboarding_gap.py tests/test_max_doc_pipeline.py tests/test_chunk_audit.py -q`.

- [ ] **U13 — Idempotent backfill job (optional, guarded, not auto-run).**
  Files: NEW `backend/scripts/backfill_onboarding_facts.py` (or a guarded function).
  Replay User.onboarding answers through `remember_fact(source="onboarding", confidence=0.85)` mapped via slot `satisfied_by`. Idempotent (keyed-fact dedupe via existing conflict resolution). Do NOT run in the loop; ship + unit-test the mapping.
  VERIFY: `tests/test_onboarding_gap.py::test_backfill_idempotent` — running twice yields one fact per key. `python -m pytest tests/test_onboarding_gap.py -q`.

- [ ] **U14 — Full-suite green + rollout note.**
  Files: this spec's Iteration-Log; no code unless a regression appears.
  Run the backend suite (ignoring documented pre-existing failures) and mobile tsc.
  VERIFY: `cd backend && python -m pytest -q` (no NEW reds attributable to this work); `cd mobile && npx tsc --noEmit`.

---

## COMPLETION CRITERIA

1. All BUILD UNITS U1–U14 checked off (dated).
2. With ALL new flags OFF, onboarding is byte-for-byte today's fixed-question flow (verified by an unchanged-behavior test).
3. `slot_prefill_enabled=True` (LLM off) deterministically skips already-known questions cross-Max, NO downstream changes (generator gate still passes).
4. `dynamic_questions_enabled=True` produces adapted, ordered, fenced questions; the three-rung ladder degrades gracefully on LLM failure; the generator's `missing_required` gate never lets an under-asked plan generate.
5. Chat-volunteered facts shrink the remaining queue (plan_dirty) and persist to suppress questions in future maxes.
6. `cd backend && python -m pytest -q` has no NEW failures vs the documented pre-existing baseline; `cd mobile && npx tsc --noEmit` is clean for touched TS.
7. All 6 docs carry valid `info_schema` (or compile cleanly via auto-derive) with no wrongly-dead required slots.

---

## OPERATING PROTOCOL (every iteration)

1. **Read this entire file.**
2. Do the **first unchecked BUILD UNIT** only. Keep the change small and scoped to that unit.
3. Run that unit's **VERIFY**. If it fails, fix within the unit until green (respect the pre-existing test baseline — don't chase unrelated red).
4. **Check the box** with today's date and a one-line note in the Iteration-Log.
5. **Commit + push** with message prefix `dyn-onboarding:` (per the user's standing deploy preference: commit + push to the current branch after changes; do NOT trigger EAS/TestFlight builds).
6. If you hit a genuine product/infra decision, add it under **Needs Human Decision**, pick the most reversible default, note the assumption, and keep going — do not block.
7. Continue to the next unit. When COMPLETION CRITERIA all pass, emit the completion promise (below) verbatim and stop.

GUARDRAIL REMINDERS while coding: flags default OFF for the LLM path; fixed onboarding stays a working fallback; questions grounded only in doc-declared slots + known context; never re-ask known info; LLM calls bounded/cached/non-per-turn; no secrets in code/logs; `tsc`/tests green; never block on sim/Maestro (pin `--device`, multiple sims may be booted).

### Completion promise (emit verbatim when done)
`DYNAMIC_ONBOARDING_COMPLETE: dynamic per-Max onboarding shipped behind feature flags; deterministic cross-Max prefill + LLM phrasing/ordering layered over the existing questioner; three-rung fallback ends in today's fixed flow; generator missing_required gate intact; backend pytest + mobile tsc green.`

---

## Needs Human Decision
_(add items here as they arise; pick a reversible default and continue)_

- **[U5] Per-source confidence + precedence numbers (provisional).** `onboarding_gap._ALIAS_META` assigns base confidence: onboarding=0.85, facts(→"chat")=0.9, profile=0.7, scan=0.7; local `_SOURCE_RANK` = chat 5 > onboarding 4 > profile 3 = scan 3 > onairos 2 = derived 2 > inferred 1; derive confidence fixed at 0.8. `slot_default_min_confidence=0.6`, `slot_freshness_ttl_days=180`. These mirror `personalization._DEFAULT_CONF`/`_SOURCE_RANK` but are guesses. Reversible (config + one dict). DECISION NEEDED: confirm thresholds, whether `facts` should always rank as "chat" (facts blob has no per-key source), and which slots are "safety slots" that must `confirm` regardless of confidence (e.g. injuries, medical/TMJ history).

## Deferred
_(empty)_

## Pre-existing test baseline (NOT caused by this work — do not chase)
- `tests/test_max_doc_pipeline.py::test_validator_fixes_collisions_and_titles` FAILS on the clean tree (verified via `git stash` at U2, 2026-06-28). Treat as documented red.

## Iteration-Log
_(append one line per completed unit: `YYYY-MM-DD Uxx — <note>`)_
2026-06-28 U1 — Added 7 dynamic-onboarding config Fields (all default OFF) to `backend/config.py::Settings`. Spec lists 7 under Guardrail 1 ("eight" in U1 header is a typo). Verified flags load + test_pure_utils green.
2026-06-28 U2 — `MaxDoc.info_schema` field + front-matter parse + `derive_info_schema_from_required` helper in `max_doc_loader.py`. Helper returns 2 slots for 2 fields; loader imports; 6 docs parse. (Noted pre-existing test_max_doc_pipeline collision-test red as baseline.)
2026-06-28 U3 — `services/onboarding_gap.py` created: Pydantic `InfoSlot`/`QuestionPlanItem`/`QuestionPlan` + dataclass `InfoSchema` + pure `compile_info_schema`. DSL static-scan (modifiers/tasks/skeleton) via `referenced_fields`. All 6 auto-derived docs: 0 dead, 0 uncovered required. New test_onboarding_gap green.
2026-06-28 U4 — Cache compiled InfoSchema on catalog `_Entry` (computed in `_load`, guarded by try/except) + `get_info_schema(maxx_id)` accessor. test_get_info_schema_cached green.
2026-06-28 U5 — `assemble_known_context`/`resolve_prefill`/`_gather_sources` in onboarding_gap.py. Alias kinds onboarding/facts/profile/scan; per-source confidence + local _SOURCE_RANK (chat>onboarding>profile=scan>derived); freshness via facts `_stated_at`; eval-free `span(a,b)` derive. assemble wrapper never raises (returns empty KnownContext on failure). 4 tests green. NOTE: source/confidence/freshness numbers are provisional — see Needs Human Decision.
2026-06-28 U6 — Deterministic prefill rung wired into `_run_onboarding_questioner` (+ history re-render path) via `_apply_slot_prefill`, gated by `slot_prefill_enabled`. Flag OFF is byte-for-byte today's flow (early return). Persists filled values so generator + future maxes never re-ask. 23 tests green.
2026-06-28 U7 — Plan slot-queue in onboarding_questioner: `make_plan_pending`/`advance_plan`/`_peek_plan_field`, slot→field via info_schema; `peek_next_question` drives the queue then backstops on raw missing_required. No plan present (today) = unchanged path. 7+18 tests green.