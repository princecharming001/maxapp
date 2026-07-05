# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order:  the key: cleanser first to clear the path, then active while skin is still slightly damp (better absorption), then seal everything in with moisturizer and occlusive if needed. don't skip the order or you're wasting the actives.
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
          "note": "retinoid PM, azelaic, niacinamide, or exfoliating acids on separate nights"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol; supports skin after active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, peptides"
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
- status=200 latency=9.19s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=249
  - [PASS] latency_lt: 9.2s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

