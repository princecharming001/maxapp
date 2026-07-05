# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't have your skin type on file, so i'm building this for a standard PM flow. adjust the active (azelaic vs retinoid) and occlusive based on whether you're oily or dry.  the order matters. cleanser first so actives actually reach skin, then hydration layers, then barrier lock. if you're oily, skip the occlusive. if you're dry or using retinoid, add it. what's your skin type so i can dial in the active.
- visual_blocks:
```json
[
  {
    "type": "flowchart",
    "title": "PM skincare routine",
    "data": {
      "steps": [
        {
          "label": "cleanse",
          "note": "remove oil, dirt, sunscreen, buildup so actives penetrate"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin; expands cells to absorb next layers better"
        },
        {
          "label": "active (one only)",
          "note": "retinoid PM, or azelaic, or exfoliating acid \u2014 rotate, don't stack"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol; supports skin after the active"
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
- products: 2 item(s)
- status=200 latency=16.49s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=407
  - [PASS] latency_lt: 16.5s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

