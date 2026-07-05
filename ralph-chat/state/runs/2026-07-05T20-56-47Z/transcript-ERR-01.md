# ERR-01
## turn 0 ('build me a complete 12-week plan covering skin, hair and gym, with a weekly table')
**user:** build me a complete 12-week plan covering skin, hair and gym, with a weekly table
**assistant:** i'm building your 12-week looksmaxxing plan now. you're 24, male, beginner lifter with a pull-up bar, dry skin, no active concerns, and you wake at 7am. i'll anchor everything to that.

## skin (skinmax)
your dry skin needs barrier repair and collagen activation. no harsh treatments yet.

1. **weeks 1–4: foundation & barrier repair**
2. **cleanser**: gentle, non-stripping (am + pm)
3. moisturizer: ceramides + hyaluronic acid (am + pm)
4. **spf 30+ every morning** no exceptions
5. **no actives yet** —let your barrier stabilize

6. **weeks 5–8: introduce retinoid**
7. **keep cleanser + moisturizer**
8. **add tretinoin 0**.05% 2–3×/week pm (pea-sized, on dry skin)
9. **sunscreen stays non-negotiable**
10. **skip retinoid if skin** feels irritated; dial back frequency

11. **weeks 9–12: ramp & maintain**
12. **increase tretinoin to 4** –5×/week if tolerated
13. **add azelaic** acid 10% am (anti-inflammatory, brightening)
14. **moisturizer + spf locked** in
15. **dry skin will improve** as barrier strengthens and collagen builds

**diet lever:** cut seed oils, refined sugar, excess dairy for 4 weeks. massive impact on skin clarity and redness. eat protein at every meal (stable blood sugar), 3l water daily.

---

## hair (hairmax)
assume normal scalp, no thinning yet. focus on density and shine.

16. **weeks 1–4: scalp health foundation**
17. shampoo 3–4×/week with a gentle sulfate-free formula
18. **conditioner on ends only** 2–3×/week
19. **scalp massage 60 seconds** daily (upward strokes, drain behind ears) → boosts circulation
20. **no heat styling**; air dry when possible

21. **weeks 5–8: add topical support**
22. **keep shampoo + massage** routine
23. **add minoxidil** 5% (topical) to scalp 1×/day pm (non-negotiable for density)
24. **conditioner stays 2** –3×/week
25. **sleep on silk pillowcase** to reduce friction

26. **weeks 9–12: consolidate & optimize**
27. **maintain minoxidil daily** (results compound over months)
28. **shampoo 3** –4×/week, condition 2–3×/week
29. **scalp massage daily** (it's free, it works)
30. **hair will feel thicker** shinier, less breakage

**diet lever:** biotin 2.5mg daily, collagen 10g daily (hydrolyzed), zinc 15mg, iron if low. these are structural.

---

## gym (fitmax)
beginner with a pull-up bar. build strength and muscle foundation.

31. **weeks 1–4: movement patterns**
32. **3 days/week** 30–40 min
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
          "establish routine, cleanse",
          "get quality haircut",
          "upper body focus",
          "build foundation"
        ],
        [
          "3-4",
          "add retinol serum",
          "start hair oil treatments",
          "lower body strength",
          "consistency key"
        ],
        [
          "5-6",
          "introduce vitamin c",
          "scalp massage routine",
          "full body split",
          "nutrition matters"
        ],
        [
          "7-8",
          "chemical exfoliate 2x",
          "hair growth supplements",
          "increase intensity",
          "track progress"
        ],
        [
          "9-10",
          "hydration masks",
          "styling product upgrade",
          "cardio addition",
          "refine technique"
        ],
        [
          "11-12",
          "assess & adjust",
          "maintenance routine",
          "peak performance",
          "evaluate results"
        ]
      ]
    }
  }
]
```
- products: 4 item(s)
- status=200 latency=18.42s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] prose_nonempty: len=2381
  - [PASS] latency_lt: 18.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

