# VIS-04
## turn 0 ('give me an 8-week minoxidil timeline, week by week')
**user:** give me an 8-week minoxidil timeline, week by week
**assistant:** don't see a week-by-week minoxidil timeline in your current docs. the evidence just says "results take several months of consistency" and that it "improves blood flow to follicles, stimulates growth, increases thickness, slows loss". here's what a standard 8-week minoxidil timeline looks like:  key: minoxidil needs 3–4 months minimum to show real regrowth.

8 weeks is the foundation phase. don't expect dramatic change yet. if you're also running finasteride or dermarolling, those stack with minoxidil for better results, but that's.
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
          "detail": "apply 2x daily (AM/PM), 1ml per application. scalp may feel slightly tingly or dry.  no visible change yet. consistency is critical."
        },
        {
          "label": "week 3\u20134",
          "detail": "continue 2x daily.  some users report initial shedding (normal, follicles cycling). scalp adjusts, irritation usually subsides."
        },
        {
          "label": "week 5\u20136",
          "detail": "shedding may peak mid-protocol.  hair texture may feel slightly thicker at the root. still too early for major regrowth."
        },
        {
          "label": "week 7\u20138",
          "detail": "end of short-term window.  some users see slight density improvement or slower loss. most visible results appear after 12\u201316 weeks of consistent use."
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=11.32s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=537
  - [PASS] latency_lt: 11.3s (ceiling 60s)
  - [PASS] block_present: types present: ['timeline']
- needs_judge: ['answers_the_question', 'actionability']

