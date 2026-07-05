# ERR-01
## turn 0 ('build me a complete 12-week plan covering skin, hair and gym, with a weekly table')
**user:** build me a complete 12-week plan covering skin, hair and gym, with a weekly table
**assistant:** i need a few clarifying details to build you a real plan that actually works.

**for your skin (texture focus):**
what's your main texture issue — active acne, post-acne scarring/pitting, general roughness, or a mix?
[choices]active acne|post-acne scarring|general roughness|something else[/choices]

**for your hair:**
what's your main hair goal — thickness/density, growth, shine/health, or something else?
[choices]thickness & density|growth|shine & health|something else[/choices]

**for gym:**
how many days per week can you realistically train, and do you have any equipment at home or access to a gym?
[choices]3 days, home only|3 days, full gym|4-5 days, home only|4-5 days, full gym|something else[/choices]

once i know these, i'll map out a 12-week progression with a weekly table showing skin routine, hair care, and workouts stacked side-by-side.
- choices: ['3', '4', '5', '6'] (multi=False)
- status=200 latency=12.41s error=None
- checks:
  - [PASS] no_friendly_error: clean
  - [FAIL] no_marker_leak: leaked marker: '[choices]'
  - [PASS] no_leaked_json: clean
  - [PASS] blocks_schema_valid: clean
  - [PASS] prose_nonempty: skipped (choices present, short clarifier OK)
  - [PASS] latency_lt: 12.4s (ceiling 90s)
- needs_judge: ['answers_the_question', 'actionability']

