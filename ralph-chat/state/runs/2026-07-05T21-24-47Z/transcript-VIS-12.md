# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** you've got dry skin and you're starting fresh, so the goal is repair your barrier first, then lock in hydration. skip actives until your skin's stable. here's your full starter path.

**the product table** — what to use, when, and why:

**timeline — what to expect week by week:**

**checklist — your setup actions:**

**key stats:**
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "8-week skin recovery",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132",
          "detail": "skin feels tight, flaky. barrier is still compromised. stick to cleanser + moisturizer + spf only. no actives."
        },
        {
          "label": "week 3\u20134",
          "detail": "flaking reduces. add hydrating serum. skin starts holding moisture better. redness may still be present."
        },
        {
          "label": "week 5\u20136",
          "detail": "barrier noticeably stronger. skin feels smoother. add vitamin c serum in the am. skin tone begins to even."
        },
        {
          "label": "week 7\u20138",
          "detail": "hydration locked in. fine lines soften. skin is stable enough to introduce one gentle active (azelaic or niacinamide) if desired."
        }
      ]
    }
  },
  {
    "type": "checklist",
    "title": null,
    "data": {
      "items": [
        "pick a gentle cleanser (cream or milk base, no sulfates)",
        "get a ceramide moisturizer with panthenol and niacinamide",
        "buy a hydrating serum with hyaluronic acid",
        "grab spf 30+ (mineral or hybrid)",
        "optional: vitamin c serum for am",
        "optional: centella or panthenol treatment serum for pm",
        "set am routine: cleanser \u2192 hydrating serum \u2192 moisturizer \u2192 spf",
        "set pm routine: cleanser \u2192 hydrating serum \u2192 moisturizer (+ occlusive if very dry)",
        "commit to 8 weeks with no actives",
        "test one product at a time; wait 3\u20135 days before adding the next"
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=14.84s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=333
  - [PASS] latency_lt: 14.8s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

