# VIS-02
## turn 0 ('make me a table: 3-day beginner workout split, exercises/sets/reps')
**user:** make me a table: 3-day beginner workout split, exercises/sets/reps
**assistant:** here's a solid 3-day full-body split for beginners with dumbbells (you've got those). hit it mon/wed/fri with a rest day between. compounds first, then isolation.

key rules:
1. **progressive overload**: when you hit 10 reps on all 3 sets with good form, go up 5 lbs next week.
2. **last set close to failure**: rir 0–2 (0–2 reps left in tank). earlier sets rir 2–3.
3. **rest 60–90s** between compound sets, 45–60s for isolation.
4. **post-workout**: eat protein within 60 min of finishing.

take a rest day between sessions. at 3 days/week you're hitting each muscle group once, which is enough for a beginner.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "3-day beginner full-body (dumbbells)",
    "data": {
      "columns": [
        "exercise",
        "sets",
        "reps",
        "notes"
      ],
      "rows": [
        [
          "dumbbell bench press",
          "3",
          "8\u201310",
          "compound, chest/triceps"
        ],
        [
          "dumbbell rows",
          "3",
          "8\u201310",
          "compound, back/biceps"
        ],
        [
          "dumbbell goblet squat",
          "3",
          "10\u201312",
          "compound, legs"
        ],
        [
          "lateral raises",
          "3",
          "12\u201315",
          "shoulders, every session"
        ],
        [
          "face pulls (band)",
          "3",
          "12\u201315",
          "rear delts, every session"
        ],
        [
          "dumbbell curls",
          "2",
          "10\u201312",
          "biceps"
        ],
        [
          "tricep dips (bench)",
          "2",
          "8\u201310",
          "triceps"
        ]
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=14.64s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=612
  - [PASS] latency_lt: 14.6s (ceiling 60s)
  - [PASS] block_present: types present: ['table']
- needs_judge: ['answers_the_question', 'actionability']

