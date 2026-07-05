# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** don't have your skin type on file, so i'm building this for a standard PM flow. adjust the active (azelaic vs retinoid) and occlusive based on whether you're oily or dry.  the key: each step preps the next one. cleanser clears the path, toner expands cells so they absorb better, active does the work, then serums and moisturizer lock it down. if you're oily, skip the occlusive. if you're dry or sensitive, the occlusive is worth it. what's your skin type. that'll tell me whether you're running retinoid or azelaic at step 3.
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
          "label": "active (one at a time)",
          "note": "retinoid PM, or azelaic, or exfoliating acids on separate nights"
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
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum if dry or damaged, seals everything in"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=9.98s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=527
  - [PASS] latency_lt: 10.0s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

