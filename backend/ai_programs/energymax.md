# EnergyMax

## What it is
EnergyMax helps you feel steadier through the day with small, low-effort habits: water early, morning light, a protein-containing first meal, short movement breaks, a walk after meals, and smarter caffeine timing. The goal is fewer crashes and a gentler afternoon slump, built around your existing schedule. It is not a treatment for fatigue that has a medical cause.

## Who it fits / who should check with a professional first
Fits: busy adults who feel sluggish in the morning, crash after lunch, or lean on caffeine and sugar to get through the afternoon.

Check with a professional first:
- Ongoing tiredness that does not improve with rest, unexplained weight change, shortness of breath, fainting, or feeling low for weeks (fatigue can have medical causes such as anemia, thyroid issues or depression; the app should suggest a check-up, not guess).
- Diabetes or blood-sugar medications: meal timing and post-meal walks are generally fine, but changes to meals should go through their care team.
- Heart, kidney or liver conditions, or fluid restriction: do not push water targets.
- Pregnancy: keep caffeine low (follow their clinician); keep habits gentle.
- History of disordered eating: do not use food rules, skipping meals or tracking; keep food habits as gentle "add" habits only, or skip them.

## Habit library

### `water_on_waking` — Water on waking
- minutes: 1 / 2
- anchor: wake
- frequency: daily
- tier: core
- why: Many people start the day after 7–9 hours without fluids; regular drinks across the day support normal hydration (pale-straw urine is a simple guide).
- how: 1) Leave a full glass or bottle by the bed or kettle. 2) Drink it before coffee. 3) Refill and take it to work.
- conflicts/synergies: Stacks with `morning_light`. Do not set fixed liters for users with fluid-restricted conditions.
- source: https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/

### `morning_light` — Morning outdoor light
- minutes: 5 / 10
- anchor: wake or commute
- frequency: daily
- tier: core
- why: Daytime bright light supports alertness and sets the body clock, which helps both daytime energy and night sleep.
- how: 1) Get outside within an hour of waking. 2) Walk part of the commute or have coffee by a window or outside. 3) 5–15 min is enough.
- conflicts/synergies: Same habit as SleepMax `morning_light`; schedule once and credit both.
- source: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6751071/

### `delay_first_coffee` — Coffee after water
- minutes: 0 / 0
- anchor: get_ready
- frequency: daily
- tier: medium
- why: Pairing caffeine with water and food (not on an empty stomach and dehydrated) tends to feel smoother; the evidence for a specific "wait 90 minutes" rule is weak, so keep it flexible.
- how: 1) Have water first. 2) Have coffee with or after breakfast if possible. 3) Keep total daily caffeine moderate (FDA: up to about 400 mg/day for most healthy adults).
- conflicts/synergies: Works with SleepMax `caffeine_cutoff`. Do not make this a strict rule.
- source: https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much

### `protein_first_meal` — Protein in first meal
- minutes: 2 / 5
- anchor: their first meal: breakfast, or lunch when `first_meal_style` says they skip breakfast or have coffee only
- frequency: daily (5×/week)
- tier: core
- why: Protein and fiber make a meal more filling than a sugar-only start, and getting protein in at each meal helps people reach the daily intake that supports muscle (see FitMax).
- how: 1) Pick one protein option you like (eggs, Greek yogurt, cottage cheese, tofu, leftovers, a protein-rich bar). 2) Add fruit or whole grains. 3) If you don't eat breakfast, apply this to your first meal.
- conflicts/synergies: Synergy with FitMax `protein_each_meal`. Not a breakfast mandate: skipping breakfast is fine if the user prefers.
- source: https://bjsm.bmj.com/content/52/6/376

### `movement_snack` — Movement snack
- minutes: 2 / 3
- anchor: work_break (every 60–90 min of sitting)
- frequency: 3–6× per workday
- tier: core
- why: Breaking up sitting with short walks lowered post-meal blood sugar compared with sitting all day; short bouts also feel energizing.
- how: 1) Set a timer for every 60–90 min. 2) Walk to get water, take stairs, or do 10 squats. 3) Return to work.
- conflicts/synergies: Overlaps with FocusMax breaks and LongevityMax steps; count steps toward both.
- source: https://doi.org/10.1007/s40279-022-01649-4

