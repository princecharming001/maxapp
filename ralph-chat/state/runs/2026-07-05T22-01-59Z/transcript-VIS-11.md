# VIS-11
## turn 0 ('how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method')
**user:** how confident are you in mewing vs chewing gum for jawline? give me your confidence in each method
**assistant:** mewing is **45% confidence**. it trains tongue posture, which matters for long-term palatal development in kids, but adults with closed sutures won't see bone remodeling. you'll get postural habit + some soft-tissue tension shifts, but the effect is subtle and takes months to read. chewing gum (mastic or falim) is **75% confidence**. masseter hypertrophy is real and visible in 8-12 weeks if you're consistent. thickens the jaw muscle directly, which sharpens the jawline angle without waiting for bone change. the gap: mewing is foundational posture work (you do it anyway), but chewing gum moves the needle faster and harder on actual jaw aesthetics. if you're picking one to prioritize, chewing wins. stack them if you want, but don't expect mewing alone to transform your face as an adult.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing",
      "confidence": 45,
      "rationale": "adults have closed sutures; tongue posture shifts are subtle and slow",
      "sources": null
    },
    {
      "title": "chewing gum (mastic/falim)",
      "confidence": 75,
      "rationale": "masseter hypertrophy is well-established; visible change in 8-12 weeks with consistency",
      "sources": null
    }
  ]
}
```
- status=200 latency=10.99s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=795
  - [PASS] latency_lt: 11.0s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

