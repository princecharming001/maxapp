# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I've got thin evidence here—your docs focus on mistakes and barrier repair, not a full beginner protocol. I'll build this with what's in your module plus foundational skincare logic. --- **the core principle:** barrier first, one active at a time, SPF non-negotiable.

you're 22, likely oily/combo at that age. start with a cleanser, moisturizer with ceramides, and SPF.

add one active (retinoid or azelaic) after 2 weeks once the barrier is solid. no exfoliants, no stacking.     **key moves:** don't skip the first 2 weeks. barrier repair is the foundation. if your skin stings or reddens at week 3, pause adapalene and go back to cleanser + moisturizer for another week. once you're stable on adapalene, you can add a second active (like azelaic for acne or vitamin c for brightness), but not before week 8.
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
        "PM"
      ],
      "rows": [
        [
          "cleanse",
          "gentle cleanser",
          "gentle cleanser"
        ],
        [
          "active",
          ",",
          "adapalene 0.1% (start week 3)"
        ],
        [
          "moisturize",
          "ceramide moisturizer",
          "ceramide moisturizer + panthenol"
        ],
        [
          "protect",
          "SPF 30+ daily",
          ","
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "8-week ramp",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "cleanser + moisturizer + SPF only.  let barrier stabilize. no actives yet."
        },
        {
          "label": "week 3\u20134",
          "detail": "introduce adapalene 0.1% 2x/week PM.  watch for irritation. pause if stinging."
        },
        {
          "label": "week 5\u20136",
          "detail": "increase adapalene to 3\u20134x/week if tolerated.  barrier should feel stronger."
        },
        {
          "label": "week 7\u20138",
          "detail": "move to 5\u20136x/week if no redness/dryness. assess skin texture and breakouts."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick a gentle cleanser (CeraVe foaming or cetaphil)",
        "get a moisturizer with ceramides + niacinamide (CeraVe PM or cetaphil rich)",
        "buy SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
        "order adapalene 0.1% (differin or generic)",
        "set phone reminders: AM cleanser+moisturizer+SPF, PM cleanser+moisturizer",
        "week 3: add adapalene 2x/week, monitor for irritation",
        "week 5+: increase frequency only if skin feels calm"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "2 weeks",
          "label": "barrier stabilization before actives",
          "hint": "cleanser + moisturizer + SPF only"
        },
        {
          "value": "0.1%",
          "label": "adapalene starting dose",
          "hint": "lowest strength, gentlest ramp"
        },
        {
          "value": "1 active",
          "label": "rule for beginners",
          "hint": "no stacking acids, retinoids, or vitamin c"
        },
        {
          "value": "SPF daily",
          "label": "non-negotiable",
          "hint": "prevents pigmentation, collagen breakdown, inflammation"
        }
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=15.8s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=811
  - [PASS] latency_lt: 15.8s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

