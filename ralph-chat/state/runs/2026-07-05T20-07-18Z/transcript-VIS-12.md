# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** here's your complete skincare starter guide:

**the core routine is dead simple: cleanser → moisturizer → spf (am), cleanser → moisturizer (pm).** you don't need actives yet. build the foundation first, then add one active (retinoid or niacinamide) after 4–6 weeks when your barrier is solid.

**next move:** grab the
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "skincare starter products",
    "data": {
      "columns": [
        "step",
        "morning",
        "evening",
        "how often"
      ],
      "rows": [
        [
          "cleanse",
          "cerave hydrating cleanser",
          "cerave hydrating cleanser",
          "2x daily"
        ],
        [
          "moisturize",
          "cerave pm lotion",
          "cerave pm lotion",
          "2x daily"
        ],
        [
          "protect",
          "spf 30+ (broad spectrum)",
          "\u2014",
          "am only"
        ],
        [
          "active (later)",
          "\u2014",
          "retinoid or niacinamide",
          "after week 4\u20136"
        ]
      ]
    }
  },
  {
    "type": "timeline",
    "title": "first 12 weeks",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "cleanser + moisturizer am/pm. skip actives. let skin adjust. you'll feel the difference in hydration by day 5."
        },
        {
          "label": "week 3\u20134: add spf",
          "detail": "introduce broad-spectrum spf 30+ every morning. this is non-negotiable \u2014 blocks uv damage and pigmentation."
        },
        {
          "label": "week 5\u20136: first active",
          "detail": "once barrier feels solid (no flaking, no tightness), add retinoid 1\u20132x/week pm-only. start low, go slow."
        },
        {
          "label": "week 7\u201312: dial in",
          "detail": "increase retinoid frequency if tolerated. skin clarity and texture improve by week 8\u201310. stick with it."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "get a gentle hydrating cleanser (cerave or equivalent)",
        "get a basic ceramide moisturizer for am and pm",
        "get a broad-spectrum spf 30+ sunscreen",
        "cleanse morning and night \u2014 don't skip either",
        "apply moisturizer to damp skin within 60 seconds of cleansing",
        "wear spf every single morning, even indoors",
        "wait 4\u20136 weeks before adding any active (retinoid, acids, etc.)",
        "if skin feels tight or flaky, dial back frequency and focus on barrier repair",
        "track how your skin feels weekly \u2014 texture, hydration, sensitivity"
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
          "label": "time to feel hydration shift",
          "hint": "barrier repair starts fast"
        },
        {
          "value": "4\u20136 weeks",
          "label": "before adding first active",
          "hint": "rush this and you'll damage barrier"
        },
        {
          "value": "8\u201310 weeks",
          "label": "visible texture and clarity change",
          "hint": "if you stick to it"
        },
        {
          "value": "365 days",
          "label": "spf non-negotiable streak",
          "hint": "uv is the #1 ager"
        }
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=17.48s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=317
  - [PASS] latency_lt: 17.5s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

