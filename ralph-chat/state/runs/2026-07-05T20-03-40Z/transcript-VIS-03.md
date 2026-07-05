# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** don't see specific outcome numbers in your current docs — they focus on protocol (0.05% tretinoin, pea-sized, dry skin application) and mechanism (stimulates fibroblasts, increases collagen turnover) rather than timelines or percentage improvements. here's what the general clinical standard is:  the protocol in your docs is start 0.05%, pea-sized on dry skin, gradually increase frequency. that's the lever , consistency and slow titration matter more than the absolute dose.
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
          "label": "visible texture/fine line improvement",
          "hint": "consistent nightly use"
        },
        {
          "value": "12\u201316 weeks",
          "label": "significant collagen remodeling",
          "hint": "skin firmness, elasticity gains"
        },
        {
          "value": "20\u201324 weeks",
          "label": "pigmentation fade, scar depth reduction",
          "hint": "full cellular turnover cycles"
        },
        {
          "value": "0.025\u20130.1%",
          "label": "typical tretinoin range",
          "hint": "start low, titrate up as tolerated"
        },
        {
          "value": "3\u20135 months",
          "label": "plateau for most users",
          "hint": "after which gains slow unless you increase strength"
        }
      ]
    }
  }
]
```
- status=200 latency=11.98s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=477
  - [PASS] latency_lt: 12.0s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

