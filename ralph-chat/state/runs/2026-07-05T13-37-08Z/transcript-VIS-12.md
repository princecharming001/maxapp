# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** your docs are thin on specific products and dosing, so i'm filling the structure with general skincare fundamentals. here's what you need to start. **core principle:** barrier first, actives second. one active at a time. SPF non-negotiable.     **why this order:** barrier repair (ceramides + panthenol) comes first because damaged skin won't tolerate actives. adapalene is the gentlest retinoid to start; it handles acne and anti-aging without aggressive irritation.

SPF prevents UV from undoing everything. **red flags to pause:** if you see persistent redness, burning on product application, dryness even after moisturizing, or flaking, your barrier is compromised. stop actives, stick to cleanse + moisturize + SPF for 1–2 weeks. you're 17 and tall, so skin is still adapting. consistency beats perfection. hit the timeline, don't skip SPF, and don't add a second active until week 8+.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "starter product stack",
    "data": {
      "columns": [
        "step",
        "AM",
        "PM"
      ],
      "rows": [
        [
          "cleanse",
          "gentle cleanser",
          "gentle cleanser"
        ],
        [
          "treat",
          "none (start here)",
          "adapalene 0.1% (3x/week, build to daily)"
        ],
        [
          "hydrate",
          "hydrating moisturizer + ceramides",
          "hydrating moisturizer + ceramides + panthenol"
        ],
        [
          "protect",
          "SPF 30+ broad-spectrum",
          "\u2014"
        ]
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: gentle cleanser, ceramide moisturizer, panthenol serum, SPF 30+, adapalene 0.1%",
        "week 1: cleanse + moisturize AM/PM, SPF every morning",
        "week 3: add adapalene 2x/week PM only",
        "week 5: bump to 3x/week if no irritation",
        "week 7: move to 4x/week if skin tolerates",
        "never stack actives (no adapalene + BHA + vit c at once)",
        "pause all actives if barrier shows signs: redness, stinging, flaking, tightness"
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
          "hint": "rule: no stacking"
        },
        {
          "value": "8 weeks",
          "label": "to stable routine",
          "hint": "barrier repair + adaptation"
        },
        {
          "value": "SPF 30+",
          "label": "every single morning",
          "hint": "non-negotiable"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=23.33s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=891
  - [PASS] latency_lt: 23.3s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

