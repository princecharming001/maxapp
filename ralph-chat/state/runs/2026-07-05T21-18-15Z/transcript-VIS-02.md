# VIS-02
## turn 0 ('give me a 3-day beginner gym split as a table with exercises, sets and reps')
**user:** give me a 3-day beginner gym split as a table with exercises, sets and reps
**assistant:** each session hits all major muscle groups with 10–12 hard sets per muscle per week, spread across three days. stop each set 0–3 reps short of failure. pick the same exercises for 6–8 weeks and add weight when you hit the top of the rep range with good form two sessions in a row.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full body split",
    "data": {
      "columns": [
        "exercise",
        "sets \u00d7 reps",
        "notes"
      ],
      "rows": [
        [
          "monday: full body",
          "",
          ""
        ],
        [
          "low-incline dumbbell press",
          "3 \u00d7 8\u201310",
          "chest priority, control the stretch"
        ],
        [
          "neutral-grip pulldown",
          "3 \u00d7 8\u201310",
          "lat width, depress scapula"
        ],
        [
          "leg press",
          "3 \u00d7 8\u201310",
          "quads, full range"
        ],
        [
          "cable lateral raise",
          "2 \u00d7 10\u201312",
          "side delts, no momentum"
        ],
        [
          "cable pushdown",
          "2 \u00d7 10\u201312",
          "triceps"
        ],
        [
          "",
          "",
          ""
        ],
        [
          "wednesday: full body",
          "",
          ""
        ],
        [
          "incline machine press",
          "3 \u00d7 8\u201310",
          "upper chest, stable shoulder blades"
        ],
        [
          "chest-supported row",
          "3 \u00d7 8\u201310",
          "mid-back thickness, no momentum"
        ],
        [
          "hack squat",
          "3 \u00d7 8\u201310",
          "quads, different angle"
        ],
        [
          "reverse pec deck",
          "2 \u00d7 10\u201312",
          "rear delts, light weight"
        ],
        [
          "preacher curl",
          "2 \u00d7 10\u201312",
          "biceps"
        ],
        [
          "",
          "",
          ""
        ],
        [
          "friday: full body",
          "",
          ""
        ],
        [
          "pec deck",
          "3 \u00d7 10\u201312",
          "mid chest, tension whole time"
        ],
        [
          "cable row",
          "3 \u00d7 8\u201310",
          "back thickness, pause at contraction"
        ],
        [
          "lying leg curl",
          "3 \u00d7 8\u201310",
          "hamstrings, control the stretch"
        ],
        [
          "machine shoulder press",
          "2 \u00d7 8\u201310",
          "front delts"
        ],
        [
          "overhead cable extension",
          "2 \u00d7 10\u201312",
          "triceps long head, arm size"
        ]
      ]
    }
  }
]
```
- status=200 latency=10.53s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=279
  - [PASS] latency_lt: 10.5s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

