# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order:  the key: cleanser first so actives actually penetrate, then layer from thinnest to thickest. if you're using a retinoid, that's your active step. don't stack retinoid + azelaic on the same night.
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
          "note": "removes oil, dirt, sunscreen, buildup so actives reach skin"
        },
        {
          "label": "toner / hydrating mist",
          "note": "optional; apply on damp skin for better absorption"
        },
        {
          "label": "active",
          "note": "one at a time: azelaic, niacinamide, or retinoid (PM only)"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol; supports skin after active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids to lock in and repair barrier"
        },
        {
          "label": "occlusive",
          "note": "optional; cicaplast or light petrolatum if dry/damaged"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=8.56s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=217
  - [PASS] latency_lt: 8.6s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

