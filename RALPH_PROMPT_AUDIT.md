# RALPH_PROMPT_AUDIT.md — audit the prompting, test as a user, fix the problems

## Mission
Audit everything that goes into an LLM prompt in this app, **test it from a real user's point of
view** (role-play diverse users, read the replies, judge them like a human would), find the problems,
and fix them — without weakening safety or the human voice.

## Where the prompting lives (read all of these first)
- `backend/services/lc_agent.py:412` `build_agent_system_prompt()` — the main assembly (~11 injected
  blocks: personalization brief, ABSOLUTE RULES/user facts, coaching context [scan, profile, daily
  availability, weekly overrides, schedule], VOICE block, product/MCQ/web policies, response-length
  override, token budgeting).
- `backend/services/persona_prompts.py` — `_GLOBAL_VOICE`, `tone_preamble()`, the 4 personas
  (hardcore=Goggins, influencer=Clavicular, gentle=Big Daddy, default).
- `backend/services/fast_rag_answer.py:602` — the RAG-path system prompt (tone + facts + profile +
  grounding + length suffix).
- `backend/services/personalization.py:647` `build_personalization_brief()` — the "what Max knows" brief.
- `backend/services/prompt_constants.py` — `MAX_CHAT_SYSTEM_PROMPT` base.
- `backend/api/chat.py:494` `_finalize_assistant_message()` — deterministic post-processing.

## Phase 1 — Build the user-POV test instrument
Create `backend/scripts/prompt_eval.py` that, for a matrix of **personas × intents × edge cases**,
(a) assembles the REAL system prompt via the real builders, and (b) if model keys are available,
generates the actual reply through the real path (`run_chat_agent` / `answer_from_chunks`), then
records BOTH for review.

Matrix to cover (role-play a real person each time):
- **Personas:** hardcore (Goggins), influencer (Clavicular), gentle (Big Daddy), default.
- **Intents:** knowledge Q ("how do i fix dark circles"), schedule change ("move my workout to 7am"),
  vague ("help me look better"), emotional/vulnerable ("i feel like nothing is working, i'm done"),
  allergy-sensitive ("what should i eat" for a user with a peanut allergy + vegetarian),
  off-topic ("who won the game last night"), length-pref = concise AND detailed.
- **Edge cases:** brand-new user with EMPTY profile (cold start); a user with a long profile (does the
  brief get recited vs woven?); a turn that should trigger `recommend_product`; a turn the docs don't
  cover (web-search fallback).

