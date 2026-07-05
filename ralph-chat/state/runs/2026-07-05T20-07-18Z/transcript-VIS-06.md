# VIS-06
## turn 0 ('walk me through my PM skincare routine step by step as a flowchart')
**user:** walk me through my PM skincare routine step by step as a flowchart
**assistant:** evidence is thin on your specific skin type, so i'm building this on the standard PM absorption ladder. adjust based on whether you're oily, dry, or combo.  the key: each step preps the skin for the next one. cleanser first so actives actually reach skin, then hydration layers seal everything in. if you're oily/acne-prone, skip the occlusive; if you're dry/sensitive, the occlusive is worth it. what's your skin type. that'll tell me if you need to adjust the active or hydration intensity.
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
          "note": "remove oil, dirt, sunscreen. prepares skin for actives."
        },
        {
          "label": "toner / hydrating mist (optional)",
          "note": "apply on damp skin.  expands cells, improves absorption of next layers."
        },
        {
          "label": "active (one only)",
          "note": "retinoid PM, or azelaic, or niacinamide. rotate exfoliating acids on separate nights."
        },
        {
          "label": "treatment serum",
          "note": "centella or panthenol.  supports skin after the active."
        },
        {
          "label": "hydrating serum",
          "note": "hyaluronic acid, beta-glucan, or peptides. pulls water in."
        },
        {
          "label": "moisturizer",
          "note": "ceramides + lipids.  locks in hydration and repairs barrier."
        },
        {
          "label": "occlusive (optional)",
          "note": "cicaplast or light petrolatum. use only if dry or damaged."
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=10.22s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=492
  - [PASS] latency_lt: 10.2s (ceiling 60s)
  - [PASS] block_present: types present: ['flowchart']
- needs_judge: ['answers_the_question', 'actionability']

