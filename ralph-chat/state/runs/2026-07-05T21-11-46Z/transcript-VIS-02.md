# VIS-02
## turn 0 ('make me a table: 3-day beginner workout split, exercises/sets/reps')
**user:** make me a table: 3-day beginner workout split, exercises/sets/reps
**assistant:** here's a solid 3-day full-body split for beginners. each session hits all major movement patterns, keeps volume manageable, and lets you recover properly between days.

**how to run it:**
1. **rest 2** –3 min between compound lifts (squat, bench, row, ohp). rest 60–90 sec on isolation.
2. **pick one variation per** exercise and stick with it for 4–6 weeks before switching.
3. **add weight when you** hit the top of your rep range (10 on squats, 10 on bench, etc.) for two workouts straight.
4. **track every set in** your phone or notebook — if you don't log, you won't progress.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full-body split",
    "data": {
      "columns": [
        "exercise",
        "day 1 (mon)",
        "day 2 (wed)",
        "day 3 (fri)"
      ],
      "rows": [
        [
          "squat or leg press",
          "3\u00d78\u201310",
          "3\u00d78\u201310",
          "3\u00d78\u201310"
        ],
        [
          "horizontal push (bench/db press)",
          "3\u00d78\u201310",
          "\u2014",
          "3\u00d78\u201310"
        ],
        [
          "horizontal pull (bent row)",
          "3\u00d78\u201310",
          "\u2014",
          "3\u00d78\u201310"
        ],
        [
          "vertical push (ohp/machine)",
          "\u2014",
          "3\u00d78\u201310",
          "\u2014"
        ],
        [
          "vertical pull (lat pulldown/assisted pull-up)",
          "\u2014",
          "3\u00d78\u201310",
          "\u2014"
        ],
        [
          "leg curl or rdl",
          "2\u00d710\u201312",
          "2\u00d710\u201312",
          "2\u00d710\u201312"
        ],
        [
          "calf raise (any variation)",
          "2\u00d712\u201315",
          "2\u00d712\u201315",
          "2\u00d712\u201315"
        ],
        [
          "core (plank or cable crunch)",
          "2\u00d78\u201312",
          "2\u00d78\u201312",
          "2\u00d78\u201312"
        ]
      ]
    }
  }
]
```
- status=200 latency=14.36s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=582
  - [PASS] latency_lt: 14.4s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

