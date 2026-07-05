# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is **45% confidence**. it trains tongue posture, which does shift fascia tension and perceived midface support, but the evidence is mostly anecdotal in adults with closed sutures. you won't remodel bone. the upside is it's free and carries no injury risk, so it's a baseline habit, not a primary lever. chewing gum (mastic or falim) is **75% confidence**. masseter hypertrophy is well-established, and it produces visible jaw thickness in 8-12 weeks with consistent load. the protocol is straightforward: 1 piece daily for 10-15 min, alternating sides, with a rest day per week. the real move: stack them. mewing handles posture and fascia; chewing handles muscle. if you're asking which one moves the needle more, it's chewing by a wide margin. but body fat under 15% is still the single biggest jawline lever—neither of these replaces that.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "anecdotal, limited long-term data in adults with closed sutures; shifts fascia tension but won't remodel bone",
      "sources": null
    },
    {
      "title": "chewing gum (mastic/falim)",
      "confidence": 75,
      "rationale": "masseter hypertrophy is well-established; visible change in 8-12 weeks with consistent protocol",
      "sources": null
    }
  ]
}
```
- status=200 latency=9.61s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=849
  - [PASS] latency_lt: 9.6s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

