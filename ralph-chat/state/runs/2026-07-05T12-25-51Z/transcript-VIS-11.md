# VIS-11
## turn 0 ('rate your confidence: mewing vs chewing gum for a defined jawline')
**user:** rate your confidence: mewing vs chewing gum for a defined jawline
**assistant:** mewing is the foundational posture play: tongue on the hard palate (back third), lips sealed, teeth light contact. it's low-effort, passive once you nail the position, and it recruits the entire mylohyoid complex plus some anterior neck tension. the research is thin (mostly anecdotal + biomechanics inference), but the mechanism is sound: sustained upward tongue pressure does create fascia tension and can shift soft-tissue drape over time.

chewing hard gum targets the masseter directly. hypertrophy of the masseter is well-documented, and visible jaw thickness does follow from consistent chewing stimulus. the downside: it's a 10-15 min daily commitment, and if your tmj history is rough, it can aggravate things.

for you (beginner, 6-8h screen time, no tmj flag in your profile), i'd stack both. mewing is your baseline (free, all-day), and hard gum chewing is the accelerator on top of it, 1x daily at a set time. the gum thickens the masseter; mewing keeps the neck long and the soft tissue draped cleanly over it.
- method_metadata:
```json
{
  "methods": [
    {
      "title": "mewing (tongue posture)",
      "confidence": 50,
      "rationale": "biomechanically sound, but long-term human data is sparse; mostly anecdotal reports",
      "sources": null
    },
    {
      "title": "hard gum chewing (masseter hypertrophy)",
      "confidence": 75,
      "rationale": "masseter growth from resistance chewing is well-established in exercise science; visible jaw definition follows",
      "sources": null
    }
  ]
}
```
- status=200 latency=11.91s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1024
  - [PASS] latency_lt: 11.9s (ceiling 60s)
  - [PASS] confidence_range_0_100: clean
- needs_judge: ['answers_the_question', 'max_voice']

