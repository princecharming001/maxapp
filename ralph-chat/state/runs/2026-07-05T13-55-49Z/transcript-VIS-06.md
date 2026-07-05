# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't have your skin type on file, so i'm building this for a standard PM flow. if you're dry/sensitive, you'd skip the active some nights and load up hydration instead. if you're oily/acne-prone, retinoid goes in the active slot.  what's your skin type. that'll let me dial in which active and how often.
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
          "note": "apply on damp skin; expands skin cells to absorb next layers better"
        },
        {
          "label": "active (one at a time)",
          "note": "retinoid PM, or azelaic, niacinamide, exfoliating acids on separate nights"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol; supports skin after the active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides; pulls water in"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids lock in hydration and repair barrier"
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged; seals everything in"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=9.77s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=305
  - [PASS] latency_lt: 9.8s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

