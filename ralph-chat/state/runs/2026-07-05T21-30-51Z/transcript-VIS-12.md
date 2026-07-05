# VIS-12
## turn 0 ('give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero')
**user:** give me the complete guide: table of products, weekly timeline, checklist, and key stats for starting skincare from zero
**assistant:** I'm building this from the barrier-first principles in your docs, plus general skincare foundations. your evidence is thin on specific product names and dosages, so I'm filling the structure with industry-standard starter picks. --- **start here: barrier first, one active later.** the biggest mistake is product overload.

you need a cleanser, moisturizer with ceramides + panthenol, and SPF. that's it for week 1.

once your barrier is solid (no redness, stinging, or tightness), add one active—either a gentle retinoid or azelaic acid depending on your main concern. your skin type matters.

if you're oily/acne-prone, you'll cleanse daily and eventually add azelaic AM + retinoid PM. if dry/sensitive, cleanse once daily and prioritize hydration + barrier repair first. --- **product table (starter stack):**  --- **weekly timeline (weeks 1–4):**  --- **checklist (your action items):**  --- **key stats:**  --- **why this order matters:** a damaged barrier makes every product useless and every active worse. ceramides and panthenol repair it; SPF prevents UV from undoing your work.

once your skin stops reacting to basic products, you're ready for an active. don't rush it.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "beginner skincare stack",
    "data": {
      "columns": [
        "step",
        "product type",
        "example",
        "when"
      ],
      "rows": [
        [
          "1",
          "cleanser",
          "gentle, non-stripping (CeraVe hydrating or cetaphil)",
          "AM + PM"
        ],
        [
          "2",
          "moisturizer",
          "ceramides + panthenol (CeraVe moisturizing cream or cetaphil rich)",
          "AM + PM, right after cleanse"
        ],
        [
          "3",
          "SPF",
          "broad-spectrum, 30+ (EltaMD UV clear or La Roche-Posay anthelios)",
          "AM only, last step"
        ],
        [
          "4",
          "active (later)",
          "retinoid or azelaic acid",
          "PM only, after barrier is solid"
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
          "detail": "cleanse + moisturize + SPF only.  no actives. let barrier stabilize.  watch for stinging, redness, or tightness."
        },
        {
          "label": "week 2",
          "detail": "same routine. skin should feel less tight, less reactive.  barrier is healing."
        },
        {
          "label": "week 3",
          "detail": "if no irritation, introduce ONE active: retinoid (low dose, 2x/week) or azelaic acid (daily). start slow."
        },
        {
          "label": "week 4",
          "detail": "assess: is skin clearer, less inflamed?  increase active frequency only if no new irritation. stick with one active."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick a gentle cleanser (non-foaming, no sulfates)",
        "get a moisturizer with ceramides and panthenol",
        "buy a broad-spectrum SPF 30+ (non-negotiable)",
        "cleanse AM + PM, moisturize immediately after, apply SPF in AM",
        "skip all exfoliants, acids, and retinoids for week 1",
        "after week 2, if skin feels stable, add ONE active (retinoid or azelaic)",
        "do not stack actives.  one at a time.",
        "reapply SPF every 2 hours if outdoors (or once daily minimum)"
      ]
    }
  },
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "7\u201314 days",
          "label": "barrier repair baseline",
          "hint": "redness and stinging should drop"
        },
        {
          "value": "1",
          "label": "active per routine",
          "hint": "no stacking acids, retinoids, vitamin c together"
        },
        {
          "value": "100%",
          "label": "SPF non-negotiable",
          "hint": "UV worsens pigmentation, breaks collagen, increases inflammation"
        },
        {
          "value": "4 weeks",
          "label": "realistic timeline to first visible change",
          "hint": "clearer skin, less inflammation"
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=18.12s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1181
  - [PASS] latency_lt: 18.1s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

