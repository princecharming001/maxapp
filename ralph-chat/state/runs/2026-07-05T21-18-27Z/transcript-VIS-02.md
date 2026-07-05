# VIS-02
## turn 0 ('give me a 3-day beginner gym split as a table with exercises, sets and reps')
**user:** give me a 3-day beginner gym split as a table with exercises, sets and reps
**assistant:** here's a 3-day full body split for beginners. each day hits all major muscle groups with compound lifts first, then isolation work. train mon/wed/fri with rest days between to let muscles recover. aim for 0–3 reps in reserve on your working sets — that's where the growth signal lives. pick weights you can control all the way to the last rep. if form breaks down, drop the weight and rebuild.  **how to run it:**
1. **do day 1 mon** day 2 wed, day 3 fri. repeat the same day each week for 6–8 weeks before rotating exercises.
2. **log every set** . add weight when you hit the top of your rep range with clean form two sessions in a row.
3. **rest 60** –90 sec between compound sets, 45–60 sec between isolation work.
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
          "barbell back squat",
          "3",
          "6\u20138",
          "compound; start here when fresh"
        ],
        [
          "incline dumbbell press",
          "3",
          "8\u201310",
          "upper chest priority"
        ],
        [
          "neutral-grip pulldown",
          "3",
          "8\u201310",
          "lat width; control the stretch"
        ],
        [
          "cable lateral raise",
          "2",
          "10\u201312",
          "side delts; light weight, no momentum"
        ],
        [
          "lying leg curl",
          "2",
          "10\u201312",
          "hamstring isolation"
        ],
        [
          "cable pushdown",
          "2",
          "10\u201312",
          "triceps; control the negative"
        ],
        [
          "preacher curl",
          "2",
          "8\u201310",
          "biceps; full range"
        ],
        [
          "chest-supported row",
          "3",
          "8\u201310",
          "mid-back thickness; no momentum"
        ],
        [
          "leg press",
          "3",
          "8\u201310",
          "quad volume; full range"
        ],
        [
          "reverse pec deck",
          "2",
          "10\u201312",
          "rear delts; light, elbows lead"
        ],
        [
          "cable crunch",
          "2",
          "12\u201315",
          "core; light weight only"
        ],
        [
          "standing calf raise",
          "3",
          "12\u201315",
          "heavy intent; full stretch"
        ]
      ]
    }
  }
]
```
- status=200 latency=17.52s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=718
  - [PASS] latency_lt: 17.5s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

