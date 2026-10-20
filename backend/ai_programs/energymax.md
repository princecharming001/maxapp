# EnergyMax

## What it is
EnergyMax works on the biology behind energy crashes. The body clock: morning light sets it earlier, so the afternoon dip is shallower. Glucose swings after meals: eating carbs last and walking after meals blunt the spike and the dip that follows. Sleep pressure: caffeine blocks adenosine, but a late dose costs sleep (about 45 minutes in trials), while a short nap clears sleep pressure without grogginess. Mild dehydration: losing about 1.4% of body water raises fatigue. Arousal from muscle work and cold: a walk or a stair burst lifts energy at once, and cold water triggers a short alertness jolt. Every habit pulls one of these levers in about 0–10 minutes. It is not a treatment for fatigue that has a medical cause.

## Who it fits / who should check with a professional first
Fits: healthy adults with mid-morning or afternoon crashes, people who lean on coffee or sugar to get through the day, and desk-bound workers.

Check with a professional first:
- Fatigue lasting 4 weeks or more, or with red flags (weight loss, night sweats, shortness of breath, heavy periods, loud snoring with daytime sleepiness): suggest bloodwork (CBC and ferritin, TSH, B12, HbA1c) and a sleep-apnea screen; the app suggests a check-up, it never guesses.
- Heart disease, an arrhythmia, uncontrolled high blood pressure or pregnancy: these gate `vigorous_burst` and `cold_shower_finish`.
- Insulin or sulfonylurea users: meal order and post-meal walks lower glucose; tell the care team.
- Fluid restriction for heart or kidney failure: no water targets.
- Active eating disorder or a history of one: no food rules without their care team.
- Low mood: fatigue can be a symptom of depression.

## Habit library

### `water_on_waking` — Water before coffee
- minutes: 1 / 2
- kind: action
- lever: hydration
- anchor: wake (first thing, before any caffeine)
- frequency: daily
- tier: core
- order: first
- avoid if: fluid-restricted heart failure, fluid-restricted kidney disease, history of low sodium
- why: Mild dehydration of about 1.4% of body mass raised fatigue and headaches and lowered concentration, and low drinkers who drank more felt less tired within days.
- how: 1) Fill a large glass (about 300–500 ml) at the tap. 2) Drink it before any coffee or tea. 3) Refill it, or your bottle, and keep it in sight for the morning.
- conflicts/synergies: Comes before `morning_light` and the first coffee (water, light, food, coffee). Shown once if other programs also hydrate (FocusMax `hydrate_to_focus` is the work-start glass).
- source: https://pubmed.ncbi.nlm.nih.gov/22190027/

### `morning_light` — Morning light
- minutes: 10 / 15
- kind: action
- lever: light
- anchor: wake (within the first hour after waking; right after water)
- frequency: daily
- tier: core
- after: water_on_waking
- avoid if: bipolar disorder, photosensitizing medication, retinal disease
- why: A week of natural light alone moved the body clock about 2 hours earlier, and a single weekend produced most of that shift; an earlier clock means less morning grogginess.
- how: 1) Step outside (doorstep, balcony or a short walk); light through a window doesn't count. 2) Face the bright sky, but never look at the sun. 3) Stay about 10 min on bright days and 20–30 min when it's overcast.
- conflicts/synergies: Same habit as SleepMax and FocusMax `morning_light`; schedule once. Shares the wake card with LongevityMax `sleep_regularity`. Walking outside counts toward `daily_steps`.
- source: https://pubmed.ncbi.nlm.nih.gov/23910656/

### `delay_first_coffee` — Coffee after food
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: breakfast (first caffeine comes after the first food of the day)
- frequency: daily
- tier: core
- avoid if: none
- why: After a broken night, strong black coffee on an empty stomach raised the glucose peak and insulin about 32% after a sugary drink; the popular "wait 90 minutes" rule has no trial behind it.
- how: 1) No coffee or tea until you've eaten something, at least the protein part of your breakfast. 2) The first cup comes after food. 3) For a gentler lift, make that cup green tea or matcha (less caffeine, plus L-theanine).
- conflicts/synergies: Follows `protein_first_meal`. For people who skip breakfast, the gate is their first meal. Counts toward the `caffeine_cutoff` budget; same cup as FocusMax `caffeine_for_focus`.
- source: https://pubmed.ncbi.nlm.nih.gov/32475359/

