# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order:  the key: cleanser first to clear the path, then active while skin is still slightly damp (better penetration), then everything else seals it in. if you're using a retinoid, that's your PM active, don't layer it with azelaic or acids the same night.
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
          "label": "active (one at a time)",
          "note": "retinoid, azelaic, niacinamide, or exfoliating acids \u2014 never mix"
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
          "note": "ceramides + lipids to lock in hydration"
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry/damaged"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=8.23s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=270
  - [PASS] latency_lt: 8.2s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

