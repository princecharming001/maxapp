# VIS-04
## turn 0 ('give me an 8-week minoxidil timeline, week by week')
**user:** give me an 8-week minoxidil timeline, week by week
**assistant:** evidence is thin on minoxidil timeline specifics. here's what the docs say plus standard protocol: minoxidil takes 3–4 months minimum to show results, so an 8-week timeline will mostly be consistency-building and early response prep. the goal is daily application without missing doses.  key: minoxidil only works if you use it every day. missing doses resets progress. if you're also on finasteride, that combo is the evidence-backed stack.
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "8-week minoxidil timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "apply 1ml topical minoxidil (liquid or foam) to dry scalp, AM and PM. no styling products immediately after.  let it dry fully (3\u20135 min). track adherence, establish routine.  expect no visible change yet."
        },
        {
          "label": "week 3\u20134: consistency check",
          "detail": "continue 2x daily application. scalp may feel slightly tighter or drier.  if irritation occurs, reduce to 1x daily or switch to foam (less irritating than liquid). stay consistent\u2014this is the hardest phase."
        },
        {
          "label": "week 5\u20136: early signals",
          "detail": "some users report slight increase in shedding (normal, follicles cycling).  hair may feel slightly thicker at roots. continue without interruption.  do not skip doses."
        },
        {
          "label": "week 7\u20138: momentum",
          "detail": "by week 8, you're at the threshold of visible change (3\u20134 month mark is typical). continue 2x daily.  if using microneedling, 1\u20132x per week at 1.5mm depth can boost absorption. plan to continue for at least 4\u20136 more months for meaningful results."
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=12.63s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=441
  - [PASS] latency_lt: 12.6s (ceiling 60s)
  - [PASS] block_present: types present: ['timeline']
- needs_judge: ['answers_the_question', 'actionability']

