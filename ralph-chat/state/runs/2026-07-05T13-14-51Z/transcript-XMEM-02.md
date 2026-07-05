# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** good move. tretinoin is the real driver here. here's how to run it without torching your skin. **start low and go slow.** apply 0.05% on completely dry skin (wait 20 min after cleansing), pea-sized amount, 2–3× per week for the first 2–3 weeks. your skin will purge and flake. that's normal. don't panic and jump to every night. **timing matters.** never use it on the same night as any physical exfoliation (dermarolling, dermastamping). if you're doing those, space them 3+ days apart. **barrier support is non-negotiable.** tretinoin thins the skin short-term while it rebuilds collagen. use a heavy moisturizer after it dries (CeraVe or cetaphil), and SPF 30+ every morning. sun exposure while on tret will cause hyperpigmentation and undo your acne work. once your skin adapts (usually 4–6 weeks), you can bump to 4–5× per week, then eventually nightly. but rushing it causes irritation, barrier damage, and people bail. stick with the slow ramp. what's your current AM/PM routine look like. do you have a cleanser and moisturizer dialed in yet.
- products: 1 item(s)
- status=200 latency=14.16s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1050

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your derm, so yes, it's safe to keep using it. the question is whether you're layering anything else that'll cause irritation. since you're on tretinoin, skip other retinoids (adapalene, retinol, etc.) and don't pair it with vitamin c or frequent acids in the same routine. retinoid goes PM, cleanser first, then apply on dry skin. keep it simple while your skin adjusts. what's your current PM routine look like. are you using anything else active (BHA, AHA, azelaic).
- products: 2 item(s)
- status=200 latency=7.6s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=501
  - [PASS] latency_lt: 7.6s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']

