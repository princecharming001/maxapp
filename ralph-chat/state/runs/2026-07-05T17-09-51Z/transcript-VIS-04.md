# VIS-04
## turn 0 ('give me an 8-week minoxidil timeline, week by week')
**user:** give me an 8-week minoxidil timeline, week by week
**assistant:** evidence is thin on minoxidil timeline specifics. here's what the docs say plus standard protocol. minoxidil takes 3–4 months minimum to show results, so an 8-week timeline will mostly be consistency-building and early signs. the protocol is straightforward: topical liquid or foam, twice daily (AM and PM), applied directly to the scalp on clean, dry hair.  key: don't expect density change by week 8. minoxidil's real window is month 4–6. your job now is consistency and ruling out irritation. if you get scalp burning or persistent flaking, drop to once daily or switch to foam (less irritant than liquid for some people). also, at 17, confirm with a doctor before starting—minoxidil is OTC but hair loss at your age warrants a baseline check.
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "8-week minoxidil timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "establish routine. apply 2\u00d7/day (AM after shower, PM before bed).  scalp may feel slightly tingly or dry. no visible change yet.  this is baseline-building."
        },
        {
          "label": "week 3\u20134",
          "detail": "consistency checkpoint. stick to 2\u00d7/day.  some users report slight scalp irritation or flaking. if irritation occurs, reduce to 1\u00d7/day temporarily.  early shedding may start (normal, not failure)."
        },
        {
          "label": "week 5\u20136",
          "detail": "early shedding phase peaks. hair may look thinner temporarily.  this is minoxidil pushing old hairs out to make room for new growth. do not stop.  continue 2\u00d7/day."
        },
        {
          "label": "week 7\u20138",
          "detail": "shedding should taper. no major visible regrowth yet (too early), but scalp should feel healthier.  hairs may feel slightly thicker or stronger. plan to continue for 4+ months total for real results."
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=14.2s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=746
  - [PASS] latency_lt: 14.2s (ceiling 60s)
  - [PASS] block_present: types present: ['timeline']
- needs_judge: ['answers_the_question', 'actionability']

