---
maxx_id: coloringmax
display_name: Coloring
short_description: Brighten, don't lighten — even tone, glow, lips, eyes, hair and facial-hair contrast for brown/tan skin.

schedule_design:
  cadence_days: 14
  am_window: ["wake+0:10", "wake+1:30"]
  pm_window: ["sleep-2:00", "sleep-0:15"]
  daily_task_budget: [3, 6]
  intensity_ramp:
    week_1: [0.0, 0.5]
    week_2: [0.3, 1.0]
  # Deterministic skeleton. schedule_skeleton.py expands this against the user's
  # answers with no LLM call; block `cadence` governs repetition. Conditions are
  # written so an UNANSWERED field still resolves sanely (a free-course user can
  # enter with zero answers and still get a full, sensible routine): the daily
  # foundation always applies; broadly-useful habits default ON (via `!= x` /
  # `not in [...]`, which are true for unanswered); opt-in extras (SPF reapply,
  # contacts, committed-beard grooming) stay gated.
  skeleton:
    blocks:
      # ── Morning: brighten the skin, wake the lips, frame, protect ──
      - id: am_routine
        slot: am_open
        cadence: daily
        tasks: [color.am_routine]
      - id: am_lip
        slot: am_open
        cadence: daily
        tasks: [color.lip_am]
      - id: am_spf
        slot: am_open
        cadence: daily
        tasks: [color.spf_am]
      - id: am_hair
        slot: am_open
        cadence: n_per_week=3
        if: "hair_situation != minimal"
        tasks: [color.hair_style]
      # ── Midday: protect the tone you're brightening (outdoor users) ──
      - id: midday_spf_reapply
        slot: midday
        cadence: daily
        if: "outdoor_exposure in [heavy, moderate]"
        tasks: [color.spf_reapply]
      # ── Light: build a golden/caramel tone safely (everyone) ──
      - id: golden_hour
        slot: pm_close
        cadence: n_per_week=3
        tasks: [color.golden_hour]
      - id: glow_exfoliation
        slot: pm_close
        cadence: weekly_on=thursday
        if: "main_concern == dullness"
        tasks: [color.weekly_exfoliation]
      - id: undereye_care
        slot: pm_close
        cadence: n_per_week=4
        if: "main_concern == dark_circles"
        tasks: [color.under_eye_care]
      # ── Evening: clean off the day, brighten, hydrate lips ──
      - id: pm_routine
        slot: pm_close
        cadence: daily
        tasks: [color.pm_routine]
      - id: pm_lip
        slot: pm_close
        cadence: daily
        tasks: [color.lip_pm]
      # ── Contrast levers: eyes + teeth ──
      - id: contrast_check
        slot: pm_close
        cadence: n_per_week=3
        tasks: [color.contrast_eyes_teeth]
      - id: contacts_research
        slot: flexible
        cadence: every_n_days=13
        if: "contacts_interest in ['yes', maybe]"
        tasks: [color.contacts_research]
      - id: contacts_trial
        slot: flexible
        cadence: weekly_on=saturday
        if: "contacts_interest in ['yes', maybe]"
        tasks: [color.contacts_trial]
      # ── Grooming: maintain a committed look, or test to find one ──
      - id: facial_hair_grooming
        slot: flexible
        cadence: n_per_week=2
        if: "facial_hair in [goatee_mustache, full_beard]"
        tasks: [color.facial_hair_grooming]
      - id: facial_hair_experiment
        slot: flexible
        cadence: n_per_week=3
        if: "facial_hair not in [goatee_mustache, full_beard, patchy]"
        tasks: [color.facial_hair_experiment]
      - id: facial_hair_grow
        slot: flexible
        cadence: n_per_week=2
        if: "facial_hair == patchy"
        tasks: [color.facial_hair_grow]
      - id: brow_tidy
        slot: flexible
        cadence: weekly_on=wednesday
        tasks: [color.brow_tidy]
      # ── Hair framing: shape, layers, brown-gradient highlights ──
      - id: hair_audit
        slot: flexible
        cadence: weekly_on=saturday
        if: "hair_situation != minimal"
        tasks: [color.hair_audit]
      # ── Tracking: weekly natural-light selfie + the 8-category score ──
      - id: baseline_capture
        slot: am_open
        cadence: every_n_days=14
        tasks: [color.baseline_selfie]
      - id: weekly_score
        slot: am_open
        cadence: weekly_on=sunday
        tasks: [color.weekly_score]
      - id: progress_photo
        slot: am_open
        cadence: weekly_on=sunday
        tasks: [color.progress_photo]
      - id: monthly_review
        slot: midday
        cadence: monthly_on=1
        tasks: [color.monthly_review]

