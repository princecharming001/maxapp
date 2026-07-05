# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** key takeaway: tretinoin works, but you need 3+ months to judge it. the first month is rough (peeling, sensitivity) — that's normal. if you're oily, you'll tolerate it better than dry skin types.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "8\u201312 weeks",
          "label": "first visible improvement",
          "hint": "fine lines, texture"
        },
        {
          "value": "3\u20136 months",
          "label": "significant results",
          "hint": "wrinkles, hyperpigmentation"
        },
        {
          "value": "70\u201380%",
          "label": "efficacy rate",
          "hint": "clinical improvement in photoaging"
        },
        {
          "value": "2\u20134 weeks",
          "label": "retinization period",
          "hint": "irritation/peeling before adaptation"
        },
        {
          "value": "60%+",
          "label": "acne improvement",
          "hint": "by 12 weeks in most studies"
        },
        {
          "value": "0.025\u20130.1%",
          "label": "standard dose range",
          "hint": "start low, titrate up"
        }
      ]
    }
  }
]
```
- status=200 latency=13.76s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 6 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=194
  - [PASS] latency_lt: 13.8s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

