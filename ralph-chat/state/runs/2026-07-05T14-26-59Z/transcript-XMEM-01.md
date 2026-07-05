# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** since your skin concern is texture, tretinoin's a solid pick—it'll smooth that out over time. at 0.025%, you're on the gentler end, which is smart for a beginner.

key things for the next 4-6 weeks:
1. **buffer method** if you're getting irritated: apply moisturizer to clean, damp skin first, then tretinoin on top. cuts irritation without killing efficacy.
2. **frequency**: stick to 2-3x per week for now. don't jump to daily until your skin stops complaining (usually 6-8 weeks).
3. **sunscreen**: non-negotiable. spf 30+ every morning, even on days you don't use tret. your skin's more photosensitive now.

what's your current routine looking like—cleanser, moisturizer, spf?
- products: 1 item(s)
- status=200 latency=11.67s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=680

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only two weeks in and on 0.025%, so you don't need daily yet.

most people hit a rough patch around week 3-4 (peeling, redness, dryness). every-other-night gives your skin time to adapt without pushing it into full irritation mode. you can bump to 3x per week after 4-6 weeks if your skin's handling it well, then eventually daily—but that takes 8-12 weeks total.

if you're already peeling or red, dial it back to 2x per week. texture takes time anyway.
- status=200 latency=6.32s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=488

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** sounds like your barrier is compromised, probably from the tret. when you're 2 weeks in on 0.025% and seeing peeling + redness together, that's normal adjustment but you need to dial back the irritation drivers right now.

here's what to do:

1. **pause the tretinoin for 3–5 days** to let your skin calm. you're not quitting it, just giving the barrier breathing room. this isn't failure, it's protocol.

2. **simplify to three steps only:**
3. **cleanser**: something gentle, no actives. cerave hydrating cleanser or la roche-posay toleriane are solid for barrier repair.
4. moisturizer: apply to damp skin immediately after cleansing. look for ceramides + niacinamide to patch the barrier back.
5. **sunscreen**: spf 30+ every morning, no exceptions. uv stress makes redness worse.

6. **skip everything else** — no exfoliants, no acids, no vitamin c, no other actives. your skin is telling you it's overwhelmed.

7. **when you restart tret**, go back to 0.025% but use it only **2–3 nights per week** for the next 2 weeks, then increase frequency if the peeling settles. you can always go faster later, but rushing now just delays progress.

8. **cut inflammatory foods** for the next week: seed oils, sugar, alcohol. eat protein, whole foods, drink water. internal inflammation + external irritation = the redness lingers.

the peeling will stop once your barrier heals. the redness should fade in 5–7 days. you're not set back, you're just recalibrating. text me in a week and let me know how it looks.
- products: 5 item(s)
- status=200 latency=12.93s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1508
  - [PASS] latency_lt: 12.9s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