### `protein_first_meal` — Protein breakfast
- minutes: 2 / 5
- kind: action
- lever: nutrition
- anchor: breakfast (or the first meal of the day if breakfast is skipped)
- frequency: daily
- tier: core
- avoid if: advanced kidney disease, active eating disorder
- why: A 35 g-protein breakfast (vs 13 g) increased fullness all day and cut evening high-fat snacking, and a low-carb breakfast lowered 24-hour glucose in type 2 diabetes.
- how: 1) Build the meal around about 25–35 g of protein: 3 eggs with Greek yogurt, a tofu scramble, cottage cheese or leftovers. 2) Add fiber: fruit, oats or vegetables. 3) Eat the protein part first; leave juice or pastries for last, or skip them.
- conflicts/synergies: Same idea as LongevityMax and FitMax `protein_each_meal` at breakfast; show once. It is the gate for `delay_first_coffee`.
- source: https://pubmed.ncbi.nlm.nih.gov/23446906/

### `lunch_balance` — Carbs-last lunch
- minutes: 1 / 1
- kind: action
- lever: nutrition
- anchor: lunch (the meal before the usual afternoon dip)
- frequency: daily
- tier: core
- avoid if: insulin or sulfonylurea use, active eating disorder
- why: In prediabetes, eating vegetables and protein 10 minutes before carbs cut the glucose peak by more than 40% and total glucose by 39%; carbs first caused marked swings.
- how: 1) Start with the vegetables or salad. 2) Then eat the protein. 3) Save bread, rice, pasta, potatoes and sweets for the last part of the meal.
- conflicts/synergies: Same mechanism as LongevityMax `veg_first` and FocusMax `protein_first_lunch`; one lunch card. Pairs with `outdoor_lunch` straight after.
- source: https://pubmed.ncbi.nlm.nih.gov/30101510/

### `post_meal_walk` — Walk after dinner
- minutes: 2 / 10
- kind: action
- lever: movement
- anchor: dinner (start within about 15 min of finishing; breakfast also works)
- frequency: daily
- tier: core
- avoid if: none
- why: Walking 10 minutes after each meal lowered post-meal glucose 12% more than one 30-minute daily walk (22% after dinner), and even 2–5 minute walks blunted glucose.
- how: 1) Stand up when you finish eating. 2) Walk at an easy, chatty pace: around the block, down the hallway, or pacing on a call. 3) Keep going for 2–10 minutes; longer is fine.
- conflicts/synergies: Counts toward `daily_steps`. The lunch version is `outdoor_lunch`; don't schedule both after lunch.
- source: https://pubmed.ncbi.nlm.nih.gov/27747394/

### `outdoor_lunch` — Walk after lunch
- minutes: 10 / 15
- kind: action
- lever: light
- anchor: lunch (straight after eating, outdoors)
- frequency: weekdays
- tier: medium
- avoid if: none
- why: Inactive employees who took lunchtime walks 3 times a week for 10 weeks felt more enthusiastic and relaxed in the afternoon, and the walk blunts the lunch glucose rise.
- how: 1) Finish eating and head straight outside. 2) Walk 10–15 min at an easy-to-brisk pace. 3) Keep your eyes up toward the sky (never at the sun), with your phone in your pocket.
- conflicts/synergies: Replaces `post_meal_walk` at lunch. Same idea as CalmMax `outdoor_walk` and FocusMax `walk_to_think`; schedule once. If their dip is right after lunch, this is that day's slump card.
- source: https://pubmed.ncbi.nlm.nih.gov/25559067/