# required_fields are personalization signals, NOT gates: every one is
# `required: false` so a free-course user who enters with zero answers still
# generates a full schedule. Conditions above/below degrade gracefully when a
# field is unanswered. When the user does answer (via chat or future onboarding)
# the schedule sharpens.
required_fields:
  - id: skin_tone
    question: "How would you describe your skin tone?"
    type: enum
    options:
      deep: "Deep brown"
      brown: "Medium brown"
      tan: "Tan / light brown"
      olive: "Olive"
    required: false
    why: "This module is built for brown/tan skin (brighten, don't lighten). Tone tunes sun guidance, contact-lens picks, and hair-highlight shade. It never changes the goal — your tone stays; its quality goes up."

  - id: main_concern
    question: "What's dragging your coloring down the most right now?"
    type: enum
    options:
      uneven_tone: "Uneven, patchy tone"
      hyperpigmentation: "Dark spots / hyperpigmentation"
      dullness: "Dull, tired, no glow"
      dark_circles: "Dark under-eye circles"
      beard_shadow: "Beard shadow dulling my face"
    required: false
    why: "Sets the primary track and which brightening + contrast moves get emphasized. It's almost never that your skin is 'too dark' — it's one of these, and all are fixable without lightening."

  - id: brightener_pref
    question: "Which brightening ingredient do you want to build around?"
    type: enum
    options:
      centella: "Centella (the core pick)"
      vitamin_c: "Vitamin C"
      not_sure: "Not sure — pick for me"
    required: false
    why: "Centella Asiatica is the main 'skin brightening law' for evening tone. Vitamin C is a valid alternative. Not sure defaults to Centella; you can A/B them and keep what works."

  - id: lip_condition
    question: "How are your lips most days?"
    type: enum
    options:
      healthy: "Smooth and healthy"
      dry_chapped: "Dry or chapped"
      dull_dark: "Dull, gray, or dark"
    required: false
    why: "Lips are a coloring pillar — a subtle rosy tone reads as health. Drives how often you exfoliate before the tinted balm."

  - id: facial_hair
    question: "What's your facial hair situation?"
    type: enum
    options:
      clean_shaven: "Clean shaven"
      stubble: "Light stubble"
      goatee_mustache: "Goatee + mustache"
      full_beard: "Full beard"
      patchy: "Patchy / still growing in"
    required: false
    why: "Facial hair either sharpens contrast or dulls the face. Committed looks (goatee/beard) get a maintenance task; everyone else gets a 2-week test to find the look that fits their face."

  - id: hair_situation
    question: "How do you wear your hair?"
    type: enum
    options:
      short: "Short / simple"
      growing_out: "Growing it out"
      styled: "Styled, I put effort in"
      minimal: "Buzzed / bald — skip hair"
    required: false
    why: "Hair frames the face and sets contrast against your skin. Gates the daily framing habit and the weekly shape/highlight audit (mocha-brown gradient). Only 'buzzed/bald' skips hair tasks."

  - id: outdoor_exposure
    question: "How much time are you out in daylight on a normal day?"
    type: enum
    options:
      heavy: "A lot — outdoor work or always out"
      moderate: "Some — commute and errands"
      minimal: "Barely — mostly indoors"
    required: false
    why: "Drives SPF reapply cadence. For brown/tan skin the sun isn't the enemy — uneven and burnt are — so we use golden-hour light strategically, with SPF."

  - id: contacts_interest
    question: "Open to natural-looking colored contacts for eye contrast?"
    type: enum
    options:
      yes: "Yes, I'd try it"
      maybe: "Maybe, tell me more"
      "no": "No, not for me"
    required: false
    why: "Eyes are a big contrast lever. For brown skin, natural brown / light-brown / darker-green lenses can add contrast without looking uncanny. Gates a research+safety task; never pushed if you say no."

