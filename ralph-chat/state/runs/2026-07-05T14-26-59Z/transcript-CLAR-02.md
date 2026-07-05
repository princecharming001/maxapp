# CLAR-02
## turn 0 ('my main skin concern is acne breakouts')
**user:** my main skin concern is acne breakouts
**assistant:** acne is almost always inflammation-driven, not just a surface problem. before you jump to actives, you need to know if your barrier is intact. check for these signs: persistent redness, burning/stinging when you apply products, dryness even after moisturizing, flaky texture, skin feels tight after washing. if you're seeing any of those, your barrier is compromised and treating acne aggressively will backfire. the fix: repair first, then treat. **repair phase** (2-3 weeks minimum):
1. **cleanse gently** — no scrubs, no acids, no actives. just a gentle cleanser AM and PM
2. **moisturize with ceramides + panthenol**, ceramides lock in moisture and strengthen the barrier, panthenol soothes irritation and speeds repair
3. **pause everything else**, no retinoids, no BHA/AHA, no vitamin c if it stings once redness drops, stinging stops, and skin feels less tight, your barrier is healing. then we layer in acne actives (adapalene or azelaic acid depending on severity). but jumping straight to actives while inflamed just deepens the cycle. what does your skin feel like right now. any burning, tightness, or persistent redness.
- products: 2 item(s)
- status=200 latency=12.33s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=1133

## turn 1 ('give me a skincare routine')
**user:** give me a skincare routine
**assistant:** since you said acne breakouts are your main concern, you're oily/acne-prone. here's the structure: **AM:**
1. **cleanse** — daily, consistent but not aggressive
2. **azelaic acid**, the active for acne inflammation
3. **moisturizer**, barrier repair
4. **SPF**, non-negotiable; UV drives post-acne marks **PM:**
5. **cleanse**, remove the day's oil and buildup
6. **retinoid**, the heavy hitter for acne + texture
7. **moisturizer**, critical after retinoid
8. **occlusive (optional)**, if your skin feels tight or irritated the order matters. cleanser first so actives actually reach skin, then azelaic (AM only), then retinoid (PM only). don't stack them on the same night. acne is inflammation-driven, not just surface. azelaic + retinoid + SPF + a non-aggressive cleanse routine will handle that. what's your current cleanser, and do you have azelaic or retinoid on hand already.
- products: 2 item(s)
- status=200 latency=8.03s error=None
- checks:
  - [PASS] choices_absent: choices=[]
  - [PASS] no_friendly_error: clean
  - [PASS] prose_nonempty: len=883
  - [PASS] latency_lt: 8.0s (ceiling 45s)
  - [PASS] includes_any: matched: ['acne', 'breakout']
- needs_judge: ['uses_user_context', 'answers_the_question']

