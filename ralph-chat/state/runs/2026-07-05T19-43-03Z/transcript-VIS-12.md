# VIS-12
## turn 0 ('build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats')
**user:** build me a full skincare starter guide: a product table, a timeline, a checklist, and key stats
**assistant:** ---

## **the routine: morning & night**

**am:**
1. **cleanser** — cerave hydrating (or foaming if oily today)
2. **vitamin c serum** — optional, boosts glow and protects collagen
3. **moisturizer** — lightweight, hydrating
4. **spf 30+** — non-negotiable, every single day

**pm:**
5. **cleanser** — same as am
6. **active** (one only) — retinoid, niacinamide, or azelaic acid; rotate nights
7. **moisturizer** — cerave pm or richer formula
8. **occlusive** (optional) — cicaplast if barrier feels tight

---

## **your products at a glance**

---

## **timeline: what to expect**

---

## **startup checklist**
- visual_blocks:
```json
[
  {
    "type": "timeline",
    "title": "your first 12 weeks",
    "data": {
      "steps": [
        {
          "label": "week 1\u20132: foundation",
          "detail": "establish cleanser + moisturizer + spf. skin may feel slightly dehydrated as barrier resets. no actives yet."
        },
        {
          "label": "week 3\u20134: add one active",
          "detail": "introduce niacinamide or low-dose retinoid (1\u20132x/week). watch for irritation; pause if red or dry."
        },
        {
          "label": "week 5\u20138: consistency pays",
          "detail": "skin texture improves, pores refine, barrier strengthens. increase active frequency to 3\u20134x/week if tolerated."
        },
        {
          "label": "week 9\u201312: visible transformation",
          "detail": "clarity increases, fine lines soften, skin tone evens. confidence in routine; safe to add second active if desired."
        }
      ]
    }
  }
]
```
- products: 5 item(s)
- status=200 latency=16.47s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=613
  - [PASS] latency_lt: 16.5s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

