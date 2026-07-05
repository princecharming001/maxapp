# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't see your skin type in the profile, so i'm building this for a standard PM flow. adjust the active (azelaic vs retinoid) and occlusive based on whether you're oily or dry.  the order matters. cleanser first so actives actually reach skin, then hydration layers trap water, then occlusive seals it all in. if you're oily, skip the occlusive. if you're dry or just started a retinoid, use it every night. what's your skin type. that'll let me dial in which active and whether you need the occlusive.
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
          "note": "remove oil, dirt, sunscreen, buildup"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin; expands cells for better absorption"
        },
        {
          "label": "active (one only)",
          "note": "retinoid PM, or azelaic if sensitive. separate nights if using acids"
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
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=9.32s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=502
  - [PASS] latency_lt: 9.3s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

