# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** good move. tretinoin is the core driver here, so nail the application first. **start 0.05%, apply to completely dry skin (wait 20 min after cleansing), pea-sized amount.** begin 2–3× per week and gradually increase frequency as your skin adapts. this prevents irritation and barrier damage. a few things to stack with it:
1. **keep your cleanser and moisturizer simple and gentle.** tretinoin creates controlled micro-injury to stimulate collagen, so you don't want to add extra stress with actives or harsh products. barrier support matters more than you think right now.
2. **spf every single day.** tretinoin increases cell turnover and sun sensitivity. no negotiation.
3. **skip other exfoliants** (BHA, AHA, vitamin c) while you're ramping up. tretinoin is doing the work. what's your current routine look like. do you have a gentle cleanser and moisturizer already, or do you need to swap anything out.
- products: 1 item(s)
- status=200 latency=13.77s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=908

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the question is how you're layering it. since you're on tretinoin (a prescription retinoid), you don't need to add another retinoid. what matters is your cleanser, moisturizer, and whether you're using other actives that might compete or irritate. if your skin is handling tretinoin well (no excessive peeling, redness, or sensitivity), you can keep the routine simple: cleanser → tretinoin PM on dry skin → moisturizer. if you're seeing irritation, dial back frequency or add a calming step like centella before moisturizing. what does your current PM routine look like. are you seeing any irritation or flaking.
- products: 1 item(s)
- status=200 latency=6.39s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=696
  - [PASS] latency_lt: 6.4s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']

