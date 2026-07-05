# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** you're two weeks in, so you're still in the irritation/adjustment window. here's what matters right now: **keep the dose low and frequency slow.** the protocol says gradually increase frequency, not jump to daily. at 0.025% you're already below the standard 0.05% start, so stick with whatever frequency you're on (usually 2–3×/week for the first month) and only bump it if your barrier stays intact. **always apply to completely dry skin** — wait 20 min after cleansing. this cuts irritation and improves penetration. pea-sized amount, that's it. **support your barrier now.** use ceramides + panthenol in your moisturizer, skip any exfoliating acids (BHA/AHA) for the first 1–2 weeks, and don't layer azelaic on tretinoin nights yet. **SPF every day, non-negotiable.** UV will undo the work and darken any irritation. what's your current routine look like (cleanser, moisturizer, SPF)? and are you getting any flaking or redness right now?
- products: 2 item(s)
- status=200 latency=10.54s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=941

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in on 0.025%, so your skin is still adapting. jumping to nightly this early usually means unnecessary irritation, peeling, and a compromised barrier — which slows results and makes you want to quit.

the standard play: 2–3×/week for weeks 1–4, then move to every other night around week 4–6 if your skin tolerates it well. once your skin stops flaking and the redness settles, then you can push to nightly if you want. some people stay at every other night indefinitely and still get solid results.

how's your skin responding so far — any flaking, redness, or tight feeling?
- status=200 latency=7.41s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=624

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** grab the cerave moisturizing cream (tub) — that's the heavy hitter for barrier recovery. the pm lotion works too if you want something lighter. both have ceramides which are exactly what you need.

once the barrier stabilizes (usually 5–7 days), you can reintroduce actives slowly. but right now, rest and moisture.
- products: 3 item(s)
- status=200 latency=12.77s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=315
  - [PASS] latency_lt: 12.8s (ceiling 45s)
  - [FAIL] includes_any: none of ['tretinoin', 'retinoid', 'purge', 'adjust'] found
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

