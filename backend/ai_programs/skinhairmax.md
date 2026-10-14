# Skin & Hair

## What it is
Skin & Hair builds each person a real morning and night skin routine from a 3-question quiz: a small core (cleanse, moisturize, SPF) plus ONE main active matched to their goal, done the same way every day from day 1. The only exceptions are rare, fixed treatment nights (a weekly face mask, and weekly at-home 0.25 mm microneedling for lines, spots or texture) that replace that night's active. Scalp care is added only when asked for. It focuses on skin and scalp health and comfort, not on looks or attractiveness. It is not a treatment for skin or scalp conditions.

## Who it fits / who should check with a professional first
Fits: adults who want a simple, low-cost routine that protects skin from sun, keeps it comfortable, and keeps the scalp clean and healthy.

Check with a dermatologist or clinician first:
- Pregnant, trying to conceive, or breastfeeding: do not schedule retinoids (AAD: retinoids should not be used during pregnancy); keep cleanse, moisturize, SPF.
- Eczema, rosacea, psoriasis, very sensitive skin, or active severe acne or acne scarring: keep the routine gentle and suggest a dermatologist before adding a retinoid.
- Any new, changing, bleeding or unusual mole or spot: suggest a dermatologist promptly; do not comment on it.
- Sudden or patchy hair loss, a painful, itchy or scaly scalp, or hair shedding after illness, pregnancy or new medication: suggest a dermatologist; do not label the cause.
- Currently using prescription skin products (tretinoin, isotretinoin, benzoyl peroxide, antibiotics, hydroquinone): follow the prescriber's instructions; do not add an over-the-counter retinoid on top.

## Habit library

### `am_routine` — AM skin routine
- minutes: 2 / 3
- anchor: get_ready (right after the shower or washing up)
- frequency: daily
- tier: core
- why: Clean skin, moisture and daily sunscreen do most of the work; one active on top targets the person's goal.
- how: 1) Gentle cleanse or a water rinse. 2) Your morning serum, if your plan has one. 3) Moisturizer. 4) Broad-spectrum SPF 30+ as the last step.
- conflicts/synergies: Built by the routine builder from the quiz; the same steps every morning.
- source: https://www.aad.org/public/everyday-care/skin-care-basics/care/face-washing-101

### `pm_routine` — PM skin routine
- minutes: 2 / 4
- anchor: wind_down
- frequency: daily
- tier: core
- why: Night is when actives work best, and doing it every night is what shows results.
- how: 1) Cleanse (oil cleanser first if you wore sunscreen). 2) Tonight's treatment, if it's a treatment night. 3) Moisturizer.
- conflicts/synergies: The same steps every night, except a weekly mask night and (some goals) a weekly microneedling night, which replace the active.
- source: https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol

### `spf_reapply` — Reapply SPF outdoors
- minutes: 1 / 2
- anchor: lunch or before an outdoor block (walks, weekend)
- frequency: outdoor days
- tier: medium
- why: Sunscreen wears off; reapply every 2 hours outside and after sweating or swimming.
- how: 1) Reapply SPF 30+ to face, neck and ears. 2) A stick or powder SPF works over makeup.
- source: https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-apply-sunscreen

### `keto_wash` — Ketoconazole shampoo wash
- minutes: 5 / 5
- anchor: get_ready (in the shower)
- frequency: 2x per week
- tier: core
- why: Calms flaking and an oily, itchy scalp; often used alongside hair-thinning care.
- how: 1) Lather ketoconazole shampoo into your scalp. 2) Leave it on 3 to 5 minutes, then rinse. 3) Condition the lengths only.
- source: https://www.aad.org/public/everyday-care/hair-scalp-care/scalp/treat-dandruff

### `scalp_massage` — Scalp massage
- minutes: 4 / 4
- anchor: wind_down
- frequency: daily
- tier: medium
- why: A simple daily habit; small studies link it to thicker-looking hair.
- how: 1) Fingertips or a soft silicone scalp brush. 2) Small circles, front to back, firm but not scratching, for 4 minutes.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC4740347

## What the AI needs to know (intake)
The app asks a fixed 3-question quiz (no free-form intake): main goal (breakouts, fine lines, dark spots, redness, smoother/brighter, dryness, healthy and simple), how the face feels an hour after washing (oily, combination, dry, normal, sensitive), and anything that applies (pregnant/trying/breastfeeding, prescription skin product, eczema or rosacea, already uses retinol or acids, thinning hair, dandruff). The routine is then built deterministically by services/skin_routine.py.

## Scheduling rules
- One AM routine and one PM routine task a day, steps inside. AM right after getting ready; PM in the wind-down.
- The routine is the same every day from day 1: consistency is the point. No phases, no ramp.
- One main active only. Mask night (Sunday) and microneedling night (Wednesday) replace it; never an active on a microneedling night.
- Sensitive or reactive skin: moisturizer goes on before the active (buffered), mineral SPF, no microneedling.
- Pregnant, trying or breastfeeding: no retinoids; azelaic acid, peptides, vitamin C and gentle acids instead.
- Prescription skin product: only the prescribed treatment at night, nothing extra on top.

## Safety and claims
- No looks or attractiveness framing ("glow up", "look younger", "fix your face", rating faces, before/after comparisons). Talk about comfort, protection and skin health.
- Never assess moles, rashes, acne severity, or hair-loss type from photos or descriptions; suggest a dermatologist.
- No prescription products (tretinoin, isotretinoin, minoxidil, finasteride, spironolactone, hydroquinone), injectable peptides, injections, microneedling deeper than an at-home 0.25 mm roller, or DIY peels. Over-the-counter adapalene, ketoconazole shampoo and cosmetic topicals (vitamin C, niacinamide, azelaic acid, AHA/BHA/PHA, peptide serums) are fine. Do not recommend specific brands or percentages beyond "lowest-strength OTC".
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
