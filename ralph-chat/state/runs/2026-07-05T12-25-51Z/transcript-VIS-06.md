# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** i don't have your skin type on file, so i'm giving you the standard PM ladder. if you're oily/acne-prone, swap the active to retinoid. if you're dry/sensitive, skip the active on most nights and lean harder into hydration layers.  what's your skin type. that'll let me dial in which active and how aggressive to go.
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
          "note": "removes oil, dirt, sunscreen, buildup"
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin for better absorption"
        },
        {
          "label": "active (one at a time)",
          "note": "retinoid PM, or azelaic if acne-prone. skip if sensitive"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol post-active"
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
- status=200 latency=9.16s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=315
  - [PASS] latency_lt: 9.2s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