### `post_meal_walk` — Walk after meals
- minutes: 5 / 10
- anchor: lunch or dinner (start within 30 min of finishing)
- frequency: daily (at least one meal)
- tier: core
- why: Light walking after eating helps blood sugar rise and fall more gently than sitting.
- how: 1) After lunch, walk for 5–15 min (around the block, a phone call while walking). 2) After dinner, a short stroll works too. 3) Easy pace.
- conflicts/synergies: Counts toward LongevityMax steps and CalmMax outdoor time. Fine in the evening for sleep (easy intensity).
- source: https://doi.org/10.1007/s40279-022-01649-4

### `lunch_balance` — Balanced lunch plate
- minutes: 0 / 2
- anchor: lunch
- frequency: 5× per week
- tier: medium
- why: Very large, refined-carb-heavy lunches are commonly followed by a slump; adding protein, vegetables and fiber makes meals more filling.
- how: 1) Fill about half the plate with vegetables or salad. 2) Add a palm of protein. 3) Choose whole grains when you can.
- conflicts/synergies: Same as LongevityMax `veg_first`. No calorie counting.
- source: https://doi.org/10.1016/S0140-6736(18)31809-9

### `slump_reset` — Afternoon slump reset
- minutes: 5 / 10
- anchor: afternoon (2–4 pm, or the user's slump time)
- frequency: daily on workdays
- tier: core
- why: Short breaks of 10 min or less increased vigor and reduced fatigue in a meta-analysis.
- how: 1) Stand up and leave the screen. 2) Get outside or by a window for 5 min, or do a brisk stair climb. 3) Drink water. 4) Optional: 10 min NSDR or a short nap if sleep is short (see rules).
- conflicts/synergies: Replaces a late coffee to protect SleepMax caffeine cutoff. Overlaps with FocusMax `nsdr_break`.
- source: https://doi.org/10.1371/journal.pone.0272460

### `caffeine_cutoff` — Caffeine cutoff
- minutes: 0 / 0
- anchor: afternoon
- frequency: daily
- tier: core
- why: Late caffeine reduces sleep without people noticing, which drains next-day energy.
- how: 1) Last caffeine at least 8 hours before bedtime (minimum 6). 2) Swap to decaf, sparkling water or herbal tea. 3) Count energy drinks and pre-workouts.
- conflicts/synergies: Shared with SleepMax; enforce the same time.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/

### `vigorous_burst` — 1-minute vigorous burst
- minutes: 1 / 2
- anchor: work_break or after_work
- frequency: 1–3× per day
- tier: medium
- why: Short bursts of vigorous daily activity (like fast stair climbing) were linked to lower mortality in non-exercisers, and they wake you up.
- how: 1) Climb stairs fast, or walk very briskly uphill, for about 1 min. 2) Or do 20 seconds of jumping jacks or squats, 3 times. 3) Stop if dizzy or in pain.
- conflicts/synergies: Same as LongevityMax `stair_snack`. Not within 1 hour of bed. Skip for users with heart conditions unless cleared.
- source: https://doi.org/10.1038/s41591-022-02100-x

### `water_bottle_refill` — Midday refill
- minutes: 1 / 1
- anchor: lunch
- frequency: daily
- tier: medium
- why: Spreading fluids across the day is easier than catching up at night (which can also wake you to use the bathroom).
- how: 1) Refill your bottle at lunch. 2) Finish it by mid-afternoon. 3) Taper fluids in the last 1–2 hours before bed.
- conflicts/synergies: Pairs with SleepMax (fewer night wakings).
- source: https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/

### `energy_check_in` — Energy check-in
- minutes: 1 / 1
- anchor: afternoon
- frequency: daily for 2 weeks, then 3×/week
- tier: hard
- why: Logging when you dip shows whether sleep, lunch or caffeine is the main driver, so the plan can adapt.
- how: 1) Rate energy 1–5. 2) Tap the likely cause (short sleep, big lunch, long sitting, stress). 3) Review weekly.
- conflicts/synergies: Feeds plan tuning across SleepMax and FocusMax.
- source: https://doi.org/10.1371/journal.pone.0272460

