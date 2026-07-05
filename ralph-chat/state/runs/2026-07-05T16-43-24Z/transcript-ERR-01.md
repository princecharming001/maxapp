# ERR-01
## turn 0 ('build me a complete 12-week plan covering skin, hair and gym, with a weekly table')
**user:** build me a complete 12-week plan covering skin, hair and gym, with a weekly table
**assistant:** you don't have active schedules yet, so i'm building from scratch. since you're 23, female, intermediate training experience, oily skin with texture concerns, and your goals are bonemax and hairmax, i'm anchoring the plan around those plus fitmax as the physical foundation.

**the 12-week arc:**

**weeks 1–4: foundation & barrier repair** — your oily skin + texture means inflammation and weak barrier. we reset with gentle actives, barrier support, and consistent lifting to build jaw/bone definition. hair gets deep hydration + scalp reset.

**weeks 5–8: activation & progression** — introduce retinoids (skin collagen driver), increase training intensity, dial in nutrition for muscle and hair density. retinoid-driven texture smoothing kicks in around week 6–7.

**weeks 9–12: refinement & visible results** — full retinoid protocol, advanced gym splits, hair thickness peaks. visible texture improvement, defined jaw, fuller hair.

---

## **skinmax (oily + texture)**

1. **cleanser**: gentle, twice daily (am/pm). remove excess oil without stripping.
2. **barrier support**: centella + ceramides, am and pm. reduces inflammation, preps for actives.
3. **azelaic acid**: 10% (weeks 1–4), 2–3×/week. anti-inflammatory, fights bacteria, gentle brightening.
4. **retinoid**: tretinoin 0.05% (weeks 5+), start 2×/week, build to 4–5×/week by week
5. 5. **sunscreen**: spf 30+, every single morning. non-negotiable with retinoids.
6. **dermastamping**: 0.25mm, 2×/week (never same night as retinoid). accelerates texture smoothing.

---

## **hairmax**

7. **scalp reset**: sulfate-free shampoo + scalp massage 2min daily (drainage, circulation).
8. **deep conditioning**: 1–2×/week, focus on mid-length to ends.
9. **protein treatment**: every other week (weeks 1–6), then weekly (weeks 7–12) as density builds.
10. **scalp health**: zinc + collagen supplement, 5g daily. supports growth cycle.
11. **minimal heat**: air dry or low heat. heat = breakage + frizz.
12. **silk pillowcase**: reduces friction, improves shine and strength.

---

## **fitmax (intermediate, dumbbells)**

since you have dumbbells, we're running a **3-day upper/lower split** (high frequency for bone/jaw development):

13. **day 1 (upper a)**: chest, shoulders, traps. dumbbell bench, incline press, lateral raises, shrugs.
14. **day 2 (lower a)**: quads, glutes, hamstrings. goblet squats, lunges, deadlifts (if you have a barbell or heavy dumbbells).
15. **day 3 (upper b)**: back, bis, rear delts. rows, face pulls, curls, reverse flyes.
- visual_blocks:
```json
[
  {
    "type": "table",
    "title": "12-week looksmaxxing plan",
    "data": {
      "columns": [
        "week",
        "skin",
        "hair",
        "gym",
        "notes"
      ],
      "rows": [
        [
          "1-2",
          "establish routine, cleanser",
          "get quality haircut",
          "upper body focus",
          "build foundation"
        ],
        [
          "3-4",
          "add retinol serum",
          "hair growth treatment",
          "lower body strength",
          "consistency key"
        ],
        [
          "5-6",
          "introduce vitamin c",
          "scalp massage routine",
          "full body split",
          "visible progress"
        ],
        [
          "7-8",
          "chemical exfoliation",
          "protein deep condition",
          "hypertrophy phase",
          "skin clarity peak"
        ],
        [
          "9-10",
          "eye cream, hydration",
          "styling product test",
          "strength training",
          "muscle definition"
        ],
        [
          "11-12",
          "maintenance protocol",
          "final hair optimization",
          "deload week",
          "results consolidation"
        ]
      ]
    }
  }
]
```
- products: 3 item(s)
- status=200 latency=22.74s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] prose_nonempty: len=2520
  - [PASS] latency_lt: 22.7s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

