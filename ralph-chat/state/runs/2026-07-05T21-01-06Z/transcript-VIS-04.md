# VIS-04
## turn 0 ('give me an 8-week minoxidil timeline, week by week')
**user:** give me an 8-week minoxidil timeline, week by week
**assistant:** evidence is thin on minoxidil timeline specifics. your docs say "results take several months of consistency" but don't break down week-by-week progression.

I'll build the timeline with general minoxidil knowledge.  key: apply to a **dry scalp** (not wet hair), wait 4 hours before washing, and use the same amount each time (usually 1 mL per application). if you're stacking minoxidil with finasteride or dermarolling, the synergy speeds results slightly, but the 8-week window stays the same.
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
          "detail": "initial application phase. apply 2x daily (AM/PM) to dry scalp.  expect no visible change yet. scalp may feel slightly irritated or dry; this normalizes.  consistency is critical."
        },
        {
          "label": "week 3\u20134",
          "detail": "shedding phase begins (normal). you may notice more hairs in the shower or on your pillow.  this is minoxidil pushing old hairs out to make room for new growth. do not stop."
        },
        {
          "label": "week 5\u20136",
          "detail": "shedding continues or peaks.  new hair growth starting at the follicle level (not yet visible). scalp irritation usually subsides if you're using it correctly.  stay consistent with 2x daily dosing."
        },
        {
          "label": "week 7\u20138",
          "detail": "first visible signs of regrowth (fine, light hairs) may appear, especially at the hairline or crown. growth is slow and subtle at this stage.  full results take 4\u20136 months minimum; 8 weeks is early but a good checkpoint for compliance."
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=11.23s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=494
  - [PASS] latency_lt: 11.2s (ceiling 60s)
  - [PASS] block_present: types present: ['timeline']
- needs_judge: ['answers_the_question', 'actionability']

