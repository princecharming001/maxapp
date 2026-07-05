# VIS-03
## turn 0 ('give me the key stats on tretinoin results — numbers, not paragraphs')
**user:** give me the key stats on tretinoin results — numbers, not paragraphs
**assistant:** key takeaway: tretinoin is slow. you won't see much for 6–8 weeks. the payoff (texture, fine lines, acne) hits hardest at 12+ weeks. consistency matters more than strength at the start.
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
          "label": "visible results appear",
          "hint": "with consistent use"
        },
        {
          "value": "12+ weeks",
          "label": "full results",
          "hint": "several months of regular application"
        },
        {
          "value": "week 1\u20132",
          "label": "early adjustment phase",
          "hint": "minimal visible change expected"
        }
      ]
    }
  }
]
```
- status=200 latency=17.82s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=185
  - [PASS] latency_lt: 17.8s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