optional_context:
  - id: product_preferences
    description: "Specific brightening serums, balms, or SPF the user already likes"
  - id: budget_constraint
    description: "Drugstore-only vs. open to mid-tier — keeps product picks realistic"
  - id: routine_depth_pref
    description: "Minimalist vs. willing to layer more steps; tunes routine length"
  - id: photo_goal
    description: "Whether the user mainly cares about in-person look vs. photos (shifts golden-hour + contrast emphasis)"
  - id: known_sensitivities
    description: "Ingredients that have irritated the user before; gates aggressive brighteners"

prompt_modifiers:
  - id: core_rule
    if: "always"
    then: "NORTH STAR: brighten, don't lighten. Never suggest anything to make the skin look paler (no too-light concealer, no mismatched BB cream, no all-over tinted SPF to look paler). Every move raises the QUALITY of the user's natural tone — evenness, glow, contrast — never changes the tone. Judge skin quality, not skin color."
  - id: brightener_centella
    if: "brightener_pref in [centella, not_sure]"
    then: "BRIGHTENER: Centella Asiatica serum is the core. Use it daily AM (and PM if tolerated) to even tone and calm. Frame it as the main 'brightening law.' Keep the routine simple around it."
  - id: brightener_vitc
    if: "brightener_pref == vitamin_c"
    then: "BRIGHTENER: Vitamin C (L-ascorbic 10–15% or a gentler derivative) in the AM under SPF for brightness. Offer to A/B against Centella over 2–4 weeks and keep whichever the user's skin responds to."
  - id: concern_uneven
    if: "main_concern == uneven_tone"
    then: "TRACK: evenness. Daily brightener + SPF are the engine. Be patient — tone evens over 8–16 weeks. SPF is non-negotiable or it undoes the progress."
  - id: concern_pigment
    if: "main_concern == hyperpigmentation"
    then: "TRACK: pigmentation. Brightener (Centella or vitamin C) + optional azelaic + religious SPF. Most pigment is downstream of inflammation and sun, so calm + protect first. No harsh scrubbing — it darkens marks."
  - id: concern_dullness
    if: "main_concern == dullness"
    then: "TRACK: glow. Hydration, gentle exfoliation 1×/wk, brightener, and golden-hour light for a caramel glow. Sleep and water move dullness fast."
  - id: concern_dark_circles
    if: "main_concern == dark_circles"
    then: "TRACK: under-eye. Sleep, hydration, and a caffeine eye product; dark circles hurt eye/skin contrast most. Manage expectations — structural circles need light + concealer-matching, not lightening."
  - id: concern_beard_shadow
    if: "main_concern == beard_shadow"
    then: "TRACK: beard shadow. A clean, intentional facial-hair shape or a closer shave kills the dulling shadow. Tie grooming cadence to the shadow, not to a calendar."
  - id: lips_revive
    if: "lip_condition in [dry_chapped, dull_dark]"
    then: "LIPS: revive first. Gentle exfoliation 2–3×/wk (soft cloth, never hard), then tinted balm AM and hydrating balm PM. Goal is a subtle healthy pink, not gloss."
  - id: facial_hair_commit
    if: "facial_hair in [goatee_mustache, full_beard]"
    then: "FACIAL HAIR: maintain the chosen look cleanly. Goatee shaped to a triangle, mustache to a clean trapezoid that never crosses the lip, bulk trimmed off the top. Keep cheeks defined so shadow doesn't dull the face."
  - id: facial_hair_test
    if: "facial_hair not in [goatee_mustache, full_beard]"
    then: "FACIAL HAIR: run a look-test across the 2 weeks — wear one of {clean cheeks, light stubble, goatee+mustache, fuller stubble} for a few days, photograph and rate it on contrast, cleanliness, masculinity, harmony, photo appeal, then switch. Softer faces usually gain from a controlled goatee + mustache."
  - id: facial_hair_patchy
    if: "facial_hair == patchy"
    then: "FACIAL HAIR: patchy / growing in — don't force a shape into thin spots. Let it fill 2–3 weeks, clean only neck/cheek strays, and judge density at the end. A controlled goatee+mustache may be the eventual answer if cheeks stay sparse."
  - id: hair_gradient
    if: "hair_situation != minimal"
    then: "HAIR: complement the palette, don't clash. Suggest mocha-brown highlights for a brown gradient that connects skin, eyes, and hair (not random bright/blonde). If wavy or straightish, grow out + layer for shape; long without layers looks messy."
  - id: hair_skip
    if: "hair_situation == minimal"
    then: "HAIR: buzzed/bald — skip framing/highlight tasks. Redirect that attention to skin glow, brows, and beard/edge contrast."
  - id: sun_strategy
    if: "outdoor_exposure in [heavy, moderate]"
    then: "LIGHT: use it strategically. Golden hour / soft sun builds a caramel glow, angularity, and a natural squint for photos — but SPF first, never burn, and pair sun with the brightening routine. Burnt and uneven undo coloring; tan that's even helps it."
  - id: sun_indoor
    if: "outdoor_exposure == minimal"
    then: "LIGHT: mostly indoors — get short, deliberate golden-hour exposure when possible, and lean on even skin + good lighting for photos. Still wear SPF near windows."
  - id: contacts_yes
    if: "contacts_interest in ['yes', maybe]"
    then: "CONTACTS: recommend natural shades for brown skin — darker green, brown, or light brown — to add eye contrast without looking uncanny. Stress hygiene: never sleep in them, never share, ideally a proper fitting/prescription."
  - id: tone_sun_caution
    if: "skin_tone in [tan, olive]"
    then: "TONE: tan/olive can show uneven sun and redness faster — be a bit more conservative with sun duration and consistent with SPF + brightener so it stays even."
  - id: sun_pigment_caution
    if: "main_concern in [hyperpigmentation, uneven_tone]"
    then: "LIGHT: you're actively evening tone — keep deliberate sun SHORT (~10 min, ~1×/wk), strictly golden-hour, SPF first. Direct/midday sun darkens the exact spots you're treating; lean on even skin + good lighting for photos instead."
