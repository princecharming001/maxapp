# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** evidence is thin on your specific skin type, so i'm building this on the absorption ladder from your docs. your PM routine follows the layering order that lets actives actually work.  the key: wait 1–2 min between cleanser and active so skin dries. don't skip the hydrating serum even if you think you're oily, it prevents dehydration-driven oil rebound. occlusive is only if your barrier feels compromised.
- visual_blocks:
```json
[
  {
    "type": "flowchart",
    "title": "PM skincare routine",
    "data": {
      "steps": [
        {
          "label": "cleanser",
          "note": "removes oil, dirt, sunscreen so actives reach skin"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin; expands cells to absorb next layers"
        },
        {
          "label": "active (one at a time)",
          "note": "retinoid PM, or azelaic, or niacinamide \u2014 not all together"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol; supports skin after active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides, pulls water in"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids lock in hydration and repair barrier"
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged, seals everything in"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=9.79s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=407
  - [PASS] latency_lt: 9.8s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