### `outdoor_lunch` — Lunch outside
- minutes: 10 / 15
- anchor: lunch
- frequency: 2–3× per week
- tier: hard
- why: Combines daylight, a walk and a real break from screens.
- how: 1) Take lunch outside or walk to get it. 2) Leave the phone in your pocket. 3) 10–15 min.
- conflicts/synergies: Counts as CalmMax `outdoor_walk` and LongevityMax steps.
- source: https://doi.org/10.1038/s41598-019-44097-3

## What the AI needs to know (intake)
1. `slump_time` (required) — Places the slump reset and caffeine swap at the right time.
   Q: "When does your energy dip the most?" Options: Mornings | After lunch | Late afternoon | Evenings | It's pretty steady
2. `caffeine_pattern` (required) — Sets cutoff strictness and whether to taper.
   Q: "How much caffeine do you have on a typical day?" Options: None | 1 cup | 2–3 cups | 4+ or energy drinks
3. `first_meal_style` (required) — Decides how to frame the protein habit (breakfast vs first meal vs skip).
   Q: "What does your morning eating look like?" Options: Real breakfast | Something quick | Coffee only | I eat later in the day
4. `can_walk_after_lunch` (optional) — Decides whether post-meal walks go after lunch or dinner.
   Q: "Could you take a short walk after lunch on workdays?" Options: Yes, most days | Sometimes | Not really
5. `sitting_hours` (optional) — Sets the number of movement snacks.
   Q: "How much of your workday is spent sitting?" Options: Most of it | About half | I'm on my feet a lot

## Scheduling rules
- Water on waking at wake time; morning light within 60 min of wake (share with SleepMax).
- Caffeine: cutoff at least 8 hours before bed (minimum 6). Prefer caffeine after water or food. Never schedule a caffeine habit after the cutoff.
- Post-meal walk: start within 30 min after the user's stored meal time; easy intensity.
- Movement snacks: every 60–90 min inside work hours; skip during meetings marked busy; max 6 per day.
- Slump reset: at the user's `slump_time` (default 2:30–3:30 pm). Any nap ends 7+ hours before bed and lasts ≤20 min.
- Vigorous bursts: not within 1 hour of bed; not on the same hour as a FitMax hard session.
- Fluids: taper in the last 1–2 hours before bed.
- Week 1 ramp: `water_on_waking`, `morning_light`, plus one of `post_meal_walk` or `slump_reset` (by `slump_time`). Add `protein_first_meal` and `movement_snack` in week 2.
- Scaling: ~5 min → water, light (commute), caffeine rule. 10–20 min → add post-meal walk and slump reset. 20+ min → add movement snacks, outdoor lunch, bursts, check-in.
- Weekend: keep water and light; swap work-break movement snacks for one longer walk; slump reset optional.

## Safety and claims
- Do not diagnose causes of fatigue (anemia, thyroid, sleep apnea, depression, long COVID). If fatigue is persistent or severe, suggest a check-up.
- Energymax plans never include supplements (electrolytes live in Suppmax, information only). No energy-drink recommendations, "adrenal fatigue" claims, IV drips, stimulants or nootropics. No caffeine pills.
- No fasting protocols, meal skipping or calorie targets. No blood-glucose claims beyond "may help smooth the rise after meals"; no CGM interpretation.
- Never set fixed water volumes for people with heart, kidney or liver conditions or fluid restrictions; never push very large fluid intakes.
- Caffeine: never above about 400 mg/day framing; for pregnancy, defer to their clinician.
- No promises like "never crash again" or "double your energy".

## Sources
- https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6751071/
- https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much
- https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/
- https://doi.org/10.1007/s40279-022-01649-4
- https://doi.org/10.1371/journal.pone.0272460
- https://doi.org/10.1038/s41591-022-02100-x
- https://doi.org/10.1016/S0140-6736(18)31809-9
- https://bjsm.bmj.com/content/52/6/376
- https://doi.org/10.1038/s41598-019-44097-3
