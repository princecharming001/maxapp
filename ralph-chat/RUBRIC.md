# ralph-chat RUBRIC — the pass bar

A scenario turn passes when **all deterministic checks pass** (no FAIL-severity
violations) **and every judge dimension scores ≥4/5**. This file is the single
source of truth for both; `harness/validator.py` implements the shape table
below in code, and `RALPH_PROMPT.md`'s fix step must never lower a threshold
here to make a scenario pass — thresholds only move if the USER changes the
bar.

## Block shape table (mirrors mobile/components/MessageBlocks.tsx exactly)

| type | required shape | FAIL (crashes the message row — no error boundary exists) | WARN (renders, but wrong/degraded) |
|---|---|---|---|
| `table` | `data.columns: str[]`, `data.rows: str[][]` | any column or cell is a dict/list | rows/columns missing/empty, ragged row length, non-str scalar cell |
| `comparison` | `data.options: [{name?, pros: str[], cons?: str[]}]` | any option is not a dict; `name`/`pros[i]`/`cons[i]` is dict/list | options missing/empty; >3 options (mobile slices) |
| `timeline` | `data.steps: [{label, detail?}]` | any step is not a dict; `label`/`detail` is dict/list | steps missing/empty; label missing |
| `flowchart` | `data.steps: [str \| {label, note?}]` | step is neither str nor dict; `label`/`note` is dict/list | steps missing/empty |
| `stat_cards` | `data.cards: [{value, label, hint?}]` | any card is not a dict; `value`/`label` is dict/list | cards missing/empty; >4 cards (mobile slices); `hint` is dict/list (template-literal-coerced, not a crash — just ugly) |
| `checklist` | `data.items: [str \| {text, done?}]` | item is neither str nor dict; `text` is dict/list | items missing/empty |

Common to every block: `type` must be one of the six above; `data` must be a
dict; `title` (optional) should be a string. `visual_blocks` as a whole is
capped at 6 by the backend contract (WARN if exceeded — means the cap isn't
being enforced).

## method_metadata shape

`{"methods": [{"title": str, "confidence": number, "rationale"?: str, "sources"?: str[]}]}`

- FAIL: `methods` not a list; an entry not a dict; `title` missing/non-str;
  `confidence` missing/non-numeric.
- FAIL (quality bug, not a crash, but wrong on screen): `0 < confidence < 1` —
  a leaked 0-1 fraction. Mobile does `Math.max(0, Math.min(100, confidence ?? 0))`
  with NO ×100 rescale, so `0.85` displays as **"0.85% · Low"** instead of
  **"85% · High"**. A legitimate 0-100 confidence never lands strictly between
  0 and 1, so this range is an unambiguous signal of the normalization bug.
- WARN: `confidence` outside [0,100]; `rationale`/`sources` wrong type.

## Deterministic check vocabulary (`harness/checks.py`)

| check | meaning |
|---|---|
| `no_marker_leak` | prose must not contain `[/?(visual_block\|method_confidence\|choices(_multi)?)]` (case-insensitive) — a marker that survived extraction |
| `no_leaked_json` | prose must not contain `{"type":` or `{"methods":` — a raw payload that leaked as text |
| `blocks_schema_valid` | `validate_all_blocks(visual_blocks)` + `validate_method_metadata(method_metadata)` have zero FAILs |
| `no_tech_leak` | prose excludes `Traceback\|asyncio\.\|Exception:\|\[SYSTEM\|api[_ ]key\|langgraph` (case-insensitive) |
| `no_friendly_error` | prose excludes the three `_friendly_llm_error_message` substrings: "usage or billing limit", "trouble reaching my brain", "took too long" |
| `prose_nonempty` | `response` stripped is ≥40 chars, UNLESS `choices` is non-empty (a pure-clarifier turn can be a short question) |
| `latency_lt: N` | wall-clock turn latency < N seconds |
| `block_present: <type>` | at least one `visual_blocks[].type == <type>` |
| `block_absent: <type>` | no block of that type present |
| `choices_present` / `choices_absent` | `choices` non-empty / empty |
| `no_reask: <slot>` | prose does not match the slot's re-ask regex (see per-scenario definitions) |
| `includes_any: [...]` | prose (lowercased) contains at least one of the keyword set |
| `excludes: [...]` | prose (lowercased) contains none of the keyword set |
| `confidence_range_0_100` | shorthand for the method_metadata confidence FAIL rule above |
| `max_voice_case` | ≤10% of sentence-initial words are capitalized non-acronym/non-brand words (a cheap proxy for "AI-assistant voice" creeping in — judge dimension `max_voice` is the real arbiter) |
| `http_ok` | response status was 200 (a clean 429 with `Retry-After` is a separate, explicitly-expected outcome in concurrency scenarios, not `http_ok`) |

## Judge dimensions (0-5 scale, pass ≥4; scored by the iteration agent reading the transcript)

- **answers_the_question** — 5 = directly and completely answers what was asked; 3 = partially answers or answers a nearby question; 1 = ignores the question or is generic filler.
- **uses_user_context** — 5 = visibly incorporates a fact the user stated (in this thread OR a prior conversation) that was relevant; 3 = doesn't contradict known facts but doesn't use them either; 1 = ignores or contradicts a known fact (e.g. recommends salicylic acid to a user who said they're allergic to it).
- **max_voice** — 5 = reads like a knowledgeable coach talking directly to the user, no "as an AI" tells, no generic hedging filler ("It's important to note that..."); 3 = mostly fine with one stiff phrase; 1 = reads like a generic chatbot.
- **actionability** — 5 = the user could act on this immediately (concrete steps/numbers/names); 3 = generally useful but vague on specifics; 1 = platitudes only.

A scenario's turn is a PASS only if every check listed in its `expect.deterministic` passes AND every dimension in `expect.judge` scores ≥4. A finding is opened for each individual failing check or sub-4 dimension (not one blob per turn) so fixes are traceable to a specific claim.
