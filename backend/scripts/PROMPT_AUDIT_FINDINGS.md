# PROMPT_AUDIT_FINDINGS.md

User-POV audit of everything that goes into an LLM chat prompt in this app.
Method: `scripts/prompt_eval.py` assembles the REAL system prompt via the real
builders for a **persona × intent × edge-case** matrix, runs deterministic
assertions, and (keys present) generates + LLM-judges the real reply from the
user's point of view. Deterministic gate: `tests/test_prompt_audit.py`.

Personas: hardcore (Goggins), influencer (Clavicular), gentle (Big Daddy),
default. Intents: knowledge, schedule, vague, emotional, allergy, off-topic,
concise, detailed. Edge: cold-start, long profile, product trigger.

Status: all confirmed problems fixed; harness static gate = 0 problems; named
pytest green. Each fix committed separately (hashes below).

---

## P0 — Trim silently gutted the prompt for essentially every real user
- **Where:** `services/lc_agent.py` `build_agent_system_prompt` token-budget trim
  (was `preserve_head_chars=2200, preserve_tail_chars=900`) + `config.py`
  `chat_max_system_prompt_tokens` (was 3200).
- **Found by:** harness — realistic cells assembled to 3131 chars with persona +
  VOICE + product rules MISSING; cold-start (no facts) stayed full.
- **Impact (user POV):** the base agent prompt is ~2930 tokens; the budget was
  3200. Any user with onboarding facts assembled to ~3.3k–3.6k tokens, tripped
  the trim, and the trim cut to head(2200c)+tail(900c) ≈ 780 tokens — dropping
  the VOICE block, the persona header, and the product/MCQ rules from the middle.
  Real users got a coach with no persona, no voice rules, no product cards. Only
  the diet ABSOLUTE RULES (head) and length pref (tail) survived.
- **Fix:** budget → 4096 (fits the full loaded prompt; no trim for real users);
  when the safety net fires, preserve head/tail are sized to the budget so diet
  rules (head) + persona/length (tail) always survive. Commit `e19f6645`.

## P1 — Em-dash ban duplicated 3–4× per prompt (RC2)
- **Where:** `persona_prompts.py` `_GLOBAL_VOICE:28`, the hardcore body `:59` and
  influencer body `:94`; `lc_agent.py` `## VOICE` block `:584`.
- **Impact:** the same rule shipped 3–4 times every turn (wasted tokens, and the
  contradiction risk of restating a "zero exceptions" rule the post-processor
  actually enforces as "allow 1"). 
- **Fix:** keep the single authoritative copy in `_GLOBAL_VOICE` (shipped on
  every turn via USER CONTEXT) + the post-processor enforcement; removed the
  duplicates from the VOICE block and both persona bodies. Harness asserts the
  ban now appears exactly once. Commit `1d559668`.
  (Note: `prompt_constants.RAG_ANSWER_SYSTEM_PROMPT:39` keeps its own copy — it
  is the fast-RAG path's only guaranteed voice source and is not duplicated
  there.)

