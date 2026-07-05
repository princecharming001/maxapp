# XMEM-02
## turn 0 ('my dermatologist put me on tretinoin for my acne')
**user:** my dermatologist put me on tretinoin for my acne
**assistant:** good move. tretinoin is the strongest tool for acne because it addresses the root: it increases cell turnover, unclogs pores, and kills the bacteria environment. start 0.05% on dry skin with a pea-sized amount, then gradually increase frequency as your skin adapts. key things to lock in:
1. **apply to completely dry skin** — wait 20 min after cleansing. tretinoin penetrates deeper on damp skin and causes irritation.
2. **start low frequency**, 2–3x per week for the first 2–4 weeks, then move to nightly once your barrier is stable. irritation early on is normal but means you're going too fast.
3. **use a solid moisturizer after**, something with ceramides (CeraVe, cetaphil) to buffer irritation and support your barrier.
4. **SPF 30+ every morning**, tretinoin makes you photosensitive. non-negotiable. expect a purge (more acne) in weeks 1–3 as dead skin and bacteria surface. that's the drug working, not failing. real improvement shows around week 6–8. what's your current AM/PM routine look like. do you have a moisturizer and SPF dialed in yet.
- products: 1 item(s)
- status=200 latency=9.76s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1057

## turn 0 ('is it safe to add a retinoid to my routine?')
**user:** is it safe to add a retinoid to my routine?
**assistant:** you're already on tretinoin per your dermatologist, so yes, it's safe to continue. the question is whether you're using it right for acne. since you're on tretinoin for acne (not anti-aging), your routine should be: cleanse, let skin dry fully, apply pea-sized amount to dry skin, then moisturize after it sets. don't layer other actives (like azelaic or BHA) on the same night until your skin adapts, usually 4-6 weeks in. once you're tolerating it well, you can add azelaic acid 2-3x/week in the AM to boost acne clearance. the main safety move: if you get persistent redness, burning, or peeling that doesn't settle after 2 weeks, dial back frequency (use it every other night instead of nightly) rather than stopping. tretinoin works best when you stick with it consistently.
- products: 1 item(s)
- status=200 latency=8.1s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=779
  - [PASS] latency_lt: 8.1s (ceiling 45s)
  - [PASS] includes_any: matched: ['already', "you're on", 'tretinoin']
- needs_judge: ['uses_user_context']