---

# Why coloring matters for appearance

Your face is not just bones — it also has color, and color moves fast. Before anyone reads your structure, they register your *coloring*: how clean, even, bright, and healthy the surface looks. Unlike bone, you can change coloring in days to weeks, which makes it the highest-leverage, most controllable thing most guys can work on.

The whole system rests on one rule: **brighten, don't lighten.** The goal is never to look paler. It's to make your natural tone look cleaner, brighter, and more intentional — even tone, real glow, and strong contrast across skin, lips, eyes, teeth, hair, and facial hair.

## The seven coloring pillars

Attractiveness in color comes from seven levers, worked together, not one at a time:

- **Skin tone** — glow, evenness, complexion quality.
- **Lips** — rosy tone, a health signal, softness.
- **Eyes** — contrast, brightness, an "alive" look.
- **Teeth** — white contrast that makes eyes and skin pop.
- **Hair** — frame, color gradient, face harmony.
- **Facial hair** — structure, contrast, masculine framing.
- **Sun / light** — golden tone, photo appeal, angularity.

## Brighten, don't lighten

Most brown/tan guys think the problem is that their skin is "too dark." It almost never is. The real problem is **uneven tone, hyperpigmentation, dullness, dark circles, beard shadow, bad lighting, or a too-light product shade** — all fixable without touching your tone.

