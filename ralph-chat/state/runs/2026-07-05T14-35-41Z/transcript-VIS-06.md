# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't have your skin type on file, so i'm building this for a standard PM flow. adjust the active (azelaic vs retinoid vs neither) based on what you're actually running.  key: wait 1–2 min between cleanser and active so skin dries. don't stack multiple actives the same night. if you're acne-prone, retinoid PM is the move. if you're dry or sensitive, start with just cleanser + moisturizer + occlusive, add actives slowly.
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
          "note": "removes oil, dirt, sunscreen, buildup so actives reach skin"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin; expands cells to absorb next layers better"
        },
        {
          "label": "active (one at a time)",
          "note": "azelaic, niacinamide, or retinoid \u2014 pick one per night"
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
          "note": "cicaplast or light petrolatum only if dry or damaged"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=9.61s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=423
  - [PASS] latency_lt: 9.6s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

