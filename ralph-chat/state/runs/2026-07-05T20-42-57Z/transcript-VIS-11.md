# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is **45% confidence**. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures won't see bone remodeling. you'll get postural habit + some soft-tissue tension shifts, but the effect is marginal and takes months to read. chewing hard gum (masseter training) is **75% confidence**. masseter hypertrophy is well-established; you'll see visible jaw thickness in 8-12 weeks with consistent load. the trade-off is TMJ risk if you ramp too fast or have existing joint issues, so the protocol starts conservative (week 1 skip, ramp week 2+, 1 rest day/week). the real jawline move at 26 is body fat under 15% + neck posture + masseter size. mewing is a long-game postural habit; chewing is the fastest visible change.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "marginal soft-tissue effect in adults with closed sutures; no bone remodeling; postural habit only",
      "sources": null
    },
    {
      "title": "masseter training (hard gum)",
      "confidence": 75,
      "rationale": "hypertrophy is well-established; visible change in 8-12 weeks; TMJ risk if ramped too fast",
      "sources": null
    }
  ]
}
```
- status=200 latency=10.88s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=774
  - [PASS] latency_lt: 10.9s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

