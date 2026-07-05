# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** # complete skincare starter guide your docs emphasize system design over product count. the foundation is barrier repair + one active at a time, not a cabinet full of serums. here's the full breakdown. --- **product table**  --- **weekly timeline: weeks 1–4**  --- **action checklist**  --- **key stats**  --- **key principles from your docs:** - **don't over-exfoliate.** damaged barrier = worse acne, redness, sensitivity. pause all actives if skin is inflamed.
1. **one active, not five.** product overload reduces absorption and overwhelms skin.
2. **barrier first, actives second.** if basic products sting, your barrier is compromised. fix it with ceramides and panthenol before touching retinoids or acids.
3. **internal health matters.** sleep, gut, insulin, and inflammation affect skin. external products can't outrun internal chaos, so prioritize sleep (you're waking at 07:00, sleeping around 23:00 — that's solid). start with cleanse + moisturize + SPF for 2 weeks. then add one active. that's the system.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "core starter products",
    "data": {
      "columns": [
        "step",
        "product type",
        "purpose",
        "notes"
      ],
      "rows": [
        [
          "1",
          "gentle cleanser",
          "remove oil/dirt without stripping",
          "use once daily or twice if oily"
        ],
        [
          "2",
          "moisturizer with ceramides",
          "repair barrier, lock hydration",
          "non-negotiable; use AM + PM"
        ],
        [
          "3",
          "SPF 30+",
          "UV protection, prevent collagen breakdown",
          "apply every morning, reapply if outdoors"
        ],
        [
          "4",
          "one active (retinoid or azelaic)",
          "address acne or texture",
          "start low, add after barrier is solid"
        ],
        [
          "5",
          "panthenol serum (optional)",
          "anti-inflammatory, speed barrier repair",
          "pair with retinoid if irritation appears"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "first month progression",
    "data": {
      "steps": [
        {
          "label": "week 1",
          "detail": "cleanse + moisturize AM/PM only. no actives. let barrier stabilize. watch for dryness, redness, or stinging."
        },
        {
          "label": "week 2",
          "detail": "same routine. skin should feel less tight. if barrier is intact (no burning on basic products), you're ready for an active."
        },
        {
          "label": "week 3",
          "detail": "introduce ONE active: retinoid (PM only, 2\u20133x/week) OR azelaic (AM, daily). do not stack. pair with panthenol if irritation appears."
        },
        {
          "label": "week 4",
          "detail": "assess. if no irritation, increase active frequency slightly. if stinging/redness, pause active and return to cleanse + moisturize + SPF for 1\u20132 weeks."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy a gentle cleanser (CeraVe hydrating or cetaphil are standard)",
        "buy a moisturizer with ceramides (CeraVe moisturizing cream or cetaphil rich hydrating)",
        "buy SPF 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
        "cleanse once daily (PM) or twice if oily; use lukewarm water",
        "moisturize immediately after cleanse, AM and PM",
        "apply SPF every morning before leaving home",
        "wait 1\u20132 weeks before adding any active (retinoid, azelaic, BHA)",
        "if skin stings or reddens on basic products, pause actives and repair barrier first"
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
          "hint": "stacking acids + retinoids overwhelms skin and kills absorption"
        },
        {
          "value": "2\u20134 weeks",
          "label": "barrier repair timeline",
          "hint": "before introducing actives; watch for tight skin, dryness, or stinging"
        },
        {
          "value": "100%",
          "label": "SPF non-negotiable",
          "hint": "UV worsens pigmentation, breaks collagen, increases inflammation"
        },
        {
          "value": "ceramides + panthenol",
          "label": "barrier repair core",
          "hint": "lock moisture, soothe irritation, prevent water loss"
        }
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=17.15s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1018
  - [PASS] latency_lt: 17.2s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

