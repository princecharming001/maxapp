# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** here's your complete skincare starter guide. you've got normal skin and intermediate experience, so this is built to work fast without overcomplication.

---

**product stack**

---

**timeline: what to expect**

---

**action checklist**

---

**key stats**

---

**golden rules**

1. one active at a time
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "first 12 weeks",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "establish routine. cleanser + moisturizer am/pm. no actives yet. skin adjusts to new products."
        },
        {
          "label": "week 3\u20134",
          "detail": "add one active (niacinamide or azelaic acid) 2x per week. barrier strengthens. texture improves."
        },
        {
          "label": "week 5\u20138",
          "detail": "increase active to 3\u20134x per week. first visible clarity. redness reduces. skin feels more resilient."
        },
        {
          "label": "week 9\u201312",
          "detail": "routine locked in. skin tone evens. breakouts drop. barrier fully repaired. ready to add second active if needed."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "buy: cleanser, moisturizer, spf, one active (niacinamide first if unsure)",
        "week 1\u20132: morning = cleanser + moisturizer + spf; evening = cleanser + moisturizer",
        "week 3: add active on monday, wednesday (2x/week, pm only)",
        "week 5: bump active to 3\u20134x per week if no irritation",
        "week 8: assess skin. if clear, consider adding vitamin c serum (am) or retinoid (pm, separate nights from acid)",
        "ongoing: never skip spf. never stack actives on same night."
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "2\u20134 weeks",
          "label": "time to first texture change",
          "hint": "barrier repair + hydration"
        },
        {
          "value": "8\u201312 weeks",
          "label": "visible clarity/tone improvement",
          "hint": "with consistent active use"
        },
        {
          "value": "1 active",
          "label": "max per routine at once",
          "hint": "stacking = irritation + barrier damage"
        },
        {
          "value": "365 days",
          "label": "spf non-negotiable",
          "hint": "uv damage is cumulative"
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=16.37s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=306
  - [PASS] latency_lt: 16.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

