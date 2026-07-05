# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** based on clinical data, here are the key tretinoin stats:

key takeaway: tretinoin beats placebo hard on wrinkles and texture, but you're looking at 3 months minimum before you see real change. the first 8–12 weeks are rough (dryness, peeling, irritation) before your skin adapts.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "12\u201324 weeks",
          "label": "time to visible improvement",
          "hint": "fine lines, texture"
        },
        {
          "value": "40\u201350%",
          "label": "fine wrinkle reduction",
          "hint": "vs. 10\u201320% placebo"
        },
        {
          "value": "60\u201370%",
          "label": "improvement in skin texture",
          "hint": "acne scars, roughness"
        },
        {
          "value": "8\u201312 weeks",
          "label": "retinization complete",
          "hint": "adjustment period, side effects peak"
        },
        {
          "value": "80%+",
          "label": "efficacy in acne",
          "hint": "moderate to severe"
        },
        {
          "value": "0.025\u20130.1%",
          "label": "typical starting strength",
          "hint": "0.025% for beginners, titrate up"
        }
      ]
    }
  }
]
```
- status=200 latency=14.69s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 6 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=280
  - [PASS] latency_lt: 14.7s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

