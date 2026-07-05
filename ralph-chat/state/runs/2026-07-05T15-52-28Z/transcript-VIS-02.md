# VIS-02
## turn 0 ('make me a table: 3-day beginner workout split, exercises/sets/reps')
**user:** make me a table: 3-day beginner workout split, exercises/sets/reps
**assistant:** here's a solid 3-day full-body split for beginners. each workout hits all major muscle groups with compound lifts first, isolation after. train mon/wed/fri with rest days in between.

**key rules:**
1. **all three days are** identical. this gives you high frequency per muscle and lets you track progress session to session.
2. **rest 2** –3 min on heavy compounds (bench, rows, squats, press), 60–90 sec on isolation.
3. **add 2** .5–5 lb when you hit the top of the rep range with good form for two straight sessions.
4. **last set of compounds should feel hard (rir 0–2**: could do 0–2 more reps if you pushed).
5. **log every workout in** your phone or notebook — if you don't track, you won't progress.

you've got a barbell, so you're set. this works.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full-body split",
    "data": {
      "columns": [
        "exercise",
        "sets",
        "reps",
        "notes"
      ],
      "rows": [
        [
          "**day 1 (mon) / day 2 (wed) / day 3 (fri)**",
          "",
          "",
          ""
        ],
        [
          "barbell bench press",
          "3",
          "5\u20138",
          "main compound, rest 2-3 min"
        ],
        [
          "barbell rows (pendlay or bent-over)",
          "3",
          "5\u20138",
          "alternate with bench, same intensity"
        ],
        [
          "barbell squats",
          "3",
          "6\u201310",
          "drive through heels, full depth"
        ],
        [
          "overhead press",
          "2",
          "6\u20138",
          "strict form, no leg drive"
        ],
        [
          "lat pulldown or assisted pull-up",
          "2",
          "8\u201310",
          "full stretch at bottom"
        ],
        [
          "dumbbell curls",
          "2",
          "8\u201310",
          "control the weight"
        ],
        [
          "tricep pushdowns",
          "2",
          "10\u201312",
          "lighter, high reps"
        ],
        [
          "face pulls",
          "2",
          "12\u201315",
          "every session, rear delt health"
        ],
        [
          "leg curl or hamstring curl",
          "2",
          "10\u201312",
          "balance quads"
        ],
        [
          "lateral raises",
          "2",
          "12\u201315",
          "every session, shoulder width"
        ]
      ]
    }
  }
]
```
- status=200 latency=17.33s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=757
  - [PASS] latency_lt: 17.3s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

