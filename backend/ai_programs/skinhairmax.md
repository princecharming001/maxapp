# Skin & Hair

## What it is
Skin & Hair is a short, dermatologist-style basics routine: gentle cleansing, moisturizer, and broad-spectrum SPF in the morning, with an optional retinoid at night introduced slowly, plus simple scalp and hair care. It focuses on skin and scalp health and comfort, not on looks or attractiveness. It is not a treatment for skin or scalp conditions.

## Who it fits / who should check with a professional first
Fits: adults who want a simple, low-cost routine that protects skin from sun, keeps it comfortable, and keeps the scalp clean and healthy.

Check with a dermatologist or clinician first:
- Pregnant, trying to conceive, or breastfeeding: do not schedule retinoids (AAD: retinoids should not be used during pregnancy); keep cleanse, moisturize, SPF.
- Eczema, rosacea, psoriasis, very sensitive skin, or active severe acne or acne scarring: keep the routine gentle and suggest a dermatologist before adding a retinoid.
- Any new, changing, bleeding or unusual mole or spot: suggest a dermatologist promptly; do not comment on it.
- Sudden or patchy hair loss, a painful, itchy or scaly scalp, or hair shedding after illness, pregnancy or new medication: suggest a dermatologist; do not label the cause.
- Currently using prescription skin products (tretinoin, isotretinoin, benzoyl peroxide, antibiotics, hydroquinone): follow the prescriber's instructions; do not add an over-the-counter retinoid on top.

## Habit library

### `am_cleanse` — Gentle AM rinse/cleanse
- minutes: 1 / 2
- anchor: get_ready
- frequency: daily
- tier: core
- why: Dermatologists advise washing the face morning and night with a gentle, non-abrasive cleanser, using fingertips and lukewarm water, without scrubbing.
- how: 1) Wet face with lukewarm water. 2) Apply a gentle cleanser with fingertips (or just water if skin is dry). 3) Rinse and pat dry with a soft towel.
- conflicts/synergies: Sits inside the user's get-ready time; can stack with FitMax `balance_drill`.
- source: https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101

### `am_moisturize` — Morning moisturizer
- minutes: 1 / 1
- anchor: get_ready (right after cleansing)
- frequency: daily
- tier: core
- why: AAD advises applying a fragrance-free moisturizer while skin is still damp to ease dryness.
- how: 1) Apply a fragrance-free moisturizer while skin is still a little damp. 2) Use a pea-to-almond-sized amount for the face. 3) A moisturizer with SPF can combine this step with the next.
- conflicts/synergies: Combine with `am_spf` if the user wants a 2-step routine.
- source: https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin

### `am_spf` — Daily broad-spectrum SPF
- minutes: 1 / 2
- anchor: get_ready (last step, at least 15 min before going outside)
- frequency: daily (including cloudy days)
- tier: core
- why: AAD recommends broad-spectrum, water-resistant SPF 30+ on exposed skin; it needs about 15 min before sun exposure to work well.
- how: 1) Apply SPF 30+ to face, ears and neck (about a nickel-sized amount for the face, more for other exposed skin). 2) Include the scalp part line or wear a hat if hair is thin. 3) Use an SPF 30+ lip balm.
- conflicts/synergies: Essential if using a retinoid (sun sensitivity). Pairs with SleepMax/EnergyMax `morning_light` (apply before going out).
- source: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen

### `spf_reapply` — Reapply when outdoors
- minutes: 1 / 2
- anchor: lunch or before an outdoor block (walks, weekend)
- frequency: on days with 2+ hours outdoors
- tier: medium
- why: AAD advises reapplying every 2 hours outdoors and right after swimming or sweating.
- how: 1) Keep a stick or small tube in your bag. 2) Reapply before a long outdoor walk or after a sweaty workout. 3) Add shade and a hat at midday.
- conflicts/synergies: Trigger after outdoor FitMax/CalmMax/LongevityMax sessions.
- source: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen

### `pm_cleanse` — Evening cleanse
- minutes: 1 / 2
- anchor: wind_down
- frequency: daily
- tier: core
- why: Washing at night removes sunscreen, sweat and grime; dermatologists advise twice-daily gentle cleansing and washing after heavy sweating.
- how: 1) Lukewarm water and a gentle cleanser with fingertips. 2) If wearing water-resistant SPF or makeup, cleanse thoroughly (or twice). 3) Pat dry.
- conflicts/synergies: Fits inside SleepMax `wind_down`; good cue that the day is ending.
- source: https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101

