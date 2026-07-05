# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're still in the irritation window. expect some dryness, mild flaking, maybe slight redness for another 1–2 weeks. that's normal and means it's working. key moves right now:
1. **keep the dose steady at 0.025%** — don't jump to 0.05% yet. your skin needs to acclimate first. apply pea-sized on completely dry skin (wait 20 min after cleansing), 2–3× per week for now.
2. **barrier support is non-negotiable**, ceramides + panthenol after tretinoin, every single night. this cuts irritation and keeps you compliant.

3. **skip acids, scrubs, vitamin c for the next 1–2 weeks.** they stack irritation. once you're past week 4, you can layer azelaic acid 10–20% on alternate nights (never same night as tret).
4. **SPF every day, no exceptions.** tretinoin makes skin photosensitive.

UV will undo your progress and darken any existing pigmentation.
5. **sleep matters.** collagen repairs during deep sleep, inflammation resets, pigmentation fades faster. aim for your normal 23:00–07:00 window consistently. you're on track. stick with it.
- products: 2 item(s)
- status=200 latency=10.29s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1054

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for the next 2–3 weeks, then reassess.

you're only two weeks in. if you jump to nightly now, irritation will spike and you'll either bail or damage your barrier. the sweet spot for a beginner on 0.025% is: week 1–3 = every other night (or 2–3× per week), week 4–6 = every other night consistently, week 7+ = nightly if your skin tolerates it.

watch for signs you're ready to increase: no flaking, no raw patches, skin feels stable. if you're still peeling or red after week 3, stay at every-other-night longer. slow wins here.
- status=200 latency=8.02s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=546

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling and redness usually means your barrier is damaged, most likely from the tretinoin you started two weeks ago. that's normal early on, but you need to dial it back or you'll make it worse.

here's what to do right now:

1. **drop the tretinoin frequency** — go from every night to every other night, or even 2–3x per week if it's severe. you can ramp back up once the redness settles (usually 4–6 weeks in).

2. **simplify your routine** — cleanser, moisturizer, sunscreen. nothing else. no acids, no vitamin c, no actives. your skin is inflamed and needs to heal, not be treated.

3. **moisturize twice daily** — apply while skin is still damp after cleansing to lock in hydration. a good barrier repair moisturizer helps fast.

4. **spf 30+ every morning** — tretinoin makes skin photosensitive. missing sunscreen will worsen redness and cause permanent damage.

5. **avoid heat, fragrance, and irritants** — hot showers, scented products, and rubbing will aggravate it.

the peeling and redness should calm down in 1–2 weeks once you reduce frequency. if it gets worse or doesn't improve, pause tretinoin entirely for a few days and reassess.

want me to surface a barrier repair moisturizer and sunscreen for you?
- products: 1 item(s)
- status=200 latency=11.39s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1223
  - [PASS] latency_lt: 11.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

