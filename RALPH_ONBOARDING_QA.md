# RALPH LOOP — Onboarding questions: multi-select, custom answers, and a quality audit

## STATUS / READ THIS FIRST
- **Nothing here is implemented yet.** Done = all success criteria (SC1–SC6) implemented AND verified
  (backend logic via pytest/scripts; the question UI via the iOS simulator with Maestro).
- This is about the **per-max onboarding Q&A** (the chat-style questions when you start a max). Two
  jobs: (A) let the right questions accept **multiple answers** and/or a **custom typed answer**, and
  (B) **audit the questions** — reword the awkward ones, cut the ones that don't earn their place.
- **Leverage what already exists. Do NOT rebuild the UI.** The mobile chat already supports a
  multi-select mode and a custom-input chip (see §3). The gap is backend per-field wiring + coercion +
  downstream handling of list/custom values, plus the question edits.

---

## 1. HOW IT WORKS TODAY (already mapped — start here)
- **Questions are deterministic** (no LLM), defined as `required_fields` in `data/maxes/<max>.md`
  (skinmax, heightmax, hairmax, fitmax, bonemax). Each field: `id`, question `text`, a `type`
  (enum / yes_no / int-slider / clock), and for enums an `options: {value: label}` map.
- **Backend** `backend/services/onboarding_questioner.py`:
  - `field_to_question_payload(field_spec)` (~L74) → wire format: `{ text, field_id, choices[],
    _value_map, input_widget? }`. **No multi/custom flags today.**
  - `coerce_answer(field_spec, raw)` (~L130) → parses the user's text to a value: exact value/label
    match → substring → a big keyword-heuristic dict → else `None` (re-ask). yes_no/int/clock handled
    too. **Returns a single scalar; no list, no accept-raw-text.**
- **Answer flow** `backend/api/chat.py` (~L4019–4103): `coerce_answer` → on success merge into
  `user_schedule_context`, mirror to `user_facts` (so other maxes don't re-ask), `peek_next_question`;
  when all fields done → `generate_and_persist(...)`. Skeleton `if:` conditions reference field values
  (e.g. `if: "barrier_state == damaged"`).
- **Mobile** `mobile/screens/chat/MaxChatScreen.tsx`:
  - Single-select (~L1301): choice chips; tapping sends that choice. A **custom chip** (labels in
    `CUSTOM_CHIP_LABELS` like "something else"/"other") focuses the text input instead of sending.
  - **Multi-select mode (~L1332): already implemented** — when `multiChoice === true`, chips become
    toggles (checkmark) + a "submit N picks" button that sends them comma-joined.
  - Slider via `components/ChatSliderInput.tsx`.
  - **So the backend must (a) tell the client when a field is multi, and (b) include an "Other" choice
    when custom is allowed.** Confirm exactly what flag the client reads to enter multi mode
    (`multi_choice` in the response) and wire the backend to set it per-field.

---

## 2. MY QUESTION AUDIT (do these, then audit the rest with judgment)
You MUST still read every question yourself and use judgment, but here are the clear ones:

**Make MULTI-SELECT (people genuinely have several):**
- **skinmax `skin_concern`** ("What bugs you most about your skin…") — acne + texture + pigmentation
  is common. Allow multiple. (Drop or keep the "it's solid, just maintain" as a mutually-exclusive
  pick — if chosen, it should clear the others.)
- **fitmax `dietary_restrictions`** ("Anything you don't eat?") — e.g. vegetarian + gluten-free.
  Multi-select AND custom (replace the "Something else or a mix" escape with real multi + an "Other").
- **fitmax `injury_history`** ("Anything banged up…") — knee + shoulder etc. Multi-select AND custom
  (replace "A few things, I'll explain in chat" with multi + an "Other, type it" option).

**Allow CUSTOM free-text answer (add an "Other" that stores what they type):**
- The two fitmax fields above; plus any enum whose last option is an escape hatch like "something
  else", "not sure", "a mix", "I'll explain" — those should become a real custom-text path, not a
  dead enum value.

**Reword (awkward / jargon / pseudoscience / over-promise):**
- **skinmax `diet_open`**: "less dairy, sugar, **seed oils** … if it **clears your skin faster**" —
  drop the fringe "seed oils" framing and the over-promise. Neutral: e.g. "Open to small diet tweaks
  (less dairy/sugar) if they help your skin?" Keep the question; fix the wording.
- **heightmax `equipment_access`**: "What've you got for **decompression work**?" is jargon, and "Bar,
  inversion table, foam roller, **the works**" is a clunky list (a foam roller isn't decompression
  gear). Reword plainly (e.g. "Any gear for hanging/decompression?") and clean the options.

