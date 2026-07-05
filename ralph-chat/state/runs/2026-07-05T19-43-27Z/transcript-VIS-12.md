# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I'm building this from your profile (22f, 174cm, 69.1kg) and the skincare fundamentals in your docs. the evidence is thin on specific product brands and timelines, so I'm filling the structure with standard beginner protocols. --- ## the core principle don't buy 10 products. build a system: cleanser → hydrate → barrier repair → one active → SPF. that's it. most beginners fail because they stack actives or skip the barrier work, not because they lack products. your skin type isn't stated, so I'm defaulting to a **balanced beginner routine** (you can shift toward oily or dry once you see how your skin responds). ---  ---  ---  ---  --- ## what to avoid (critical) - **don't exfoliate yet.** your barrier needs 4–8 weeks to stabilize. exfoliating inflamed skin makes everything worse.
1. **don't stack actives.** one active (adapalene) is enough. no vitamin c, no AHA/BHA, no retinol on top.
2. **don't skip SPF.** it's the #1 non-negotiable. UV worsens everything you're trying to fix.
3. **don't over-wash.** twice daily is enough. more strips the barrier. --- ## why this works the barrier is your foundation. once it's intact, products absorb, irritation drops, and actives actually work. adapalene is the gentlest prescription-strength retinoid and handles acne + anti-aging without aggressive exfoliation. SPF is non-negotiable because UV undoes everything else. start here. adjust based on how your skin responds in weeks 3–4.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "beginner skincare product stack",
    "data": {
      "columns": [
        "step",
        "AM",
        "PM",
        "purpose"
      ],
      "rows": [
        [
          "1. cleanse",
          "gentle cleanser (CeraVe foaming or cetaphil)",
          "same",
          "remove oil, bacteria, dead skin without stripping"
        ],
        [
          "2. hydrate",
          "hydrating toner or essence (optional)",
          "same",
          "prep skin for actives and moisturizer"
        ],
        [
          "3. active",
          "none (AM is SPF day)",
          "adapalene 0.1% (start 2x/week)",
          "normalize skin, prevent acne, anti-aging"
        ],
        [
          "4. moisturize",
          "lightweight moisturizer (CeraVe PM or cetaphil)",
          "richer moisturizer with ceramides",
          "lock hydration, repair barrier"
        ],
        [
          "5. protect",
          "broad-spectrum SPF 30+ (EltaMD or La Roche-Posay)",
          "none",
          "non-negotiable: prevents pigmentation, collagen breakdown"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week beginner skincare timeline",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer AM/PM only. no actives. let skin adjust. watch for dryness, redness, or sensitivity."
        },
        {
          "label": "week 3\u20134: introduce adapalene",
          "detail": "start adapalene 0.1% 2x/week (e.g., mon + thu PM). expect mild dryness, slight peeling. this is normal. keep moisturizer rich."
        },
        {
          "label": "week 5\u20136: increase frequency",
          "detail": "move to 3x/week adapalene if no irritation. skin should feel smoother, texture improving. barrier still healing."
        },
        {
          "label": "week 7\u20138: stabilize",
          "detail": "can move to 4\u20135x/week adapalene if tolerated. acne should start clearing. skin tone evens. SPF is non-negotiable every day."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: gentle cleanser, basic moisturizer, SPF 30+, adapalene 0.1% (OTC)",
        "week 1: cleanser + moisturizer only, AM and PM",
        "week 3: add adapalene 0.1% 2x/week PM (after moisturizer dries)",
        "every AM: cleanse, moisturize, apply SPF before leaving house",
        "every PM: cleanse, moisturize, then adapalene on scheduled nights",
        "if irritation (burning, stinging, excessive dryness): pause adapalene, use only cleanser + moisturizer + ceramides for 1 week",
        "by week 8: assess skin. if clear and stable, can increase adapalene frequency or add second active (not before)"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "1",
          "label": "active at a time",
          "hint": "stacking acids + retinoids = barrier damage and reduced absorption"
        },
        {
          "value": "SPF 30+",
          "label": "every single day",
          "hint": "UV worsens pigmentation, breaks collagen, increases inflammation"
        },
        {
          "value": "2\u20133 weeks",
          "label": "before visible change",
          "hint": "skin cell turnover; adapalene takes time to show results"
        },
        {
          "value": "ceramides + panthenol",
          "label": "barrier repair essentials",
          "hint": "lock moisture, soothe irritation, prevent reactive skin cycles"
        }
      ]
    }
  }
]
```
- products: 2 item(s)
- status=200 latency=19.7s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1438
  - [PASS] latency_lt: 19.7s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

