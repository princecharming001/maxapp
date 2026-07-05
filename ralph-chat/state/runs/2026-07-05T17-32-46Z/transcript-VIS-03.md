# VIS-03
## turn 0 ('what results can i expect from tretinoin? hit me with the key numbers')
**user:** what results can i expect from tretinoin? hit me with the key numbers
**assistant:** here are the key numbers:
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "40\u201360%",
          "label": "acne reduction by week 12",
          "hint": "with consistent use"
        },
        {
          "value": "4\u20136 months",
          "label": "full clearance timeline",
          "hint": "for most users"
        },
        {
          "value": "50\u201370%",
          "label": "post-acne mark fade",
          "hint": "by month 6\u201312"
        }
      ]
    }
  }
]
```
- status=200 latency=20.48s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [FAIL] prose_nonempty: len=25
  - [PASS] latency_lt: 20.5s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

