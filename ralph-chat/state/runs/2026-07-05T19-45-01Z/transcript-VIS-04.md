# VIS-04
## turn 0 ('map out my first 8 weeks on minoxidil as a timeline')
**user:** map out my first 8 weeks on minoxidil as a timeline
**assistant:** evidence is thin on minoxidil timeline specifics. I've got the mechanism (blood flow, growth stimulation, takes several months), but no week-by-week breakdown in your docs.

building this with general hairmax knowledge.  key: minoxidil works on blood flow, not hormones, so it's safe to stack with finasteride later if you need DHT blocking. don't skip doses or you reset the timeline.

if scalp burns or you get chest tightness, stop and call your doctor.
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "first 8 weeks on minoxidil",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "start topical minoxidil (liquid or foam). apply to dry scalp AM and PM.  expect no visible change yet; this is the absorption phase. scalp may feel slightly irritated or dry \u2014 normal."
        },
        {
          "label": "week 3\u20134",
          "detail": "continue twice daily.  some users report initial shedding (telogen effluvium) as weak hairs cycle out. don't panic; this is a sign the drug is working.  scalp should adjust to irritation by now."
        },
        {
          "label": "week 5\u20136",
          "detail": "shedding may peak and then taper. new growth begins but not yet visible to the eye.  stick with the routine; consistency is critical. if scalp irritation persists, consider switching to foam (less alcohol)."
        },
        {
          "label": "week 7\u20138",
          "detail": "first subtle signs of regrowth possible (fuzz, slight density increase in treated areas).  most users see nothing dramatic yet. this is normal, full results take 4\u20136 months minimum.  stay consistent."
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=16.21s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=456
  - [PASS] latency_lt: 16.2s (ceiling 60s)
  - [PASS] block_present: types present: ['timeline']
- needs_judge: ['answers_the_question', 'actionability']

