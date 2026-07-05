# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is 35–40% confidence. it trains tongue posture, which does shift fascia tension and perceived midface support, but the bone-remodeling claims for adults are mostly cope. your sutures are fused. what you get is postural carryover and a habit that keeps your neck from collapsing forward, which helps, but it's marginal on its own. chewing hard gum (masseter training) is 75–80% confidence. masseter hypertrophy is real and visible in 8–12 weeks. thicker jaw muscle reads as a sharper, wider jawline. the evidence is solid because muscle responds to load, and the protocol is straightforward: 10–15 min daily on alternating sides, one rest day per week. the honest take: if you're doing one, do chewing gum. if you're doing both, mewing is the low-friction backbone (3 daily resets, mostly passive) and gum is the heavy lifter. body fat under 15% is still the single biggest lever though.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 38,
      "rationale": "postural habit + fascia tension shift; adult bone remodeling is minimal due to fused sutures",
      "sources": null
    },
    {
      "title": "chewing hard gum (masseter training)",
      "confidence": 78,
      "rationale": "muscle hypertrophy is well-established; visible change in 8\u201312 weeks with consistent load",
      "sources": null
    }
  ]
}
```
- status=200 latency=10.22s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=893
  - [PASS] latency_lt: 10.2s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