**Lightening** is trying to cover or change your complexion: concealer that's too light, BB cream that doesn't match, tinted SPF used all over to look paler, masking your natural tone. **Brightening** is enhancing the complexion you already have: more even skin, less hyperpigmentation, better glow, a healthier brown/tan tone, cleaner coloring. We only ever brighten.

# Skin is the baseline

Skin tone and texture are the foundation of coloring. If the skin is dull, patchy, or uneven, every other feature looks worse. The targets are bright skin, even tone, radiant texture, healthy glow, less under-eye darkness, and less hyperpigmentation — quality, never color.

**Centella Asiatica** is the core brightening ingredient — used daily to even and brighten tone, the main "skin brightening law." **Vitamin C** is a valid alternative for brightness; you can test it against Centella and keep what works. **Alpha arbutin / glutathione** are possible add-ons, not the basics. **SPF** protects every bit of progress — skip it and pigment and dullness come back.

# Sunlight and golden coloring

For brown/tan skin the sun is not automatically the enemy. The issue isn't being darker — it's being uneven, dull, or burnt. Once the skin is more even, sunlight can create a golden tone, a caramelized glow, better photos, stronger angularity, better facial harmony, and a natural squint. Use it strategically, not recklessly: avoid burning, wear SPF, don't overdo it, favor golden hour or soft sunlight for photos, and pair sun with brightening and skin-evening habits.

# Lips add color to the face

Lips are part of facial coloring; dead, chapped, gray, or dull lips make the whole face look less healthy. The ideal lip is smooth, full, not chapped, slightly rosy, and hydrated. To revive: take a soft cloth, gently rub to remove dead skin (never hard), apply tinted balm, and reapply when dry. Morning gets a light exfoliation if needed plus tinted balm; night gets a hydrating balm. The goal is a subtle healthy pink tone — not gloss.

# Eyes, teeth, and contrast

Eyes are one of the biggest coloring and contrast levers. White eyes plus white teeth create a strong health signal that makes the whole face look cleaner and more vibrant. Eye goals: clear eyes, bright sclera, less tired under-eye area, and better contrast between eyes and skin — which come from sleep, hydration, and managing dark circles. For brown skin, natural-looking **darker green, brown, or light-brown contacts** can add contrast without looking uncanny. Treat contacts seriously: proper hygiene, never sleep in them, never share them, ideally get a proper fitting or prescription.

# Hair color and the brown gradient

Hair frames the face and sets contrast against your skin. Brown/tan skin looks best when hair color **complements** the natural palette rather than clashing. **Mocha-brown highlights** create a brown gradient that connects brown skin, brown eyes, and brown hair — more harmonious than random bright or blonde highlights, and they add variation without clashing. If your hair is wavy or moderately straight, grow it out if you can and get it layered — layers add shape, volume, and definition, while long hair without layers can look messy.

# Facial hair and brow contrast

Facial hair can either improve contrast or ruin coloring, so it should be intentional, not random. The options — clean shaven, light stubble, goatee + mustache, full beard — have no one-size-fits-all answer; the right one depends on the face. Softer features often gain contrast, structure, and masculine framing from a controlled goatee and mustache. The geometry rules: trim bulk off the top, never let the mustache cross over the lip, shape the goatee into a triangle, shape the mustache area into a clean trapezoid, and avoid messy beard shadow that dulls the face. Brows should be trimmed, tamed, face-fitting, and not overdone.

# The 14-day plan

The schedule front-loads a sequence: **Days 1–3 baseline** (natural-light selfies, score skin/lips/eyes/hair/facial hair, stop using too-light products, identify dark circles / hyperpigmentation / beard shadow / dullness); **Days 4–7 skin and lips** (start the brightening routine with Centella or vitamin C, gently exfoliate lips, tinted balm, track glow and evenness); **Days 8–10 grooming** (clean up cheeks, test stubble vs goatee/mustache, lightly trim brows, remove dulling shadow); **Days 11–14 contrast and photos** (test golden-hour light, check eye/teeth contrast, consider natural contacts, audit hair shape and mocha-brown highlights).

