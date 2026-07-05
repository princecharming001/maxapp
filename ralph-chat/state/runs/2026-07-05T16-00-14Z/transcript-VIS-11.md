# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is **45% confidence**. it trains tongue posture, which does shift fascia tension and perceived midface support, but the bone-remodeling claims for adults are mostly anecdotal. you'll get postural benefit and some soft-tissue tightening, but don't expect structural change after your growth plates closed. chewing hard gum (masseter training) is **70% confidence**. masseter hypertrophy is well-established, and visible jaw thickening shows up in 8-12 weeks with consistent work. the muscle development actually shifts how your jawline reads, which is the real lever for adults. the honest take: mewing is a posture baseline you should do anyway (it's free, takes 60s active work). but if you want visible jawline change, masseter training is where the real work is. pair them—mewing handles the postural foundation, chewing builds the muscle that makes it pop.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "tongue posture shifts fascia tension and perceived structure, but bone remodeling in adults is anecdotal; growth plates closed",
      "sources": null
    },
    {
      "title": "masseter training (hard gum)",
      "confidence": 70,
      "rationale": "muscle hypertrophy is well-established; visible jaw thickening in 8-12 weeks with consistent bilateral chewing",
      "sources": null
    }
  ]
}
```
- status=200 latency=12.35s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=867
  - [PASS] latency_lt: 12.4s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

