# ralph-chat — per-iteration algorithm

You are one iteration of an autonomous loop testing and fixing the maxapp AI
chat (backend/api/chat.py and friends, branch `creator-plus-v4`). You have NO
memory of any previous iteration — everything you need is on disk. Do **ONE**
unit of work, make **ONE** commit, then **STOP**. Do not try to do more than
one step below in a single pass; the driver will re-invoke you immediately.

cwd is `/Users/home/maxapp`. The harness lives in `ralph-chat/`.

## 0. Orient

Read (don't skip, even if it feels repetitive — you have no memory of the
last pass):
- `ralph-chat/PROGRESS.md` — last 5 entries
- `ralph-chat/FINDINGS.md` — everything
- `ralph-chat/LEARNINGS.md` — everything
- `ralph-chat/RUBRIC.md` — everything

Verify `git branch --show-current` is `creator-plus-v4`. If not: append
`BLOCKED (wrong branch)` to PROGRESS.md and stop.

## 1. Preflight

```
cd /Users/home/maxapp/ralph-chat/harness
/Users/home/maxapp/.venv/bin/python preflight.py --ensure-backend
```

This starts/restarts the backend on :8002 if code changed since the last
check (prompt cache + Python module state are load-once — a fix you make
later in this same pass needs a restart to actually be exercised by
`runner.py`), proves a real LLM answer comes back, and snapshots which
`PromptKey`s resolve from Supabase vs the in-code fallback.

- **PREFLIGHT PASS** → continue to step 2.
- **Any FAIL** (backend won't start, LLM smoke fails — likely a quota/key
  issue, not a code bug) → append `BLOCKED (env): <one-line reason>` to
  PROGRESS.md. Do **NOT** touch FINDINGS.md for an env failure. Stop.

## 2. Decide: full battery, or fix one finding?

Check `ralph-chat/FINDINGS.md` for any line starting `- [ ]`.

### 2a. No open findings → run the FULL battery

```
/Users/home/maxapp/.venv/bin/python runner.py --paraphrase-seed <this iteration's number>
```

(Use a monotonically increasing seed each time you run the full battery —
count how many `FULL BATTERY` entries already exist in PROGRESS.md and add 1.
This rotates which paraphrase variant gets tested each pass.)

Then **JUDGE**: for every turn in every transcript (`state/runs/<run>/transcript-*.md`)
that lists `needs_judge: [...]`, read it and score each named dimension 0-5
against the anchors in RUBRIC.md. A dimension scoring <4 is a failure exactly
like a failed deterministic check.

**TRIAGE**: for every deterministic check that failed AND every judge
dimension that scored <4, open (or recognize) a finding:
- Compute a class + scenario key. If an OPEN (`- [ ]`) finding already
  covers the same (class, scenario), don't duplicate it.
- If a **FIXED** (`- [x]`) finding covers the same (class, scenario): this is
  a **REGRESSION**. Reopen it (`- [x]` → `- [ ]`), note "REOPENED iter N:
  <what regressed>", and treat it with priority in step 3 next pass.
- Otherwise: append a new `- [ ] F-NNN <title> | class: <class>` entry with
  an `evidence:` line pointing at the transcript path.