# Tracking, daily checklist and weekly coloring score

Daily, the morning checklist is: skin routine done, lips tinted, facial hair checked, hair framed, SPF if going out, natural-light selfie if tracking. The night checklist is: skin cleaned, brightening product applied, lips hydrated, facial hair/brows set for tomorrow, score logged. Weekly, score eight categories 1–5 — skin evenness, skin glow, lip color, eye brightness, teeth/eye contrast, hair harmony, facial hair contrast, overall coloring. Interpretation: 0–15 needs basics, 16–25 improving, 26–35 strong coloring foundation, 36–40 high-level coloring max. Judge quality, never color.

```yaml task_catalog
- id: color.am_routine
  title: "Morning coloring routine"
  description: "Cleanse gently, then your brightening serum (Centella is the core pick; vitamin C if you chose it), then moisturizer, then SPF last — always. Brightening evens tone; SPF protects every bit of progress."
  duration_min: 6
  default_window: am_open
  tags: [coloring, am, skin, foundation]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.1
  evidence_section: "Skin is the baseline"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.lip_am
  title: "Lips: tint (AM)"
  description: "Apply a tinted lip balm for a subtle healthy pink tone. Only if lips are flaky, gently buff first with a soft damp cloth (never hard) — 2–3×/wk max, never daily; over-buffing keeps them raw and dark."
  duration_min: 2
  default_window: am_open
  tags: [coloring, am, lips, foundation]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.1
  evidence_section: "Lips add color to the face"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.spf_am
  title: "SPF (every morning)"
  description: "Apply SPF 30–50 as the last AM step — even indoors and near windows. It's the one thing protecting every bit of brightening progress; skip it and pigment and dullness come back."
  duration_min: 1
  default_window: am_open
  tags: [coloring, am, spf, foundation]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.1
  evidence_section: "Skin is the baseline"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.hair_style
  title: "Frame your hair"
  description: "Style your hair to frame the face — shape and a little volume read as harmony. If you're growing it out, keep it tidy so it looks intentional, not messy."
  duration_min: 4
  default_window: am_open
  tags: [coloring, am, hair]
  applies_when: ["hair_situation != minimal"]
  contraindicated_when: ["hair_situation == minimal"]
  intensity: 0.2
  evidence_section: "Hair color and the brown gradient"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 3 }

- id: color.spf_reapply
  title: "Reapply SPF"
  description: "Reapply SPF if you've been outside or near windows. Stick or powder is easiest over the day. Protects the tone you're brightening."
  duration_min: 2
  default_window: midday
  tags: [coloring, midday, spf]
  applies_when: ["outdoor_exposure in [heavy, moderate]"]
  contraindicated_when: []
  intensity: 0.3
  evidence_section: "Sunlight and golden coloring"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.golden_hour
  title: "Golden-hour light (15 min)"
  description: "Get ~15 minutes of low, warm, long-shadow light — within ~an hour of sunrise or sunset. If the sun is high or strong (UV index 6+), skip it for today. SPF on, never burn. Even tan helps coloring; burnt and uneven undo it; midday sun darkens spots."
  duration_min: 15
  default_window: flexible
  tags: [coloring, light, glow, photo]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.4
  evidence_section: "Sunlight and golden coloring"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 3 }

- id: color.pm_routine
  title: "Evening coloring routine"
  description: "Cleanse off SPF, sweat, and the day, apply your brightening treatment (Centella or vitamin C), then moisturize. Clean, even skin overnight is the base everything else sits on."
  duration_min: 6
  default_window: pm_close
  tags: [coloring, pm, skin, foundation]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.1
  evidence_section: "Skin is the baseline"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.lip_pm
  title: "Lips: hydrate (PM)"
  description: "Apply a hydrating lip balm before bed so lips repair overnight and stay smooth and rosy, not chapped or gray."
  duration_min: 1
  default_window: pm_close
  tags: [coloring, pm, lips]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.25
  evidence_section: "Lips add color to the face"
  cooldown_hours: 0
  frequency: { type: daily, n: 1 }

- id: color.contrast_eyes_teeth
  title: "Eyes + teeth contrast"
  description: "Brighten the contrast levers. Eyes: sleep, water, a cold splash or caffeine eye product for puffiness. Teeth: whitening toothpaste, and rinse after coffee/tea/dark soda so stains don't set (whitening strips ~1–2×/wk if you want more). White eyes + white teeth read as health and make the whole face pop."
  duration_min: 3
  default_window: pm_close
  tags: [coloring, eyes, teeth, contrast]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.35
  evidence_section: "Eyes, teeth, and contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 3 }

- id: color.weekly_exfoliation
  title: "Gentle weekly exfoliation"
  description: "Once a week, a gentle chemical exfoliant (PHA or low-% mandelic) — never a physical scrub, which darkens marks. Lifts dullness so glow comes through. Skip it if your skin is irritated or you used a strong active today."
  duration_min: 4
  default_window: pm_close
  tags: [coloring, skin, exfoliation]
  applies_when: ["main_concern == dullness"]
  contraindicated_when: []
  intensity: 0.5
  evidence_section: "Skin is the baseline"
  cooldown_hours: 144
  frequency: { type: n_per_week, n: 1 }

- id: color.under_eye_care
  title: "Under-eye care"
  description: "Pat a caffeine eye product around the orbital bone, and protect tonight's sleep + hydration — the two biggest movers of dark circles. Structural circles need light + concealer-matching, not lightening."
  duration_min: 2
  default_window: pm_close
  tags: [coloring, eyes, under_eye]
  applies_when: ["main_concern == dark_circles"]
  contraindicated_when: []
  intensity: 0.3
  evidence_section: "Eyes, teeth, and contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 4 }

- id: color.contacts_research
  title: "Research natural contacts"
  description: "Look into natural-looking lenses for brown skin — darker green, brown, or light brown — that add eye contrast without looking uncanny. Read the hygiene rules: never sleep in them, never share, ideally get a proper fitting/prescription."
  duration_min: 10
  default_window: flexible
  tags: [coloring, eyes, research]
  applies_when: ["contacts_interest in ['yes', maybe]"]
  contraindicated_when: ["contacts_interest == no"]
  intensity: 0.45
  evidence_section: "Eyes, teeth, and contrast"
  cooldown_hours: 0
  frequency: { type: every_n_days, n: 13 }

- id: color.contacts_trial
  title: "Try a natural lens shade"
  description: "If you found a pair you like, try ONE natural shade (brown, light-brown, or darker-green) and judge eye/skin contrast in natural light and a selfie. Never sleep in them, never share, ideally from a proper fitting/prescription."
  duration_min: 8
  default_window: flexible
  tags: [coloring, eyes, contacts]
  applies_when: ["contacts_interest in ['yes', maybe]"]
  contraindicated_when: ["contacts_interest == no"]
  intensity: 0.45
  evidence_section: "Eyes, teeth, and contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 1 }

- id: color.facial_hair_grooming
  title: "Shape your facial hair"
  description: "Maintain your look cleanly: trim bulk off the top, keep the mustache off the lip line, shape a goatee into a triangle and the mustache into a clean trapezoid, and keep cheek lines defined so beard shadow doesn't dull the face."
  duration_min: 8
  default_window: flexible
  tags: [coloring, grooming, facial_hair]
  applies_when: ["facial_hair in [goatee_mustache, full_beard]"]
  contraindicated_when: []
  intensity: 0.35
  evidence_section: "Facial hair and brow contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 2 }

- id: color.facial_hair_experiment
  title: "Facial-hair test (rate it)"
  description: "Still finding your best look — this week wear ONE option (clean cheeks, light stubble, goatee + mustache, or fuller stubble) for a few days, photograph it, then rate it on contrast, cleanliness, masculinity, harmony, and photo appeal. Next time, try a different one. Softer faces usually gain from a controlled goatee + mustache."
  duration_min: 6
  default_window: flexible
  tags: [coloring, grooming, facial_hair]
  applies_when: ["facial_hair not in [goatee_mustache, full_beard]"]
  contraindicated_when: []
  intensity: 0.35
  evidence_section: "Facial hair and brow contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 2 }

- id: color.facial_hair_grow
  title: "Let it fill in"
  description: "Patchy means still growing — give it 2–3 weeks before you judge density. Clean only the obvious neck and cheek strays so it looks intentional; don't carve a shape into thin areas yet. Reassess coverage at the end of the cycle."
  duration_min: 4
  default_window: flexible
  tags: [coloring, grooming, facial_hair]
  applies_when: ["facial_hair == patchy"]
  contraindicated_when: []
  intensity: 0.55
  evidence_section: "Facial hair and brow contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 2 }

- id: color.brow_tidy
  title: "Tidy your brows"
  description: "Lightly trim and tame the brows so they frame the eyes — face-fitting and clean, never overdone. Brows are the frame around your strongest contrast lever."
  duration_min: 5
  default_window: flexible
  tags: [coloring, grooming, brows]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.3
  evidence_section: "Facial hair and brow contrast"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 1 }

- id: color.hair_audit
  title: "Audit hair shape + highlights"
  description: "Check whether your hair is framing the face: flat vs layered, harmony vs clash. If wavy or straightish, consider growing out + layering. Consider mocha-brown highlights for a brown gradient that connects skin, eyes, and hair."
  duration_min: 8
  default_window: flexible
  tags: [coloring, hair, audit]
  applies_when: ["hair_situation != minimal"]
  contraindicated_when: ["hair_situation == minimal"]
  intensity: 0.4
  evidence_section: "Hair color and the brown gradient"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 1 }

- id: color.baseline_selfie
  title: "Baseline: photos + first score"
  description: "Before you change anything: take front + side selfies in natural light and score the 8 categories — this is your day-1 'before.' Stop using any too-light products (concealer, BB cream, all-over tinted SPF to look paler). Note your dark circles, hyperpigmentation, beard shadow, and dullness so you know what you're fixing."
  duration_min: 6
  default_window: am_open
  tags: [coloring, tracking, baseline]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.6
  evidence_section: "The 14-day plan"
  cooldown_hours: 0
  frequency: { type: every_n_days, n: 14 }

- id: color.weekly_score
  title: "Weekly coloring score"
  description: "Take a natural-light selfie and score eight categories 1–5: skin evenness, skin glow, lip color, eye brightness, teeth/eye contrast, hair harmony, facial hair contrast, overall coloring. 0–15 needs basics, 16–25 improving, 26–35 strong, 36–40 high-level. Judge quality, never color."
  duration_min: 5
  default_window: am_open
  tags: [coloring, tracking, score]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.5
  evidence_section: "Tracking, daily checklist and weekly coloring score"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 1 }

- id: color.progress_photo
  title: "Progress photo"
  description: "Front and side photo in the same natural light each week. Coloring changes are gradual — photos catch the evenness and glow that the mirror hides day to day."
  duration_min: 3
  default_window: am_open
  tags: [coloring, tracking, photo]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.45
  evidence_section: "Tracking, daily checklist and weekly coloring score"
  cooldown_hours: 0
  frequency: { type: n_per_week, n: 1 }

- id: color.monthly_review
  title: "Monthly coloring review"
  description: "Review your weekly score trend and photos. Double down on what moved (evenness, glow, contrast), drop what didn't, and reset the next month's focus. Keep the tone you have — raise its quality."
  duration_min: 10
  default_window: midday
  tags: [coloring, tracking, review]
  applies_when: [always]
  contraindicated_when: []
  intensity: 0.4
  evidence_section: "Tracking, daily checklist and weekly coloring score"
  cooldown_hours: 0
  frequency: { type: every_n_days, n: 30 }
```
