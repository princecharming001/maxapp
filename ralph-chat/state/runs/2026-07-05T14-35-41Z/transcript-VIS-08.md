# VIS-08
## turn 0 ('give me the numbers on sleep and muscle growth, bold each stat')
**user:** give me the numbers on sleep and muscle growth, bold each stat
**assistant:** **7–9 hours** nightly for muscle growth and recovery. on training days, add a wind-down cue 60 minutes before bed to hit that window consistently.

that's the protocol number. the evidence doesn't break down specific growth metrics (like "x% more hypertrophy per extra hour") — just the target range and timing rule.
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "7\u20139 hrs",
          "label": "nightly sleep target",
          "hint": "non-negotiable for muscle growth"
        },
        {
          "value": "60 min",
          "label": "wind-down before bed on training days",
          "hint": "helps you hit the 7\u20139 hr window"
        }
      ]
    }
  }
]
```
- status=200 latency=8.89s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=316
  - [PASS] latency_lt: 8.9s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question']

