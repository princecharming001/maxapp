# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order from cleanest to most occlusive:  the key: each layer goes on slightly damp skin from the previous step. that "golden window" after toner is when your skin cells are expanded and absorb the next layers best. skip the occlusive unless your barrier is actually compromised.
- visual_blocks:
```json
[
  {
    "type": "flowchart",
    "title": null,
    "data": {
      "steps": [
        {
          "label": "cleanser",
          "note": "removes oil, dirt, sunscreen so actives reach skin"
        },
        {
          "label": "toner / hydrating mist",
          "note": "optional; apply on damp skin for better absorption"
        },
        {
          "label": "active (one only)",
          "note": "retinoid, azelaic, niacinamide, or exfoliating acid \u2014 pick one per night"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol to support skin after active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides for plumpness"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids to lock in and repair barrier"
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=8.66s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=291
  - [PASS] latency_lt: 8.7s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

