# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're on a good starting dose. at two weeks you might be hitting the "retinization" phase where irritation peaks before your skin adapts. here's what matters now:

1. **frequency**: start at 2–3× per week if you're not already. you can gradually bump to every other night, then nightly, but only if your barrier isn't angry. if you're red, peeling hard, or tight, dial it back.

2. **application**: pea-sized on completely dry skin (wait 20 min after cleansing). this reduces irritation way more than slathering it on damp skin.

3. **barrier support**: your acne will improve, but tretinoin strips your moisture barrier while it works. use a heavy moisturizer (ceramides + hyaluronic acid) right after, and spf 30+ every morning. no negotiation on sunscreen — tretinoin makes you photosensitive.

4. **avoid mixing**: skip acids, vitamin c, and other actives for the first 4–6 weeks. let tretinoin do its job alone.

expect real acne improvement around week 6–8, texture changes around week
5. **the first month is** just your skin learning to tolerate it.

what's your current routine looking like — cleanser, moisturizer, spf?
- products: 1 item(s)
- status=200 latency=13.22s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1130

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in and still in the irritation window. jumping to nightly before your skin adapts will trash your barrier and make you want to quit.

here's the progression:
1. **weeks 1–4**: every other night (you're here)
2. **weeks 5–8**: if no excessive redness/peeling, try 3× per week, then gradually shift to every other night consistently
3. **week 9+**: move to nightly if your skin is stable

the mistake most people make is going too fast. your skin will tolerate nightly eventually, but forcing it now just means more irritation, flaking, and a damaged barrier that takes weeks to recover. slow wins.

if you're already seeing redness or raw patches, even every other night might be too much — drop to 2× per week and rebuild from there.
- status=200 latency=6.89s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=782

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** your barrier is damaged. stop everything except a gentle cleanser and moisturizer for 3-5 days, then rebuild slowly.

here's what to do right now:

1. **cleanser** — wash with something gentle (non-foaming, no actives). lukewarm water, pat dry, don't rub.

2. **moisturizer** — apply to damp skin immediately after. lock in hydration. this is the priority.

3. **skip actives** — pause tretinoin, acids, vitamin c, retinoids, exfoliants. everything. your skin is telling you it's irritated.

4. **spf 30+** — morning only, no negotiation. uv will worsen redness and slow healing.

5. **hydrate internally** — drink water, eat protein. barrier repair happens from inside too.

after 3-5 days of this, the redness should calm. then reintroduce tretinoin slowly: start with once or twice a week instead of nightly. you went too hard too fast at 0.025%.

what cleanser and moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=9.43s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=905
  - [PASS] latency_lt: 9.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'retinoid']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