### `movement_snack` — Break up sitting
- minutes: 2 / 5
- kind: action
- lever: movement
- anchor: work_break (after every 45–60 min of sitting)
- frequency: weekdays
- tier: core
- avoid if: none
- why: Six 5-minute walks spread across a sitting day raised energy and vigor and, unlike one 30-minute walk, cut fatigue and food cravings by the end of the day.
- how: 1) Stand up. 2) Walk for 2–5 minutes: stairs, a hallway lap, or a water refill. 3) Sit back down and carry on.
- conflicts/synergies: Same concept group as FocusMax `micro_break`, FitMax `posture_break` and LongevityMax `move_after_sitting`: one card. Skip the hour that holds `outdoor_lunch` or `slump_reset`.
- source: https://pubmed.ncbi.nlm.nih.gov/27809874/

### `slump_reset` — Stairs, not snacks
- minutes: 5 / 10
- kind: action
- lever: movement
- anchor: afternoon (at their slump time)
- frequency: weekdays
- tier: medium
- avoid if: chest pain or dizziness on exertion, knee or hip pain on stairs
- why: In short-sleeping young women, 10 minutes of easy stair walking lifted vigor more than a 50 mg caffeine capsule.
- how: 1) Open a window or step outside for fresh air. 2) Walk the stairs up and down at a steady, comfortable pace for 10 min, or take a brisk flat walk. 3) Have a glass of water instead of the extra coffee or sugar.
- conflicts/synergies: Use `slump_reset` or `power_nap` for a given dip, not both. Stale, crowded-room air raised fatigue in lab studies, hence step 1. Counts toward `daily_steps`.
- source: https://pubmed.ncbi.nlm.nih.gov/28302573/

### `power_nap` — 10-minute nap
- minutes: 10 / 20
- kind: action
- lever: sleep
- anchor: afternoon (early in the slump window, at least 7 h before bed)
- frequency: weekdays on low-energy days
- tier: medium
- avoid if: insomnia, untreated sleep apnea, habitual naps over 30 min
- why: After a short night, a 10-minute nap improved sleepiness, fatigue, vigor and thinking at once for up to 155 minutes, while a 30-minute nap caused grogginess first.
- how: 1) Lie down or recline somewhere quiet and cover your eyes. 2) Set a 20-minute timer and aim for about 10 minutes of actual sleep. 3) Get up when it ends even if you didn't drop off, then step into daylight or splash your face.
- conflicts/synergies: Replaces `slump_reset` that day. Same habit as FocusMax `power_nap`; schedule once. A coffee right before the nap beat the nap alone, but only before `caffeine_cutoff`. Follows SleepMax `nap_rule`.
- source: https://pubmed.ncbi.nlm.nih.gov/16796222/

### `caffeine_cutoff` — Caffeine curfew
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: afternoon (about 9 h before usual bedtime, 13 h for energy drinks and pre-workout)
- frequency: daily
- tier: core
- avoid if: none
- why: Across 24 studies, caffeine cut total sleep by 45 minutes and sleep efficiency by 7%; coffee needs about 9 h before bed and a pre-workout about 13 h.
- how: 1) From now on, only caffeine-free drinks today. 2) Switch to water, herbal tea or decaf. 3) Watch for hidden caffeine: cola, energy drinks, pre-workout, some teas, dark chocolate and some painkillers.
- conflicts/synergies: Same rule as SleepMax and FocusMax `caffeine_cutoff`; schedule once and the strictest wins. Blocks a late caffeine nap. In pregnancy, total caffeine stays at or below 200 mg a day.
- source: https://pubmed.ncbi.nlm.nih.gov/36870101/

### `vigorous_burst` — 60-second stair sprint
- minutes: 1 / 3
- kind: action
- lever: movement
- anchor: work_break (mid-morning or mid-afternoon, at least 1 h apart)
- frequency: 3 times a week
- tier: hard
- avoid if: heart disease, arrhythmia, uncontrolled high blood pressure, chest pain or fainting on exertion, pregnancy, recent surgery or joint injury
- why: Three 20-second all-out stair climbs, 3 days a week for 6 weeks, raised fitness (VO2peak) by 12% in sedentary women, and each burst is an immediate wake-up.
- how: 1) Walk one easy flight to warm up. 2) Climb 2–3 flights as fast as is safe, a hand near the rail, for 20–60 seconds. 3) Walk down slowly to recover; repeat once or twice if you feel good.
- conflicts/synergies: Same mechanism as LongevityMax `stair_snack` and FitMax `stair_or_burst`; one burst counts for all. Not within 1 h of bed. FocusMax `move_before_focus` can carry the burst on focus days.
- source: https://pubmed.ncbi.nlm.nih.gov/28009784/