### `pm_moisturize` — Night moisturizer
- minutes: 1 / 1
- anchor: wind_down or pre_bed
- frequency: daily
- tier: core
- why: Moisturizer supports a comfortable skin barrier and reduces retinoid irritation.
- how: 1) Apply after cleansing (or after the retinoid). 2) Use a thicker cream if skin is dry. 3) Fragrance-free is safest.
- conflicts/synergies: Pairs with `pm_retinoid` (moisturize after, or before for "buffering" if sensitive).
- source: https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin

### `pm_retinoid` — Night retinoid (optional)
- minutes: 1 / 2
- anchor: pre_bed (PM only, on clean dry skin)
- frequency: start 2× per week; build to every other night, then nightly if tolerated
- tier: hard (offered only if the user opts in and has no exclusion flags)
- why: Topical retinoids are among the best-studied ingredients for sun-damaged skin; AAD dermatologists advise starting low and slow, at night only.
- how: 1) Use the lowest-strength over-the-counter retinol or adapalene product. 2) Apply a pea-sized amount to dry skin, avoiding eyes, nostrils and lip corners. 3) Moisturize. Expect some dryness in the first weeks; step back to fewer nights if irritated.
- conflicts/synergies: Requires daily `am_spf`. Not on the same night as exfoliating acids or scrubs. Never during pregnancy or breastfeeding. Skip if skin is red or inflamed.
- source: https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol

### `post_workout_rinse` — Rinse after sweating
- minutes: 1 / 3
- anchor: right after FitMax sessions
- frequency: per sweaty workout
- tier: medium
- why: Sweat, especially under hats or helmets, can irritate skin; AAD suggests washing as soon as possible after sweating.
- how: 1) Rinse face (and shower if possible) after training. 2) Change out of sweaty clothes. 3) Moisturize if dry.
- conflicts/synergies: Triggered by FitMax sessions; counts as `am_cleanse` or `pm_cleanse` if the timing matches.
- source: https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101

### `hair_wash_cadence` — Wash on your scalp's schedule
- minutes: 5 / 10
- anchor: get_ready or after_work (shower time)
- frequency: by hair type: oily/straight up to daily; most 2–4× per week; dry, curly or coily at least every 2–3 weeks or as needed
- tier: core
- why: AAD advises shampooing based on how oily your scalp gets, focusing shampoo on the scalp and conditioner on the lengths.
- how: 1) Massage shampoo into the scalp, not the length. 2) Condition the ends (whole length if dry or curly). 3) Detangle wet hair gently with a wide-tooth comb.
- conflicts/synergies: Schedule on FitMax training days if the user sweats a lot.
- source: https://www.aad.org/public/everyday-care/hair-scalp-care/hair/healthy-hair-tips

### `scalp_massage` — Scalp massage
- minutes: 2 / 4
- anchor: get_ready (in the shower) or wind_down
- frequency: daily or 4–5× per week
- tier: medium
- why: A small study of 9 men found 4 min of daily scalp massage for 24 weeks increased hair thickness slightly; it is low-risk and relaxing, but not a hair-loss treatment.
- how: 1) Use fingertips (not nails) or a soft silicone scalp brush. 2) Small circles across the whole scalp for 3–4 min. 3) Gentle pressure only.
- conflicts/synergies: Fits in the shower with `hair_wash_cadence` or as part of SleepMax/CalmMax wind-down.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC4740347/

### `gentle_styling` — Gentle on hair
- minutes: 0 / 1
- anchor: get_ready
- frequency: daily (a rule)
- tier: medium
- why: AAD advises limiting heat styling and using a heat protectant, and notes that hairstyles that pull on hair can cause hair loss over time.
- how: 1) Use the lowest heat setting and a heat protectant, or air-dry when you can. 2) Loosen tight ponytails, braids or buns and vary their position. 3) Wrap hair in a towel or T-shirt to absorb water instead of rubbing.
- conflicts/synergies: None.
- source: https://www.aad.org/public/diseases/hair-loss/causes/hairstyles

