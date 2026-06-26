# RALPH_PERSONAS.md — Coach personas: research the voices, drive chat + notifications

## Mission
The app used to offer three generic tones (Softcore / Mediumcore / Hardcore). We have replaced
that with **three named character coaches**, each picked from an animated 3D avatar in the chat
drawer. Your job: make each persona a *real, researched, distinctive voice* that drives **both the
chatbot replies AND the push notifications**. When a persona is active, every generated line —
chat answer, scheduled nudge, streak reminder — should sound unmistakably like that character.

The three personas and their backend `coaching_tone` slugs (already wired in the mobile picker,
`mobile/components/ChatConversationsDrawer.tsx` → `PERSONA_OPTIONS`):

| Persona       | Vibe                      | Backend slug (current) |
|---------------|---------------------------|------------------------|
| **Goggins**   | hard motivation           | `hardcore`             |
| **Clavicular**| deep looksmaxxing-coded   | `influencer`           |
| **Big Daddy** | warm / supportive         | `gentle`               |

Riding on existing enum slugs means **no DB migration is required**. (SC7 optionally adds
dedicated slugs with back-compat.)

---

## Phase 1 — Research each voice → write `backend/services/persona_voice_research.md`
Do real web research. Produce a markdown brief with, for each persona, **10+ signature phrases**
plus the rhetorical patterns (cadence, sentence length, how they open/close, what they never say).

- **Goggins** (REAL — David Goggins style). Capture his lexicon: "stay hard", "who's gonna carry
  the boats", "callous the mind", "taking souls", "the 40% rule", "you don't know me, son", raw
  second-person challenge, repetition, self-talk, suffering-as-growth, ownership/no-excuses.
  SAFETY: this is a *Goggins-style archetype coach*, NOT a claim to BE David Goggins and NOT an
  endorsement by him. Keep it PG-13 (intense, profane-adjacent, but no actual slurs).
- **Clavicular** (looksmaxxing-coded, deep in the niche). Capture the real lexicon: mewing,
  mogging / "mogs", canthal tilt, gonial angle, maxilla / midface, hunter eyes, sexual dimorphism,
  PSL scale, halo effect, "ascending", "it's over / we're so back", framemaxxing, leanmaxxing,
  softmaxxing vs hardmaxxing, bone structure. Hyper-technical, ranks features, clinically confident,
  motivates by precision. SAFETY: redirect away from harmful practices (bonesmashing, starvation,
  unprescribed PEDs) toward safe maxxing (skincare, posture, mewing, grooming, lean bulk, sleep).
- **Big Daddy** (INVENTED — not a real person; design him). Warm, protective father-figure coach.
  Calls the user "kid" / "champ" / "my boy", unconditionally proud, gentle accountability
  ("we go at your pace, but we don't quit"), steady and reassuring, the occasional dad-joke, never
  shames. Write a one-paragraph character bible + 10 signature lines invented from scratch.

## Phase 2 — Persona prompt strings (chat)
Rewrite `backend/services/persona_prompts.py` → `TONE_PROMPTS` for the three live slugs
(`hardcore`→Goggins, `influencer`→Clavicular, `gentle`→Big Daddy) so each is the FULL character
voice, not the current generic blurb. Each must:
- Keep the `_GLOBAL_VOICE` human rules (no em-dashes, no fluff). Goggins may go ALL-CAPS intense;
  still no em-dashes.
- Bake in 3–5 researched signature phrases tagged "use sparingly, never force."
- Stay safe per Phase 1 rails. `tone_preamble()` already injects into chat (`process_chat_message`)
  and `fast_rag_answer.py` — confirm both paths pick up the new strings unchanged.

## Phase 3 — Persona-driven NOTIFICATIONS (the key ask)
Push/notification copy is currently persona-agnostic. Make generated notification body text adopt
the active persona. Audit every place push copy is produced and route it through the persona:
- `backend/services/notification_planner.py`, `copy_filter.py`, `schedule_runtime.py`,
  `hairmax_notification_engine.py`, `sms_reply_style.py` — find the ones that emit user-facing copy.
- Thread the user's `coaching_tone` into the copy generator and prepend a short *notification-tuned*
  variant of the persona preamble to the copy prompt (or post-filter copy through the persona).
- Each persona's pushes must be recognizably theirs, e.g.:
  - Goggins → "get up. the work doesn't care that you're tired. go."
  - Clavicular → "mewing streak day 6. tongue on the palate, lock it. you're ascending."
  - Big Daddy → "hey champ, proud of you for yesterday. let's keep it rolling, i got you."

## Phase 4 — Verify (deterministic, no live LLM)
- Add `backend/tests/test_persona_voices.py`: assert each slug's preamble contains its signature
  markers; assert `tone_preamble()` routes the three slugs to distinct strings; assert the
  notification copy path *receives and applies* `coaching_tone` (mirror the assembled-prompt proof
  in `backend/tests/test_chat_tone_length_prompt.py`).
- `test_chat_tone_length_prompt.py` currently asserts `hardcore → "ruthless, no-bullshit"`; if you
  change the signature words, UPDATE that test so the suite stays green.
- Run `cd backend && python -m pytest tests/test_persona_voices.py tests/test_chat_tone_length_prompt.py -q`.

## Success criteria
- **SC1** `persona_voice_research.md` exists, 10+ signature phrases + rhetorical patterns per persona (Big Daddy invented).
- **SC2** `TONE_PROMPTS` for `hardcore`/`influencer`/`gentle` are full Goggins/Clavicular/Big Daddy voices carrying signature phrases.
- **SC3** Chat replies are recognizably the chosen persona — proven by a test asserting the persona preamble reaches the assembled chat prompt for each slug.
- **SC4** Notification copy generator threads + applies `coaching_tone`; each persona yields distinct push copy (proven by test).
- **SC5** Safety rails present: Clavicular never endorses harmful practices; Goggins never claims to be the real person; no slurs anywhere.
- **SC6** `test_persona_voices.py` passes AND existing tone tests updated and green.
- **SC7** (optional) dedicated slugs `goggins|clavicular|bigdaddy` added with back-compat aliases to the current slugs, `patchCoachingTone` enum + mobile mapping migrated.

## Discipline
- Backend-only behavior change; the mobile avatar picker is already shipped. Don't touch the avatars.
- Keep every existing test green. Commit per phase. Don't stop until SC1–SC6 pass.
