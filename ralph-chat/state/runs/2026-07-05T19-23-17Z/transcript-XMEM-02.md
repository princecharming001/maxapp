# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** solid move. tretinoin is the real deal for acne because it addresses turnover and inflammation at the cellular level, not just surface stuff. here's how to run it without torching your skin:
1. **start low and go slow.** begin at 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3× per week. your skin needs to build tolerance.
2. **apply to dry skin only.** wet or damp skin increases penetration and irritation risk. let your face fully dry before touching tretinoin.

3. **gradually increase frequency.** after 2–3 weeks at 2–3×/week, move to 4–5×/week if your skin tolerates it. don't jump to daily right away.
4. **pair with a solid barrier.** use a gentle cleanser, then a hydrating moisturizer after tretinoin. your skin will be drier and more sensitive at first. this is normal.

5. **SPF every single day.** tretinoin makes you more photosensitive. non-negotiable. what's your current acne situation like (active breakouts, scars, PIH marks, or combo)? that shapes whether you layer anything else in.
- products: 1 item(s)
- status=200 latency=9.33s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1040

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin, so yes, it's safe to continue. since your derm prescribed it, you're past the "should i start" question. the key is you're on it for acne, not anti-aging, so the protocol is the same: pea-sized amount on dry skin, start low frequency (2–3×/week if you haven't ramped up yet), and increase gradually as your skin tolerates it. don't layer it with other actives (azelaic, BHA, vitamin c) on the same night until your barrier is solid. what's your current frequency and how's your skin responding so far.
- products: 1 item(s)
- status=200 latency=8.58s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=530
  - [PASS] latency_lt: 8.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']

