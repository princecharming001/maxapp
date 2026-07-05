# VIS-03
## turn 0 ('what results can i expect from tretinoin? hit me with the key numbers')
**user:** what results can i expect from tretinoin? hit me with the key numbers
**assistant:** tretinoin hits texture hard because it forces collagen remodeling. here's what to expect:

**weeks 1–4:** purge (breakouts spike), red and flaky. this is normal retinization. your barrier is healing underneath.

**weeks 4–8:** texture starts smoothing, pore size shrinks slightly, fine lines fade. you'll see it most on the cheeks and forehead.

**weeks 8–12:** acne clears 60–80% depending on severity. texture improvement is noticeable. scars flatten a bit.

**3–6 months:** collagen is rebuilding. skin looks thicker, smoother, more resilient. this is when people say "my skin transformed."

key numbers for your situation (dry skin + texture concern):

the catch: you have dry skin, so tretinoin will dehydrate you further during retinization. this means:

1. **start at 0**.025% (not 0.05%) and go 1–2× per week for the first month
2. **use a heavy moisturizer** and barrier repair (ceramides, hyaluronic acid)
3. **no other actives** (vitamin c, aha, bha) for the first 8 weeks
4. **spf 30+ every single** day (tretinoin makes you sun-sensitive)

want me to build you a tretinoin protocol with the exact routine and product picks for dry skin?
- visual_blocks:
```json
[
  {
    "type": "stat_cards",
    "title": null,
    "data": {
      "cards": [
        {
          "value": "60\u201380%",
          "label": "acne clearance",
          "hint": "by 12 weeks with consistent use"
        },
        {
          "value": "4\u20136 weeks",
          "label": "purge duration",
          "hint": "temporary breakouts before improvement"
        },
        {
          "value": "3+ months",
          "label": "visible texture smoothing",
          "hint": "collagen remodeling takes time"
        },
        {
          "value": "0.025\u20130.1%",
          "label": "start low, go slow",
          "hint": "dry skin needs gentler entry"
        }
      ]
    }
  }
]
```
- products: 1 item(s)
- status=200 latency=15.3s error=None
- checks:
  - [PASS] no_marker_leak: clean
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] no_tech_leak: clean
  - [PASS] prose_nonempty: len=1149
  - [PASS] latency_lt: 15.3s (ceiling 60s)
  - [PASS] block_present: types present: ['stat_cards']
- needs_judge: ['answers_the_question', 'max_voice']

