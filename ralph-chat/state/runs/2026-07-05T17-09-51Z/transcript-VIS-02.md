# VIS-02
## turn 0 ('make me a table: 3-day beginner workout split, exercises/sets/reps')
**user:** make me a table: 3-day beginner workout split, exercises/sets/reps
**assistant:** 3-day full body is ideal for a beginner — high frequency per muscle, easy recovery, and you learn movement patterns faster. here's your split:

**key rules:**
1. **rest 2** –3 min between compound lifts (bench, squat, deadlift, rows), 60–90 sec on isolation.
2. **add weight when you** hit the top of your rep range with clean form for two sessions straight.
3. **log every workout** — if you don't track, you don't progress.
4. **eat in a slight** surplus (200–300 cal above maintenance) to fuel muscle gain.
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
          "**day 1 (mon)**",
          "",
          "",
          ""
        ],
        [
          "barbell bench press",
          "3\u20134",
          "6\u20138",
          "compound. rir 0-2 on last set."
        ],
        [
          "barbell rows",
          "3\u20134",
          "6\u20138",
          "compound. match bench volume."
        ],
        [
          "incline dumbbell press",
          "2\u20133",
          "8\u201310",
          "secondary pressing."
        ],
        [
          "lat pulldown or assisted pull-up",
          "2\u20133",
          "8\u201310",
          "secondary pulling."
        ],
        [
          "lateral raise",
          "2\u20133",
          "10\u201312",
          "shoulder width. every session."
        ],
        [
          "face pull",
          "2\u20133",
          "12\u201315",
          "rear delt health."
        ],
        [
          "**day 2 (wed)**",
          "",
          "",
          ""
        ],
        [
          "barbell deadlift",
          "2\u20133",
          "3\u20135",
          "heavy, low reps. true compound."
        ],
        [
          "barbell squat",
          "3\u20134",
          "6\u20138",
          "legs, quads, glutes."
        ],
        [
          "leg curl",
          "2\u20133",
          "8\u201310",
          "hamstring balance."
        ],
        [
          "chest fly or cable fly",
          "2\u20133",
          "10\u201312",
          "isolation press stimulus."
        ],
        [
          "barbell curl",
          "2\u20133",
          "8\u201310",
          "biceps."
        ],
        [
          "lateral raise",
          "2\u20133",
          "10\u201312",
          "shoulder width. every session."
        ],
        [
          "face pull",
          "2\u20133",
          "12\u201315",
          "rear delt health."
        ],
        [
          "**day 3 (fri)**",
          "",
          "",
          ""
        ],
        [
          "incline barbell bench",
          "3\u20134",
          "6\u20138",
          "compound. upper chest priority."
        ],
        [
          "pendlay rows or barbell rows",
          "3\u20134",
          "6\u20138",
          "heavy row variation."
        ],
        [
          "leg press",
          "3\u20134",
          "8\u201310",
          "quad volume, easier recovery than squat."
        ],
        [
          "dumbbell flye",
          "2\u20133",
          "10\u201312",
          "chest isolation."
        ],
        [
          "tricep rope pushdown",
          "2\u20133",
          "10\u201312",
          "triceps."
        ],
        [
          "lateral raise",
          "2\u20133",
          "10\u201312",
          "shoulder width. every session."
        ],
        [
          "face pull",
          "2\u20133",
          "12\u201315",
          "rear delt health."
        ]
      ]
    }
  }
]
```
- status=200 latency=20.89s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=509
  - [PASS] latency_lt: 20.9s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

