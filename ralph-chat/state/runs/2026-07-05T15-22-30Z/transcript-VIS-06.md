# VIS-06
## turn 0 ("what's the exact order of steps for a PM skincare routine? show it as a flow")
**user:** what's the exact order of steps for a PM skincare routine? show it as a flow
**assistant:** here's the PM order:  the key: cleanser first to clear the path, then active (retinoid for PM), then everything else layers up to seal. skip the toner if you're in a rush, but don't skip the moisturizer. if your skin is irritated or very dry, add the occlusive on top.
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
          "note": "optional; apply on damp skin for better absorption"
        },
        {
          "label": "active (one at a time)",
          "note": "retinoid PM, or azelaic, niacinamide on separate nights"
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
- status=200 latency=12.7s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=268
  - [PASS] latency_lt: 12.7s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

