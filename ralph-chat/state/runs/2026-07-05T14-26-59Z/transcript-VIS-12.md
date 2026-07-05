# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** you're starting from zero, so the priority is barrier repair first, then one active. here's the full breakdown. **the core principle:** most beginners stack too much too fast. you need a clean base (cleanser + moisturizer + SPF), let your barrier stabilize for 2–4 weeks, then add one active. that's it.     **what to avoid from day 1:** over-exfoliating, stacking actives, skipping SPF, ignoring the barrier. the barrier controls hydration, irritation, and whether products even work. when it's damaged, everything gets worse. ceramides and panthenol are your repair tools. **at week 5, pick your active:** if you have acne, start with azelaic or a low-dose retinoid. if you're anti-aging focused, retinoid. not both. start 2x per week and titrate up only if skin tolerates it. your wake time is 7am, so AM routine takes 5 min (cleanser, moisturizer, SPF). PM is the same, plus the active starting week 5. no excuses for skipping SPF.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "4 weeks",
          "label": "minimum barrier repair time before adding actives",
          "hint": "most people skip this and regret it"
        },
        {
          "value": "1",
          "label": "active per routine (not stacked)",
          "hint": "retinoid OR azelaic, never both at once"
        },
        {
          "value": "SPF 30+",
          "label": "non-negotiable every AM",
          "hint": "UV damage compounds over time; prevents pigmentation and collagen breakdown"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=24.36s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=935
  - [PASS] latency_lt: 24.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

