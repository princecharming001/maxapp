# EM_DASH_AUDIT_SPEC.md

> Persistent build spec for a Ralph loop. Read this file IN FULL at the start of
> every iteration, do the next unchecked unit, verify it, check it off (dated),
> commit + push, then continue. When the COMPLETION CRITERIA pass, emit the
> promise verbatim. Repo root = `/Users/home/maxapp`.

## GOAL
Remove em dashes (`—`, U+2014) from everything a USER can see, because em-dash
punctuation reads as AI-written. Two workstreams:
1. **Static copy** (mobile + backend user-facing strings): rephrase each prose
   em dash into natural human punctuation.
2. **LLM output** (the coach chat, scan analysis, plan/schedule, notifications):
   add a style rule to the system prompts so generated text stops using em
   dashes in the first place. (This is the highest-impact piece — most "AI"
   prose the user sees is generated, not hardcoded.)

"Rephrase slightly" = recast to a comma, period, colon, parentheses, or a
conjunction (and / or / to) so it reads like a person wrote it. NEVER just swap
`—` for `-` or `–` (a stray hyphen/en-dash still looks dashy and wrong).

## HARD GUARDRAILS — what to touch and what to NEVER touch
**FIX (user-facing prose em dashes only):**
- JSX text nodes and `<Text>…</Text>` content.
- String props that are COPY: `label`, `title`, `subtitle`, `sub`, `placeholder`,
  `message`, `body`, `description`, `helpNote`, `cta`/button text, `eyebrow`,
  alert `title`/`message`, onboarding/paywall/marketing strings, copy constants
  and string arrays rendered to users.
- Backend strings returned to the client: API/error `detail` messages, push /
  notification copy, any prose in responses.

**NEVER TOUCH:**
- **Code comments** (`//`, `/* */`, leading `*`, Python `#`, and `"""` docstrings).
  ~354 mobile comment lines contain `—`; users never see them. Leave them all.
- **Standalone empty-value placeholders** — a lone `'—'` meaning "no value / N/A"
  (e.g. `weeks ? String(weeks) : '—'`, `locked ? '—' : …`, `<Text>—</Text>`).
  These are a UI convention, not AI prose. Leave them (see Needs Human Decision).
- **Non-visible strings:** `console.*`/`logger.*`/`print(...)` log text, analytics
  event names, query keys, ids, enum/code values, test files & fixtures, and
  `__DEV__`-only debug strings.
- **En dashes / hyphens in ranges** (`9–5`, `6-7pm`, `Mon-Fri`) — not the AI tell;
  leave them. Target `—` (em dash) only.
- `node_modules`, `ios/`, `android/`, `build/`, `dist/`, `assets/`, lockfiles,
  and ALL `*.md` docs (including this file and the other *_SPEC.md). Docs are not
  app copy.

When unsure whether a string is user-facing, check how it's rendered; if it's
not shown to a user, skip it. Bias toward NOT churning.

## HOW TO FIND CANDIDATES (each iteration)
```
# user-facing TS/TSX copy candidates (then eyeball: skip comments + placeholders)
grep -rn "—" mobile --include=*.tsx --include=*.ts | grep -v node_modules \
  | grep -vE '^\s*//|^\s*\*|console\.|logger\.'
# backend user-facing candidates
grep -rn "—" backend --include=*.py | grep -vE '^\s*#|logger\.|print\('
```
Work ONE area per iteration (don't sprawl). Classify every hit before editing.

## BUILD UNITS (ordered; each is one commit, prefix `emdash:`)
- [ ] U1 — mobile/screens copy: onboarding + paywall + auth (`screens/onboarding*`,
      `screens/auth`, `screens/payment`). Rephrase prose em dashes; skip
      comments/placeholders. VERIFY: `cd mobile && npx tsc --noEmit` clean (only
      pre-existing `components/glass/*` errors); re-grep these dirs shows only
      comments/placeholders left.
- [ ] U2 — mobile/screens copy: scan + marketplace (`screens/scan`,
      `screens/marketplace`). Same rules. (Note the many `'—'` placeholders here —
      LEAVE them.) VERIFY as U1.
- [ ] U3 — mobile/screens copy: home + planner + profile + chat + courses + the
      rest of `screens/`. VERIFY as U1.
- [ ] U4 — mobile/components + constants + navigation copy. VERIFY as U1.
- [ ] U5 — backend static user-facing strings: API responses, error `detail`,
      notification/push copy (`backend/api`, notification builders in
      `backend/services`). Skip comments/logs. VERIFY: `cd backend && python -m
      pytest -q -k "not slow"` still green (or unchanged), imports OK.
- [ ] U6 — **LLM prompt style guard (highest impact).** Find every system/prompt
      builder that produces user-facing text — the coach chat, the scan/analysis
      generator (gemini/Claude), the plan/schedule generator, the personalization
      brief, notification copy generators. Add ONE explicit rule to each system
      prompt (ideally via a shared style constant): "Write like a real person.
      Do NOT use em dashes (—) or en dashes as punctuation — use commas, periods,
      colons, or parentheses instead." VERIFY: the rule string appears in each
      prompt builder; backend imports/tests green. Optionally run one generation
      and confirm no `—` in the output.
- [ ] U7 — Final sweep: re-run the grep across mobile + backend; confirm every
      remaining `—` is a comment, a documented placeholder, a log/test string, or
      a range. `cd mobile && npx tsc --noEmit` clean. Record the residual count +
      categories in the Iteration-Log.

## COMPLETION CRITERIA (all true before the promise)
1. U1–U7 checked off (dated).
2. No em dash remains in user-facing prose copy across mobile + backend (only
   comments / documented placeholders / logs / tests / ranges may still contain `—`).
3. Every user-facing LLM system prompt carries the no-em-dash style rule.
4. `cd mobile && npx tsc --noEmit` clean apart from the known glass errors;
   backend pytest unchanged/green.

When all hold, output exactly: `<promise>EM DASH AUDIT COMPLETE</promise>`

## OPERATING PROTOCOL (every iteration)
1. Read this file. 2. Do the FIRST unchecked unit only; keep edits scoped to it.
3. Verify per the unit. 4. Check the box with a dated one-line result; log
residuals. 5. Commit + push to the current branch (one logical change per commit,
prefix `emdash:`). 6. Continue. Flag genuine product/design calls under Needs
Human Decision instead of guessing.

## NEEDS HUMAN DECISION (do not act; flag here)
- Standalone empty-value placeholders (`'—'` for "no value"): keep as-is
  (default), or convert app-wide to `N/A` / a middot `·` / blank? This is a
  design call — the loop leaves them untouched until decided.

## DEFERRED
- (none yet)

## ITERATION-LOG
- (start)