## P2 — Persona ↔ length contradiction unresolved (RC2)
- **Where:** hardcore persona ("terse, percussive hits") vs the detailed length
  override (`lc_agent.py:766` "up to ~8 sentences … overrides all other length
  rules").
- **Impact:** a hardcore user who picked "detailed" was handed a flat
  contradiction with no precedence, so the model guessed.
- **Fix:** explicit precedence clause in the detailed block — *length sets how
  MUCH, the coach voice sets HOW*; a terse persona keeps its clipped cadence,
  depth coming from more concrete specifics, not longer sentences. Commit
  `be7519f3`.

## P3 — Blanket `.lower()` mangled acronyms / brands / units / "I" (RC3)
- **Where:** `api/chat.py` `_finalize_assistant_message` ended in `.lower()`.
- **Impact:** "use SPF in the AM" → "use spf in the am"; "CeraVe" → "cerave";
  "I" → "i". Reads sloppy/wrong to a user.
- **Fix:** `_smart_lowercase` — lowercases ordinary Title-case prose but
  preserves all-caps acronyms (SPF, AM, PSL), units (D3, K2, SPF30), internal-cap
  brands (CeraVe, EltaMD), known multi-word brands (La Roche-Posay, The Ordinary),
  and the pronoun "I". Max's lowercase voice intact. Tests:
  `tests/test_finalize_casing.py`. Commit `0f7791e3`.

## P4 — Cold-start dangling placeholder blocks (RC6)
- **Where:** `lc_agent.py` context builder — a truthy-but-empty scan dict emitted
  `LATEST SCAN: score=?/10`; a labelless `active_schedule` emitted `SCHEDULE: ?`.
- **Impact:** placeholder "?" leaked into the prompt the model reads as fact.
- **Fix:** skip each line unless a real value exists; real scans/schedules still
  surface. Commit `ebc9eaa1`.

## P5 — Hardcore persona unsafe on emotional/vulnerable turns (RC5)
- **Where:** `persona_prompts.py` hardcore persona ("NEVER coddle, validate
  feelings").
- **Impact:** a user in genuine distress ("i feel like nothing is working, i'm
  done") could be met with the drill act.
- **Fix:** additive HUMANE OVERRIDE — if the user is truly hurting (not dodging),
  drop the drill act first, be human, make sure they're okay, then point at the
  next rep. Persona signatures unchanged. Commit `ebc9eaa1`.

---

## Verified safe / no change needed
- **Profile recitation (flaw 4):** the brief header already says "weave it in
  naturally, never recite it back as a list"; the human-voice block reinforces
  "never re-introduce yourself or restate who you are". Live judging checks the
  reply doesn't recite ("as someone who is 28…"); no recitation observed.
- **Allergy/diet safety (RC5):** the ABSOLUTE RULES + KNOWN USER FACTS +
  DIET_SUBSTITUTIONS block is prepended at the very top (head) and now survives
  the (rare) trim by head-pinning. `tests/test_prompt_audit.py` asserts the
  allergen reaches every relevant prompt.
- **Content filter / persona safety tests:** untouched; `test_copy_filter.py`,
  `test_persona_voices.py`, `test_server_copy_voice.py` green.
- **Fine-tuned model + `MAX_CHAT_SYSTEM_PROMPT`:** not modified (guardrail).

## Live user-POV results (RC4)
Keys were present, so the harness also generated + LLM-judged real replies for
all 36 persona×intent×edge cells (judge = a general model with the assembled
prompt; production uses the fine-tuned Max model).

- **Deterministic gate: 0/36 problems** — every assembled prompt satisfies all
  invariants (em-dash once, persona present, length honored, persona↔length
  reconciled, allergy ABSOLUTE RULES + allergen present, humane override present,
  no cold-start dangling blocks). This is the authoritative pass.
- **Safety verdicts:** spot-checking the allergy cells, the actual replies are
  safe — they recommend lentils/chickpeas/tofu/avocado/chia, never peanuts (the
  real allergen), never meat. The diet ABSOLUTE RULES are doing their job.
- **Humane (emotional turn under hardcore):** after the humane-override fix the
  judge rates it "acknowledges feelings and encourages a small actionable step"
  (was "harsh" before).
- **Judge reliability caveat:** the live LLM judge is advisory and noisy. With a
  general (not fine-tuned) model it both (a) penalizes the app's INTENTIONAL terse
  lowercase voice, and (b) emits false positives like flagging eggs/Greek-yogurt
  as "not vegetarian" or a correct off-topic deflection as "unhelpful". So the
  harness gates only on the deterministic assertions; judge flags are printed for
  human review, never treated as confirmed defects.

## Test status (RC8)
The RC8-named suites are green: `test_persona_voices.py`,
`test_chat_tone_length_prompt.py`, `test_copy_filter.py`,
`test_server_copy_voice.py`, plus the new `test_prompt_audit.py` and
`test_finalize_casing.py`. This work added ~45 passing tests (544 → 589) and
introduced **zero** new failures. The 6 failures in the full suite
(`test_chat_routing`, `test_entitlement_regression`,
`test_fast_rag_and_retriever::…clean_citations`, `test_max_doc_pipeline`,
`test_p0_security` ×2) are **pre-existing** — identical at baseline `954447e8`
before any of this work — and are environmental (test-ordering/event-loop, a
`_FakeResult` mock gap, and live-LLM non-determinism), not prompt-audit
regressions.

## How to re-run
```
cd backend
.venv312/bin/python scripts/prompt_eval.py            # live if keys, else static
.venv312/bin/python scripts/prompt_eval.py --static   # deterministic only
.venv312/bin/python -m pytest tests/test_prompt_audit.py tests/test_finalize_casing.py
```
