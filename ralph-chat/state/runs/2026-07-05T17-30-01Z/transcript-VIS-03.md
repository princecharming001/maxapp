# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** 
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
          "label": "first visible texture change",
          "hint": "subtle smoothing"
        },
        {
          "value": "8\u201312 weeks",
          "label": "acne improvement",
          "hint": "reduced breakouts, faster healing"
        },
        {
          "value": "12 weeks",
          "label": "pih/melasma fading starts",
          "hint": "hyperpigmentation begins to lighten"
        },
        {
          "value": "6 months",
          "label": "cumulative wrinkle & collagen gains",
          "hint": "significant texture refinement"
        },
        {
          "value": "12 months",
          "label": "maximum tretinoin benefits",
          "hint": "plateau reached for most users"
        }
      ]
    }
  }
]
```
- status=200 latency=13.96s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: block[0] [stat_cards] 5 cards, mobile only renders the first 4 (cards.slice(0,4))
  - [PASS] no_tech_leak: clean
  - [FAIL] prose_nonempty: len=0
  - [PASS] latency_lt: 14.0s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