### `skin_self_check` — Monthly skin check
- minutes: 5 / 5
- anchor: weekend (after a shower)
- frequency: 1× per month
- tier: hard
- why: AAD notes skin self-exams can help find skin cancer early, when it is highly treatable.
- how: 1) Check face, scalp, back (with a mirror), and soles. 2) Note anything new, changing, itching or bleeding. 3) If anything concerns you, book a dermatologist visit.
- conflicts/synergies: Pairs with LongevityMax `checkup_reminder`. The app never evaluates photos of spots.
- source: https://www.aad.org/public/everyday-care/skin-care-secrets/routine/healthier-looking-skin

## What the AI needs to know (intake)
1. `skin_type` (required) — Picks cleanser/moisturizer framing and retinoid ramp speed.
   Q: "How does your skin usually feel by midday?" Options: Oily | Dry or tight | Combination | Sensitive or easily irritated | Not sure
2. `retinoid_eligible` (required, only if the user wants the optional retinoid) — Hard gate on `pm_retinoid`.
   Q: "Are you pregnant, trying to conceive, breastfeeding, or using a prescription skin product?" Options: None of these | Yes, one of these | Prefer not to say (treat as yes)
3. `hair_type` (required) — Sets washing cadence and conditioner advice.
   Q: "Which best describes your hair and scalp?" Options: Oily scalp, straight hair | Normal | Dry, curly or coily | Very short or shaved | Little or no hair
4. `current_routine` (optional) — Avoids duplicating steps the user already does; sets how many new steps to add.
   Q: "What do you already do most days?" Options: Nothing yet | Wash face | Wash + moisturizer | Wash + moisturizer + SPF
5. `outdoor_time` (optional) — Decides whether to schedule SPF reapplication.
   Q: "How much time are you outside on a typical day?" Options: Under 30 min | 30 min–2 hours | 2+ hours

## Scheduling rules
- AM order: cleanse (or rinse) → moisturizer → SPF last. SPF at least 15 min before going outside; schedule SPF before any morning-light or commute walk.
- PM order: cleanse → retinoid (if on) on dry skin → moisturizer. Retinoids are PM only, never AM.
- Retinoid ramp: weeks 1–2: 2 nights/week (for example Mon/Thu); weeks 3–4: every other night if no irritation; week 5+: nightly only if tolerated. If irritation, drop back one step. Start retinoids no earlier than week 3 of the program, after the basic routine is steady.
- Do not schedule the retinoid on the same night as exfoliating acids or scrubs, or the night before a planned outdoor all-day event in week 1–2.
- SPF reapplication every 2 hours outdoors and after sweating/swimming (only when `outdoor_time` is 2+ hours or for outdoor weekend blocks).
- Hair washing by `hair_type` (see habit). Put washes on FitMax training days when possible.
- Week 1 ramp: add only what is missing from `current_routine`, at most 2 new steps (usually `am_spf` + `pm_cleanse`).
- Scaling: Skin & Hair should cost about 3–6 min/day. ~3 min → cleanse + SPF (AM), cleanse (PM). 5–6 min → add moisturizers + scalp massage. More time → add retinoid (opt-in) and the monthly self-check.
- Weekend: same AM/PM routine; schedule `skin_self_check` (monthly); SPF reapply for outdoor plans.

## Safety and claims
- No looks or attractiveness framing ("glow up", "look younger", "fix your face", rating faces, before/after comparisons). Talk about comfort, protection and skin health.
- Never assess moles, rashes, acne severity, or hair-loss type from photos or descriptions; suggest a dermatologist.
- No prescription products (tretinoin, isotretinoin, minoxidil, finasteride, spironolactone, hydroquinone), peptides, injections, microneedling, or DIY peels. Do not recommend specific brands or percentages beyond "lowest-strength OTC".
- No retinoids during pregnancy, when trying to conceive, or while breastfeeding; no retinoid if the user did not answer the eligibility question.
- Skin & Hair plans never include supplements; collagen and similar live in Suppmax (information only, honest about weak evidence). No biotin megadoses.
- No tanning advice; never suggest skipping sunscreen to "get vitamin D".
- If a product causes burning, swelling, rash or hives, tell the user to stop it and seek advice.

## Sources
- https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101
- https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin
- https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen
- https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol
- https://www.aad.org/public/everyday-care/hair-scalp-care/hair/healthy-hair-tips
- https://www.aad.org/public/everyday-care/skin-care-secrets/routine/healthier-looking-skin
- https://www.aad.org/public/diseases/hair-loss/causes/hairstyles
- https://pmc.ncbi.nlm.nih.gov/articles/PMC2699641/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4740347/
