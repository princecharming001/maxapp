# VIS-02
## turn 0 ('give me a 3-day beginner gym split as a table with exercises, sets and reps')
**user:** give me a 3-day beginner gym split as a table with exercises, sets and reps
**assistant:** here's a 3-day full body split for beginners. each day hits all major muscle groups with compound lifts first, then isolation work. train mon/wed/fri with rest days between for recovery. the rep ranges and set counts follow the evidence: compounds at 6–8 reps (closer to failure), isolation at 8–12 reps, staying 0–3 reps short of failure on each set. this gives you roughly 10–12 hard sets per muscle per week, which is the sweet spot for growth as a beginner.  **key points:**
1. **rest 2** –3 min between compound sets, 60–90 sec between isolation. stop each set 0–3 reps short of failure.
2. **add weight when you** hit the top of your rep range with clean form for two sessions in a row.
3. **log every session** . if you don't track, you won't progress.
4. **each muscle gets hit** 3x per week across the three days, which is ideal for beginners learning movement patterns.
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
          "**day 1 (mon) \u2014 full body**",
          "",
          "",
          ""
        ],
        [
          "barbell bench press",
          "3",
          "6\u20138",
          "compound, chest priority"
        ],
        [
          "barbell rows",
          "3",
          "6\u20138",
          "compound, back thickness"
        ],
        [
          "leg press",
          "3",
          "8\u201310",
          "compound, quads"
        ],
        [
          "incline dumbbell press",
          "2",
          "8\u201310",
          "upper chest isolation"
        ],
        [
          "lat pulldown (neutral grip)",
          "2",
          "8\u201310",
          "lat width"
        ],
        [
          "lying leg curl",
          "2",
          "10\u201312",
          "hamstring isolation"
        ],
        [
          "",
          "",
          "",
          ""
        ],
        [
          "**day 2 (wed) , full body**",
          "",
          "",
          ""
        ],
        [
          "incline barbell press",
          "3",
          "6\u20138",
          "compound, upper chest"
        ],
        [
          "chest-supported row",
          "3",
          "6\u20138",
          "compound, mid-back"
        ],
        [
          "hack squat",
          "3",
          "8\u201310",
          "compound, quads"
        ],
        [
          "cable lateral raise",
          "2",
          "10\u201312",
          "side delts (high ROI)"
        ],
        [
          "cable row",
          "2",
          "8\u201310",
          "back thickness"
        ],
        [
          "leg extension",
          "2",
          "10\u201312",
          "quad isolation"
        ],
        [
          "",
          "",
          "",
          ""
        ],
        [
          "**day 3 (fri) , full body**",
          "",
          "",
          ""
        ],
        [
          "dumbbell bench press",
          "3",
          "8\u201310",
          "compound, chest"
        ],
        [
          "pull-ups or lat pulldown",
          "3",
          "6\u20138",
          "compound, back width"
        ],
        [
          "bulgarian split squat",
          "3",
          "8\u201310",
          "compound, glutes + quads"
        ],
        [
          "pec deck",
          "2",
          "10\u201312",
          "chest isolation"
        ],
        [
          "reverse pec deck",
          "2",
          "10\u201312",
          "rear delts"
        ],
        [
          "cable pushdown",
          "2",
          "10\u201312",
          "triceps"
        ]
      ]
    }
  }
]
```
- status=200 latency=26.2s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=879
  - [PASS] latency_lt: 26.2s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

