# XMEM-01
## turn 0 ('i started tretinoin 0.025% two weeks ago')
**user:** i started tretinoin 0.025% two weeks ago
**assistant:** also—you've got no skinmax schedule running yet. once i know how your skin's handling the tret, we can build you a routine that works with it instead of against it.
- status=200 latency=9.13s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=164

## turn 1 ('should i apply it every night or every other night')
**user:** should i apply it every night or every other night
**assistant:** at 0.025% and only two weeks in, every other night is the safer move. your skin's still adapting—you'll see irritation, flaking, maybe some redness spike before it settles. pushing to nightly too fast just extends that rough phase and tanks compliance.

after 4–6 weeks, if you're tolerating it well (minimal irritation, skin barrier holding), shift to nightly. but right now, every other night lets your skin build tolerance without unnecessary damage.

also: make sure you're using a solid moisturizer on non-tret nights and even on tret nights (wait 20 min after applying tret, then moisturize). that's the real difference between "tret works great" and "tret destroyed my skin."

what's your current routine looking like around the tret?
- products: 1 item(s)
- status=200 latency=6.81s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=741

## turn 0 ('my skin is peeling and red, what do i do')
**user:** my skin is peeling and red, what do i do
**assistant:** you're likely dealing with barrier damage from the tretinoin. at 2 weeks in on 0.025%, your skin is still adjusting and peeling + redness is normal, but you need to dial back irritation right now.

here's what to do:

1. **cut tretinoin frequency** — drop to 2–3× per week instead of nightly. let your barrier catch up before ramping back up. skip it if your skin feels raw.

2. **simplify your routine** — cleanser, moisturizer, spf. nothing else. no actives, no exfoliants, no vitamin c, no acids. your skin can't handle it right now.

3. **moisturize aggressively** — apply to damp skin right after cleansing, then seal with an occlusive (cerave moisturizing cream, cetaphil, or even a light oil like squalane). barrier repair takes hydration + occlusion.

4. **spf every morning** — tretinoin makes you photosensitive. uv exposure will make redness and peeling worse and slow healing.

5. **skip hot showers** — warm water only, pat dry gently, no rubbing.

the peeling should ease in 1–2 weeks once you lower frequency. redness will take longer (3–4 weeks) as the barrier repairs. once it settles, you can gradually work back up to nightly dosing if you want.

how's your moisturizer right now — what are you using?
- products: 2 item(s)
- status=200 latency=10.1s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1220
  - [PASS] latency_lt: 10.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['tretinoin', 'adjust']
  - [PASS] no_reask: no re-ask
- needs_judge: ['uses_user_context', 'answers_the_question']

