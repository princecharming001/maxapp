# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** that's your absorption ladder in order. cleanser first so actives actually penetrate, then build hydration and barrier support on top. skip the toner if you're in a rush, but don't skip moisturizer. retinoid goes in the active slot, not before or after.
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
          "note": "remove oil, dirt, sunscreen, buildup so actives reach skin"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin; expands cells to absorb next layers"
        },
        {
          "label": "active",
          "note": "retinoid PM only. one active per night"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol. supports skin after active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids lock in hydration and repair barrier"
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged"
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": "PM skincare routine checklist",
    "data": {
      "items": [
        {
          "task": "cleanse face",
          "completed": false
        },
        {
          "task": "apply toner/hydrating mist (optional)",
          "completed": false
        },
        {
          "task": "apply active (retinoid)",
          "completed": false
        },
        {
          "task": "apply treatment serum",
          "completed": false
        },
        {
          "task": "apply hydrating serum",
          "completed": false
        },
        {
          "task": "apply moisturizer",
          "completed": false
        },
        {
          "task": "apply occlusive (optional)",
          "completed": false
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=9.7s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=253
  - [PASS] latency_lt: 9.7s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart', 'checklist']
- needs_judge: ['answers_the_question', 'actionability']

