# VIS-02
## turn 0 ('give me a 3-day beginner gym split as a table with exercises, sets and reps')
**user:** give me a 3-day beginner gym split as a table with exercises, sets and reps
**assistant:** you're a beginner, so full body 3x/week is your best move. hits each muscle often enough to learn the lifts and build consistency without needing fancy recovery management. here's your split:  run this same workout all three days (mon/wed/fri). each muscle gets hit 3x/week, which is ideal for a beginner learning movement patterns. stop each set 0–3 reps short of failure — that's where the growth signal lives. don't chase burnout sets; form and consistency beat ego weight every time. track your lifts in a notes app. when you hit the top of your rep range (e.g., 10 reps on all 3 sets) for two sessions in a row, add weight next time. that's your only progression rule.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full body split",
    "data": {
      "columns": [
        "exercise",
        "sets",
        "reps",
        "notes"
      ],
      "rows": [
        [
          "incline dumbbell press",
          "3",
          "8\u201310",
          "chest priority, low incline 15\u201330\u00b0"
        ],
        [
          "chest-supported row",
          "3",
          "8\u201310",
          "mid-back thickness, no momentum"
        ],
        [
          "leg press or hack squat",
          "3",
          "8\u201310",
          "quads, control the bottom"
        ],
        [
          "lying leg curl",
          "2",
          "10\u201312",
          "hamstrings, full stretch"
        ],
        [
          "cable lateral raise",
          "2",
          "12\u201315",
          "side delts, lead with elbows"
        ],
        [
          "cable pushdown",
          "2",
          "10\u201312",
          "triceps, control the negative"
        ],
        [
          "preacher curl",
          "2",
          "10\u201312",
          "biceps, full range"
        ],
        [
          "standing calf raise",
          "2",
          "12\u201315",
          "heavy, slow tempo"
        ]
      ]
    }
  }
]
```
- status=200 latency=12.0s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=673
  - [PASS] latency_lt: 12.0s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