### `cold_shower_finish` — 30-second cold finish
- minutes: 1 / 2
- kind: action
- lever: temperature
- anchor: get_ready (end of the morning shower)
- frequency: daily
- tier: hard
- avoid if: heart disease, arrhythmia, uncontrolled high blood pressure, raynaud's, cold urticaria, pregnancy, history of fainting
- why: In 3,018 adults, ending showers with 30–90 seconds of cold for 30 days cut self-reported sickness-absence days by 29%, and cold immersion left people feeling more alert.
- how: 1) Finish your normal warm shower. 2) Turn the tap fully cold for 30 seconds, building toward 60–90 seconds over the weeks. 3) Breathe slowly and steadily through the gasp, then dry off and dress warmly.
- conflicts/synergies: Same habit as FocusMax and CalmMax `cold_shower_finish`; schedule once. Keep it at least 4 h away from strength training when building muscle (cold right after lifting blunted gains). Never with breath holds.
- source: https://pubmed.ncbi.nlm.nih.gov/27631616/

### `energy_check_in` — Rate your energy 1–5
- minutes: 1 / 1
- kind: checkin
- lever: tracking
- anchor: afternoon (at their slump time)
- frequency: daily
- tier: core
- avoid if: none
- why: Self-rated energy is what these trials moved, and two weeks of your own scores show which levers actually lift you.
- how: 1) Rate your energy right now, 1–5. 2) Tap anything that applies: short sleep, late caffeine, big lunch, no walk, no daylight. 3) Done.
- conflicts/synergies: Merge with SleepMax `sleep_log` and CalmMax `stress_checkin` when they land together. Mostly 2 or lower for 2+ weeks despite good adherence: show the fatigue bloodwork note.
- source: https://pubmed.ncbi.nlm.nih.gov/27809874/

## What the AI needs to know (intake)
1. `slump_time` (required) — Places the slump reset, the nap and the check-in.
   Q: "When does your energy dip the most?" Options: Mornings | After lunch | Late afternoon | Evenings | It's pretty steady
2. `caffeine_pattern` (required) — Sets the coffee-after-food wording, the cutoff (9 h, or 13 h with energy drinks) and the over-400 mg note.
   Q: "How much caffeine do you have on a typical day?" Options: None | 1 cup | 2–3 cups | 4+ or energy drinks
3. `first_meal_style` (required) — Decides how to frame the protein habit (breakfast vs first meal).
   Q: "What does your morning eating look like?" Options: Real breakfast | Something quick | Coffee only | I eat later in the day