**Outcome**:
- Battery is fully clean (zero new/reopened findings) → increment
  `ralph-chat/.ralph/clean_streak` (create it with `1` if absent, else
  `current + 1`).
  - Streak reaches **2** → append `PROJECT COMPLETE` to PROGRESS.md, run
    `python report.py`, `touch ralph-chat/.ralph/STOP`, commit everything
    under `ralph-chat/` (run artifacts included), and stop. You're done.
  - Streak is 1 → commit the run artifacts + PROGRESS entry, stop (the NEXT
    iteration will run the battery again for the second consecutive clean
    pass — don't call it complete on a single clean run).
- Battery has failures → write `.ralph/clean_streak` back to `0`. Commit
  FINDINGS.md + the run artifacts + a PROGRESS entry summarizing the pass
  (X/Y scenarios clean, list of new/reopened finding ids). Stop.

### 2b. Open findings exist → fix ONE

Pick the first `- [ ]` by this priority (top wins):
1. `class` implies a crash, hang, or 5xx (nothing renders / the app breaks)
2. `class` implies a marker leak or invalid block shape (visuals broken)
3. `class` implies memory loss or a clarifier re-ask (context ignored)
4. everything else (answer quality, voice, onboarding rough edges)

Reproduce it minimally before touching any code:
```
python runner.py --only <scenario-id> --paraphrase-seed <iter>
```
For a gate/routing question specifically (not visuals), you can also
reproduce in-process against a real user for faster iteration:
```
cd /Users/home/maxapp/backend
/Users/home/maxapp/.venv/bin/python scripts/test_chat_e2e.py --email <existing test user> "<message>"
```
Read the linked transcript in full. Name the causal `file:line` in your
PROGRESS entry before you start editing — if you can't point at a specific
line, you haven't found the root cause yet; keep reading the code.

## 3. Fix policy — hard rules

1. **Fix the CORE**, per this class → site map:

   | Class | Root-fix site |
   |---|---|
   | Marker leak / block missing / corrupted values | Pipeline ORDER — markers must be extracted from `response_text` **before** `_finalize_assistant_message`'s transforms run (em-dash rewrite, smart-lowercase, stray-asterisk drop) touch it. Every `process_chat_message` return site calls finalize; the endpoint's extraction happens later (`backend/api/chat.py` ~5228-5242). Reordering is the fix, not patching the regexes to tolerate mangled input. |
   | Invalid inner shape reaching the client (a FAIL in `validator.py`) | Add/extend `_validate_and_normalize_block()` in `backend/api/chat.py` beside `_extract_visual_blocks` (~line 616) — coerce scalar leaves to `str`, drop a block that's irreparable (log why), never let a dict/list reach a field the mobile renderer treats as a bare `<Text>` child. Shapes come straight from `ralph-chat/RUBRIC.md`'s table. |
   | Model never emits a block where one is warranted | `CHAT_VISUAL_GRAMMAR` in `backend/services/prompt_constants.py` (code-only — safe to edit directly, never loaded from Supabase) + its injection sites (`fast_rag_answer.py`, `lc_agent.py`). |
   | Generic answer / ignores user data | Brief/recall injection (`chat.py` ~2637-2660), `_SLOT_SOURCES` in `user_brief.py`, the persona prompt (Supabase key `max_chat_system` — see rule 3 below), RAG retrieval quality. |
   | Clarifier re-asks a known fact | `_broad_question_mcq` (`chat.py` ~3839-3899), `user_brief.py`'s TTL cache / invalidate-on-new-fact, `user_facts` extraction. |
   | Cross-chat memory miss | `backend/services/chat_memory.py::recall_relevant_turns` — per-conversation exclusion instead of a global `rows[6:]` skip; a domain synonym/stem map (e.g. "tretinoin" ~ "retinoid"); the facts lane in `user_facts_service`. |
   | Onboarding intake ignores an interruption / breaks mid-flow | `backend/services/onboarding_questioner.py`, `chat.py` ~5071-5107, `/history` `pending_question` hydrate. |
   | Hang / timeout / repeated error bubble | LLM timeout+fallback chain (`chat.py` ~3595-3669), `config.py` provider settings. A quota/key failure is an **env** issue (step 1), not a code finding — don't "fix" your way around a real quota exhaustion. |
   | Voice / AI-tells | The `_finalize_assistant_message` chain (`chat.py` ~280-556) and/or the persona prompt. |

2. **Never** weaken the pass bar to make a scenario pass: don't edit
   `ralph-chat/scenarios/battery.yaml` expectations, `RUBRIC.md` thresholds,
   or delete a scenario. You MAY add a new paraphrase variant to an existing
   `message` list, or add an entirely new scenario, if you find a real gap —
   but never to duck a wording your current fix doesn't actually handle.
3. **Never** edit anything under `mobile/` — `MessageBlocks.tsx` and
   `ConfidenceInfoButton.tsx` are read-only render contracts; `validator.py`
   mirrors them on purpose.
4. **Extraction/validation logic fixes MUST ship a pytest** in the same
   commit — extend `backend/tests/test_chat_visual_blocks.py` (it already
   imports `_extract_visual_blocks`, `_extract_method_confidence`,
   `_extract_markdown_tables` — follow its existing style) or add
   `backend/tests/test_chat_block_shapes.py` for the new normalization
   function.
5. **Prompt fixes**: edit the in-code FALLBACK constant (correct behavior
   when Supabase is unreachable). Then check
   `ralph-chat/state/prompt_sources.json` — if the key you touched resolves
   `"supabase"` (as of the last preflight, ALL 34 keys did), your fallback
   edit is invisible to this local environment until you ALSO update the
   Supabase row (test project) so you can actually verify the fix; log the
   exact row diff in `ralph-chat/DEPLOY_NOTES.md` under "Per-fix entries" so
   it ships to production at the next real deploy. `CHAT_VISUAL_GRAMMAR` is
   the one prompt that's genuinely code-only.
6. **No verbatim battery phrasing in a prompt fix** — if you catch yourself
   pasting a scenario's exact wording into a system prompt to make that
   specific ask work, stop; that's overfitting to the test, not fixing the
   behavior. Fix the general case.
7. Two genuinely different fix attempts on the same finding both fail →
   mark it `- [!]` with the exact failure of each attempt, and stop. Don't
   attempt a third.

## 4. Verify

Re-run the finding's scenario with a **different** paraphrase seed than the
one that first caught it (anti-overfit — a fix that only works for the exact
wording that failed isn't a real fix):
```
python runner.py --only <scenario-id> --paraphrase-seed <iter+7>
```
Also re-run 1-2 neighboring scenarios in the same class (e.g. a stat_cards
fix should re-check VIS-03, VIS-08, VIS-09 together).

Run the pytest you added/extended:
```
cd /Users/home/maxapp/backend && /Users/home/maxapp/.venv/bin/python -m pytest tests/test_chat_visual_blocks.py -q
```
Then diff the full suite against the recorded baseline — **no NEW
failures** are acceptable (the 16 pre-existing failures in
`state/baseline_pytest.txt` are not yours to fix). Scope to `tests/`
explicitly — bare `pytest -q` from `backend/` also collects
`test_supabase.py` and `scripts/test_db_connection.py`, two standalone
diagnostic scripts (not real tests) that error at collection with no
`pytest.ini` to exclude them:
```
/Users/home/maxapp/.venv/bin/python -m pytest tests/ -q 2>&1 | tail -40
```

## 5. Record + commit

- Flip the finding to `- [x]`, appending `fixed: iter N` and keep the
  original evidence line.
- Append a PROGRESS.md entry in this format:
  ```
  ### <ISO ts UTC> — iter N — <F-NNN title | FULL BATTERY | BLOCKED>
  - found/did: <1-3 lines; the causal file:line for a fix>
  - battery: <targeted scenario ids + variants passed, or full pass X/Y>
  - files: <touched paths>
  - tests: <pytest added/extended + result> | baseline: no new failures
  - next: <first remaining open F-NNN | run full battery | COMPLETE/BLOCKED reason>
  ```
- Append a `LEARNINGS.md` line if you hit a durable operational gotcha
  (not specific to this one finding) future iterations should know.
- Commit, **path-scoped** (the repo has unrelated dirty files —
  `.claude/launch.json`, `mobile/.expo/`, `backend/uploads/` — never
  sweep them in):
  ```
  git add backend/ ralph-chat/
  git commit -m "ralph-chat F-NNN: <imperative summary>"
  ```
- **Never** `git push`. Never touch OTA/EAS. Local commits only.

## 6. Stop

That's the iteration. Do not start a second finding. Do not run the full
battery "just to check" after a targeted fix — that's step 2a's job on a
future pass once FINDINGS.md is empty.
