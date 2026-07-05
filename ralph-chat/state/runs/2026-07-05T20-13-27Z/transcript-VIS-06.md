# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order:  the key: cleanser first so actives actually penetrate, then layer lightest to heaviest. if you're using retinoid, that's your active step. skip the toner if you're in a hurry, but the rest are the order that matters.
- visual_blocks:
```json
[
  {
    "type": "flowchart",
    "title": "PM skincare routine (absorption order)",
    "data": {
      "steps": [
        {
          "label": "cleanser",
          "note": "removes oil, dirt, sunscreen, buildup"
        },
        {
          "label": "toner / hydrating mist",
          "note": "optional; apply on damp skin"
        },
        {
          "label": "active",
          "note": "retinoid PM only (or azelaic, niacinamide on separate nights)"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol post-active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, peptides"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids to lock in"
        },
        {
          "label": "occlusive",
          "note": "optional; cicaplast or petrolatum if dry/damaged"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=8.32s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=238
  - [PASS] latency_lt: 8.3s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