4. `health_flags` (required, multi) — Gates the stair sprint, the cold finish and water targets (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
5. `rest_spot` (optional) — Turns the 10-minute nap on or off (shared with FocusMax).
   Q: "Could you lie down or recline for 15 minutes during the day?" Options: Yes, at work | Only at home or on days off | No

## Scheduling rules
- Morning order: `water_on_waking`, then `morning_light` within the first hour, then `protein_first_meal`, then the first coffee (`delay_first_coffee`).
- Caffeine cutoff: bedtime minus 9 h for coffee or tea, minus 13 h with energy drinks or pre-workout. A caffeine nap only before the cutoff.
- Slump: if it comes right after lunch, `outdoor_lunch` fills the slot and the next slump card moves about 2 h later. Otherwise `slump_reset`, or `power_nap` when `rest_spot` allows, never both on one day. Naps end at least 7 h before bed.
- Walks: `post_meal_walk` starts within about 15 min of finishing the meal, dinner first; `outdoor_lunch` replaces it at lunch.
- `movement_snack` every 45–60 min of sitting during work, at most 6 a day, skipping the hour with `outdoor_lunch` or `slump_reset`.
- `vigorous_burst` on non-consecutive days, never within 1 h of bed, only with health flags "None of these".
- `cold_shower_finish` mornings only, at least 4 h from strength training, only with clear health flags and a cold answer that isn't "Not for me".
- `energy_check_in` daily at the slump time. From day 14, the coach ranks levers by how they track with the scores.
- Tiers: core first; medium after 7 days at 60%+ adherence; hard only with clear health flags.
- Week 1: `water_on_waking`, `morning_light`, `delay_first_coffee`, `caffeine_cutoff`, `post_meal_walk`. Week 2: add `protein_first_meal`, `lunch_balance`, `movement_snack`, `energy_check_in`. Week 3+: add the slump card, `outdoor_lunch`, then hard habits if eligible.

## Safety and claims
- Wording: "lowered post-meal glucose in trials" for meal order and walking, "people reported more energy" for walks, stairs and naps. Never "cures fatigue", "boosts metabolism", "boosts immunity" or "balances hormones/cortisol".
- Cold showers: "fewer self-reported sick days in one trial", not "prevents illness" (illness days didn't change).
- Persistent fatigue is a medical symptom: show a talk-to-a-clinician note (ferritin and CBC, TSH, B12, HbA1c, a sleep-apnea screen) when fatigue lasts 4+ weeks or check-ins stay at 2 or lower for 2+ weeks. EnergyMax never doses iron, B12, vitamin D or creatine; those go to Suppmax.
- Stop rules: chest pain, fainting, palpitations or unusual shortness of breath means stop and seek care.
- Glucose: walks and meal order lower glucose; insulin or sulfonylurea users get a one-time tell-your-care-team note.
- Light: durations are practical rules of thumb, not trial doses. Never tell anyone to look at the sun.
- Not offered: vinegar shots before meals (small acute trials, enamel and esophagus risks, low blood sugar with insulin), hyperventilation breathwork for energy (fainting risk), and strict caffeine-delay rules.

## Sources
- https://pubmed.ncbi.nlm.nih.gov/27747394/
- https://pubmed.ncbi.nlm.nih.gov/35147898/
- https://pubmed.ncbi.nlm.nih.gov/26106234/
- https://pubmed.ncbi.nlm.nih.gov/30101510/
- https://pubmed.ncbi.nlm.nih.gov/36870101/
- https://pubmed.ncbi.nlm.nih.gov/24235903/
- https://pubmed.ncbi.nlm.nih.gov/32475359/
- https://pubmed.ncbi.nlm.nih.gov/22190027/
- https://pubmed.ncbi.nlm.nih.gov/24728141/
- https://pubmed.ncbi.nlm.nih.gov/23910656/
- https://pubmed.ncbi.nlm.nih.gov/28162893/
- https://pubmed.ncbi.nlm.nih.gov/27809874/
- https://pubmed.ncbi.nlm.nih.gov/28302573/
- https://pubmed.ncbi.nlm.nih.gov/16796222/
- https://pubmed.ncbi.nlm.nih.gov/14652086/
- https://pubmed.ncbi.nlm.nih.gov/25559067/
- https://pubmed.ncbi.nlm.nih.gov/23446906/
- https://pubmed.ncbi.nlm.nih.gov/30968140/
- https://pubmed.ncbi.nlm.nih.gov/28009784/
- https://pubmed.ncbi.nlm.nih.gov/30374942/
- https://pubmed.ncbi.nlm.nih.gov/27631616/
- https://pubmed.ncbi.nlm.nih.gov/36829490/
- https://pubmed.ncbi.nlm.nih.gov/26174323/
- https://pubmed.ncbi.nlm.nih.gov/26825447/
- https://pubmed.ncbi.nlm.nih.gov/24946991/
- https://pubmed.ncbi.nlm.nih.gov/22777991/
- https://pubmed.ncbi.nlm.nih.gov/28292654/
