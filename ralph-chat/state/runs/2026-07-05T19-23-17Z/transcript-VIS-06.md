# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't have your skin type on file, so i'm building this for a standard PM flow. adjust the active (azelaic vs retinoid) and occlusive based on whether you're oily or dry.  the order matters because each layer preps the next one. cleanser opens the door, actives do the work, serums feed hydration, moisturizer locks it down. what's your skin type. that'll tell me whether you're running retinoid or azelaic, and if you need the occlusive.
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
          "note": "apply on damp skin \u2014 the golden window for absorption"
        },
        {
          "label": "active (one only)",
          "note": "retinoid PM, or azelaic if you rotate. never stack actives same night"
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol to support skin after the active"
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides for plumpness"
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids lock in hydration and repair barrier"
        },
        {
          "label": "occlusive (if dry)",
          "note": "cicaplast or light petrolatum seals everything in"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=10.48s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=438
  - [PASS] latency_lt: 10.5s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

