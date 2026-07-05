# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a product problem. before you jump to actives, you need to know if your barrier is intact. **check your barrier first.** if you're seeing persistent redness, burning when you apply products, dryness even after moisturizing, or sudden breakouts after trying new stuff, your barrier is compromised and treating acne will backfire. the fix: repair → reduce inflammation → then introduce actives. **for repair right now:**
1. **ceramides** to lock in moisture and strengthen the barrier
2. **panthenol (vitamin B5)** to soothe irritation and speed repair
3. **pause exfoliating acids** retinoids, vitamin c if you're irritated once redness and irritation drop, acne treatment becomes way more effective. what does your skin feel like right now—tight after washing, stinging with products, or pretty normal?
- status=200 latency=10.57s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=854

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since your main concern is acne breakouts, you need a routine built around controlling inflammation and supporting your barrier. here's the structure:
1. **AM cleanse** — wash with a gentle cleanser daily. follow with azelaic acid, which tackles both active acne and post-acne marks.
2. **AM treatment + protection**, layer a hydrating serum (hyaluronic acid or peptides) to support barrier repair, then moisturizer with ceramides, then SPF.

3. **PM cleanse**, same gentle cleanser, daily.
4. **PM active**, retinoid at night. this controls oil production (which drives acne via IGF-1) and fixes texture over time. start low frequency (2–3x per week) if your barrier is still compromised.

5. **PM support**, after retinoid, layer a treatment serum (centella or panthenol to calm), hydrating serum, then moisturizer. optional: light occlusive (cicaplast) if you're still dry. **key point:** acne is inflammation-driven, not just a product problem. the routine above assumes your barrier is intact. if you're still seeing burning or persistent redness, dial back the retinoid frequency and focus on hydration + ceramides first before adding more actives.
- products: 2 item(s)
- status=200 latency=9.24s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1154
  - [PASS] latency_lt: 9.2s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']