**Check for "shouldn't be there" (use judgment; cut or merge):**
- For EVERY field across all 5 maxes ask: **does this answer actually change the generated plan or the
  recommended products?** If it doesn't measurably branch the skeleton or filter products, cut it —
  onboarding should be short. Also cut/merge anything redundant with another field or with a fact we
  already capture. Flag (don't silently keep) anything you're unsure about in your summary.
- Note the legacy mismatch: bonemax field id `mastic_gum_regular` but the question is about chewing
  tough food — keep the question, just don't let the id confuse the wiring.

**Do NOT** add new questions, change the deterministic (no-LLM) nature, or break existing `if:`
conditions without updating them.

---

## 3. SUCCESS CRITERIA

### SC1 — Schema supports multi-select and custom answers
- Extend the `required_fields` schema (in `data/maxes/*.md`) so an enum field can declare:
  - `multi: true` → the field stores a **list** of values; the user can pick several.
  - `allow_custom: true` → an "Other" path that stores the user's **typed text** as the value (for
    multi, appended to the list).
- Apply these flags to the fields named in §2 (and any others your audit justifies).

### SC2 — Backend emits the right payload + coerces correctly (deterministic)
- `field_to_question_payload`: for `multi` fields, set the flag the mobile client reads to enter
  multi-select mode (confirm it's `multi_choice` — match the client). For `allow_custom`, append an
  "Other" / "something else…" choice (a label the client treats as the custom-input chip).
- `coerce_answer`:
  - `multi` → parse a comma-separated submission into a **list** of matched values (run each token
    through the existing matching logic); return the list. Empty/none → re-ask.
  - `allow_custom` → if the text matches no enum value/label/keyword, **accept the raw text** as the
    value (instead of returning `None`), so custom answers are stored, not rejected.
  - Single-select non-custom behavior is unchanged.
- VERIFY (pytest): a multi field given "Vegetarian, Gluten-free" → `["vegetarian","gluten_free"]`; an
  allow_custom field given "carnivore diet" → stores `"carnivore diet"`; a normal field is unchanged.

### SC3 — Downstream handles list / custom values without breaking
- `user_schedule_context`, `_mirror_intake_to_facts`, and schedule generation must handle a field that
  is now a **list** (or a free-text string). Update any skeleton `if:` conditions that referenced the
  field as a scalar (e.g. `dietary_restrictions == vegetarian` → membership check "vegetarian in
  dietary_restrictions"). Product filtering / facts must respect ALL selected values (e.g. a
  vegetarian + gluten-free user is filtered for both; injuries: train around all listed).
- VERIFY (pytest/script): generating a schedule for a user with a multi dietary_restrictions list
  applies every restriction; a custom answer doesn't crash generation; existing single-value maxes
  still generate identically (no regression).

### SC4 — Question audit applied
- The §2 rewordings done; the flagged escape-hatch options converted to real custom paths; any
  question that fails the "does it change the plan?" test is cut or merged. Onboarding for each max is
  tight and every remaining question is natural-sounding (no jargon, no pseudoscience, no over-promise)
  and earns its place.
- VERIFY: list (in your final summary) every question you changed/removed/kept-but-flagged, per max,
  with one-line reasoning. Re-read the full set after editing to confirm it reads cleanly end to end.

### SC5 — The UI works for multi + custom (Maestro, simulator)
- Start a max whose onboarding now has a multi question and a custom question (use DEV → fresh
  onboarding). Confirm: the multi question shows toggle chips + a working "submit N" button; the
  custom question lets you tap "something else…", type an answer, and have it accepted (the flow
  advances, not re-asks). Screenshot each.
- GOTCHA: Maestro reads the accessibility tree — add `accessibilityLabel`/`testID` where needed; use
  coordinate taps + `takeScreenshot` and read the screenshots. Don't trust "present in tree" = visible.

### SC6 — No regressions
- Onboarding stays deterministic (no LLM calls added). Single-select questions behave exactly as
  before. The app cold-starts clean; `npx tsc --noEmit` clean for any touched mobile files; existing
  onboarding-related tests pass.

---

## 4. CONSTRAINTS
- **No new native deps.** Reuse the existing multi-select + custom-chip UI in `MaxChatScreen.tsx`.
- **Keep onboarding deterministic** (catalog-driven, no per-question LLM).
- Don't break the per-user product consistency or schedule generation already in place.
- Bump any payload/cache version if the stored answer shape for a field changes.

## 5. LOCAL DEV SETUP (already working — use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach onboarding: DEV drawer ("Open dev drawer") → a state with no completed onboarding for a max →
  open that max → "Start" → the chat Q&A. Maestro CLI at `~/.maestro/bin/maestro`; flows in `mobile/maestro/`.

## 6. WORK ORDER
1. SC4 question edits (data/maxes/*.md) + the §2 audit — get the content right first.
2. SC1 schema flags on the chosen fields.
3. SC2 backend payload + coerce (multi list + accept-custom) — pytest.
4. SC3 downstream list/custom handling + skeleton `if:` updates — pytest.
5. SC5 Maestro UI verify (multi + custom). 6. SC6 regression sweep.

## 7. DEFINITION OF DONE
- Designated questions accept multiple answers and/or a custom typed answer end-to-end (UI → coerce →
  stored as list/text → shapes the plan). Awkward/unneeded questions reworded or cut; every remaining
  question reads naturally and changes the output. Deterministic, no regressions, verified (backend
  tests + Maestro). Commit in logical chunks.