For each cell, capture: the assembled system prompt, the reply (if live), and a verdict. Judge each
reply AS THAT USER with an LLM-judge (or, if no keys, deterministic assertions) on:
- Does it actually answer / help, or dodge?
- Does it sound like a **human in your corner**, or an AI assistant? (flag "as an ai", hollow "great
  job", support-bot cadence, recited profile like "as someone who is 28 and vegetarian…")
- Does it honor the response-length preference?
- Does it stay in persona without breaking safety?
- Allergy/diet: does it NEVER suggest a forbidden item?
- Emotional turn under the hardcore persona: is it still humane?
If keys are unavailable, say so and fall back to static prompt inspection + assertions (never claim a
live pass you did not run).

## Phase 2 — Audit findings (these are real; find more)
Seeded problems I already see in the code — confirm, quantify, and fix:
1. **Duplicated instructions burning tokens.** The em-dash ban appears in `_GLOBAL_VOICE`, again in the
   `## VOICE` block (`lc_agent.py:573`), AND is enforced in post-processing. Voice rules are stated
   twice. Consolidate to one authoritative place; stop paying for it 3×.
2. **Persona ↔ length conflict.** Goggins says "terse 1-2 sentence hits"; the response-length override
   (`lc_agent.py:723`) says "detailed, up to ~8 sentences … overrides all other length rules." Decide
   the precedence intentionally and make the prompt say it once, coherently (don't let a hardcore coach
   silently get told to write 8 sentences with no resolution).
3. **Blanket `.lower()` on every reply** (`api/chat.py:_finalize_assistant_message` → `.lower()`).
   This lowercases acronyms, brands, and "I" — "use SPF in the AM" becomes "use spf in the am". From a
   user POV that reads sloppy/wrong. Fix so acronyms/proper nouns/brand names/units survive (allowlist
   or smarter casing), or justify keeping it with evidence.
4. **Profile recitation risk.** Verify the model weaves the personalization brief in naturally and does
   NOT recite it ("as someone who is 28…"). If it recites, strengthen the brief header guidance.
5. **Token-budget truncation dropping facts.** `trim_text_block` preserves head+tail and can cut the
   middle (`lc_agent.py:748`). Confirm allergy/diet ABSOLUTE RULES and the brief are never trimmed out;
   fix ordering/pinning if they can be.
6. **Cold-start hygiene.** With an empty profile, confirm no empty/dangling blocks ("PROFILE: ",
   "goals: unknown", bare headers) leak into the prompt.
7. **Persona safety on emotional turns.** Hardcore persona + a user in distress: confirm it doesn't
   "callus your mind" at someone who needs support. If unprotected, add a humane-override note (small,
   safe) — without changing notification cadence or the taste bar.
8. **Conflicting casing/format rules** (lowercase voice vs numbered-bold-list rule vs persona emoji
   rules: gentle uses ✨ but `_GLOBAL_VOICE`/post-proc may strip — reconcile).
Find anything else: contradictory directives, stale instructions, instructions the model can't follow,
over-long base prompt, redundant blocks.

## Phase 3 — Fix
Resolve each confirmed problem with the smallest correct change. Prefer consolidation over addition
(the prompt is already long). Every prompt edit MUST be re-validated by re-running the Phase-1 harness
and confirming the user-POV verdicts improved and nothing regressed.

## Phase 4 — Verify
- Re-run `prompt_eval.py`; the persona×intent×edge matrix passes its judge/assertions.
- `cd backend && python -m pytest` green — especially `test_persona_voices.py`,
  `test_chat_tone_length_prompt.py`, `test_copy_filter.py`, `test_server_copy_voice.py`.
- Optional E2E: a Maestro smoke flow that opens the chat, sends one message per persona, and asserts a
  reply renders (planner-style scoping — don't run the whole suite). If Maestro/sim unavailable, say so.

## Success criteria
- **RC1** A written audit (`backend/scripts/PROMPT_AUDIT_FINDINGS.md`) listing each problem with
  file:line + the user-facing impact + the fix.
- **RC2** Duplicated/contradictory instructions removed or reconciled (em-dash banned once; voice rules
  consolidated; persona↔length precedence stated coherently).
- **RC3** The blanket `.lower()` is fixed so acronyms/brands/units/proper-nouns survive (or kept with
  written justification + tests).
- **RC4** The persona×intent×edge matrix is tested from a user POV and every reply's verdict is
  acceptable (human-sounding, helpful, length-honoring, persona-safe, allergy-safe).
- **RC5** Safety intact: allergy/diet ABSOLUTE RULES always injected and never trimmed; persona safety
  on emotional turns; content filter unchanged; all named tests green.
- **RC6** Cold-start produces clean prompts (no empty/dangling blocks).
- **RC7** `prompt_eval.py` exists and is reusable; runs live if keys present, else static+assertions,
  and says which it did.
- **RC8** `npx tsc`/pytest green; each fix committed separately with its before/after note.

## Guardrails — do not break
- Never weaken allergy/diet/medical safety, the content filter, or the persona-safety tests.
- Do not change the fine-tuned model or notification cadence.
- Keep the human-voice principle (a coach/friend who remembers and holds you to it, never an AI bot).
- Additive/consolidating where possible; every prompt change validated by re-running the harness.
- Don't fabricate facts; don't invent new personas.
