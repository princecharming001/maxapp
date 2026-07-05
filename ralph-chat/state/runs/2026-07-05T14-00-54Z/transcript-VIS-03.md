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
          "value": "58.5%",
          "label": "inflammatory lesion reduction at 12 weeks",
          "hint": "tretinoin 0.05%"
        },
        {
          "value": "55.5%",
          "label": "noninflammatory lesion reduction at 12 weeks",
          "hint": "tretinoin 0.05%"
        },
        {
          "value": "8 weeks",
          "label": "typical time to visible improvement",
          "hint": "depends on starting dose and frequency"
        },
        {
          "value": "20\u201330%",
          "label": "improvement by week 4",
          "hint": "varies by severity"
        }
      ]
    }
  }
]
```
- status=200 latency=16.57s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [FAIL] prose_nonempty: len=0
  - [PASS] latency_lt: 16.6s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

