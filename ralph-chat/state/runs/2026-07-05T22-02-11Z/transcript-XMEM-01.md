# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** two weeks in, you're still in the irritation window. here's what matters right now. **keep the dose low and frequency slow.** you're on 0.025%, which is half the standard start dose of 0.05%. that's actually smart for week 2. don't jump frequency yet. stick with 2–3× per week until you hit week 4–6 without redness or peeling. then you can creep up. **barrier is everything right now.** skip azelaic acid, vitamin c, and any other actives for the next 2 weeks. your skin is in micro-damage mode. use a simple cleanser, then apply tretinoin on completely dry skin (wait 20 min after washing), then seal with ceramides + panthenol moisturizer. that's it. **SPF every day, no exceptions.** UV will undo everything tretinoin does and darken any existing pigment. non-negotiable. sleep matters more than you think right now. deep sleep is when collagen repairs and inflammation resets. aim for 7–9 hours. cortisol from poor sleep slows healing. what's your current redness/peeling level. mild, moderate, or pretty raw.
- products: 2 item(s)
- status=200 latency=8.83s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1014

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** every other night for now. you're only 2 weeks in on 0.025%, so you don't have the tolerance yet to handle nightly dosing without unnecessary irritation. every other night lets your skin adapt without overdoing it. once you hit week 4–6 and you're seeing minimal redness or peeling, you can move to 3× per week, then work toward nightly over the next month or two. the goal isn't speed, it's consistency without blowing out your barrier. slow ramp wins.
- status=200 latency=6.06s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=453

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** peeling + redness usually means your barrier is compromised, likely from the tretinoin. at 2 weeks in on 0.025%, that's pretty normal, but you need to dial back the irritation now or it'll get worse.

here's what to do:

1. **drop tretinoin to 2x per week** for the next 2 weeks. skip the other nights entirely. your skin needs to stabilize before you ramp up frequency.

2. **cleanse gently** — use a non-foaming cleanser (cream or milk texture), lukewarm water only. no scrubbing. if your current cleanser stings, swap it.

3. **moisturize heavily** — apply to damp skin right after cleansing, while it's still slightly wet. this locks in hydration and helps the barrier repair. look for something with ceramides and centella asiatica.

4. **skip all other actives** — no niacinamide, no acids, no vitamin c, nothing. just cleanser, moisturizer, sunscreen for now.

5. **spf 30+ every single morning**, even indoors. uv makes inflammation worse.

the peeling should ease in 5–7 days once you've cut back. redness takes longer (1–2 weeks), but it will calm. once the barrier feels solid again, you can go back to 3x per week with tret, then gradually increase.

what cleanser and moisturizer are you using right now?
- products: 2 item(s)
- status=200 latency=10.48s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1217
  - [PASS] latency_lt: 10.5s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

