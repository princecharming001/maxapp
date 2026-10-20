# SleepMax

## What it is
SleepMax tunes the biology that decides when you get sleepy and how deep your sleep runs. The body clock is set mainly by light reaching the eyes (bright mornings, dim evenings) and by a steady wake time. Sleep pressure is built by adenosine, which caffeine blocks for many hours. And sleep starts on the evening drop in core temperature and arousal: a warm shower, a cool dark room and slow breathing help it, while alcohol, big late meals and hard late workouts push it back. Each habit pulls one of these levers around your real wake and bed times. It is about consistency, not perfection, and it is not a treatment for any sleep disorder.

## Who it fits / who should check with a professional first
Fits: adults who want steadier, deeper-feeling sleep; people with irregular schedules or weekend drift; anyone who leans on late caffeine, bright evenings or late hard workouts.

Check with a professional first (the app suggests this, never diagnoses):
- Trouble falling or staying asleep 3+ nights a week for 3+ months with daytime impairment (possible chronic insomnia): CBT-I with a clinician is first-line.
- Loud snoring, gasping, pauses in breathing, morning headaches, or dozing while driving (possible sleep apnea): get evaluated; never tape the mouth.
- Heart or blood-pressure condition, low blood pressure, fainting, epilepsy, or pregnancy: no hot showers, baths or saunas (`warm_shower` comes off for them).
- Rotating night-shift workers: light and caffeine timing need a shift-specific plan.
- Bipolar disorder or a history of mania: never sleep restriction; large shifts in light or sleep timing only with their clinician.
- Pregnancy, new parents, or medicines that affect sleep or alertness: keep habits gentle; never change medication.
- Restless legs, acting out dreams, or sudden sleep attacks: see a clinician.

## Habit library

### `fixed_wake_time` — Same wake time daily
- minutes: 0 / 0
- kind: rule
- lever: sleep
- anchor: wake (their usual wake time; weekends within 60 min)
- frequency: daily
- tier: core
- avoid if: none
- why: In 60,977 adults wearing trackers, the most regular sleepers had 20–48% lower all-cause mortality than the least regular, and irregular sleepers' melatonin rhythm ran about 2.5 h later.
- how: 1) Get up at your usual wake time, weekends included (within about an hour). 2) After a bad night, still get up on time and skip the lie-in; a short early nap is the fallback. 3) Open the curtains or step outside as you get up so light lands at the same time each day.
- conflicts/synergies: Anchors `morning_light` (here and EnergyMax). Same idea as LongevityMax `sleep_regularity`; schedule once. FitMax: avoid early sessions that force a much earlier wake on only some days.
- source: https://pubmed.ncbi.nlm.nih.gov/37738616/

### `morning_light` — Morning outdoor light
- minutes: 5 / 10
- kind: action
- lever: light
- after: water_on_waking
- anchor: wake (within 60 min of waking; an outdoor commute counts)
- frequency: daily
- tier: core
- avoid if: none
- why: Experts recommend at least 250 melanopic lux at the eye by day, which outdoor daylight easily beats even when overcast, and a weekend in natural light moved the body clock earlier.
- how: 1) Step outside within an hour of waking (after your glass of water, if that's in your plan). 2) Walk, have your coffee or commute on foot for 5–15 minutes; stay longer when it's cloudy. 3) Face the open sky, never the sun; leave sunglasses off if it's comfortable and safe.
- conflicts/synergies: Same habit as EnergyMax and FocusMax `morning_light`; schedule once. Water first, then light. Early-morning UV is usually below 3. Steps count toward `daily_steps`.
- source: https://pubmed.ncbi.nlm.nih.gov/35298459/

### `caffeine_cutoff` — Caffeine cutoff
- minutes: 0 / 0
- kind: rule
- lever: caffeine
- anchor: afternoon (about 9 h before bed by default, never under 6 h; 13 h for pre-workouts)
- frequency: daily
- tier: core
- avoid if: none
- why: Across 24 studies caffeine cut total sleep by 45 min and deep sleep by 11 min; a coffee needed about 9 h before bed and a pre-workout serve about 13 h to spare sleep.
- how: 1) From now on switch to water, decaf or caffeine-free tea. 2) Count hidden caffeine: pre-workouts, energy drinks, cola, some pain relievers. 3) If you need a lift later, take a 5-minute walk outside instead.
- conflicts/synergies: Same rule as EnergyMax and FocusMax `caffeine_cutoff`; the stricter cutoff wins. FitMax `preworkout_caffeine` only applies to sessions that start before it.
- source: https://pubmed.ncbi.nlm.nih.gov/36870101/

### `dim_evening_light` — Dim the lights for the evening
- minutes: 1 / 2
- kind: action
- lever: light
- anchor: wind_down (starts 2–3 h before bed)
- frequency: daily
- tier: core
- avoid if: none
- why: Ordinary room light in the evening delayed melatonin onset in 99% of people and cut the melatonin night by about 90 min versus dim light; half of the suppression already happens at about 25 lux.
- how: 1) Switch off the overhead lights and turn on one or two low lamps below eye level. 2) Pick the warmest, dimmest setting you have, and drop your screens to night mode and low brightness. 3) Keep bathroom and hallway trips dim for the rest of the evening.
- conflicts/synergies: `screens_off` and `wind_down` fall inside this window. CalmMax `screen_free_evening` shares the evening slot. The Skin & Hair PM routine works fine under a low lamp.
- source: https://pubmed.ncbi.nlm.nih.gov/21193540/

### `screens_off` — Screens off before bed
- minutes: 1 / 2
- kind: action
- lever: light
- anchor: pre_bed (30–60 min before bed; at or before the start of `wind_down`)
- frequency: daily
- tier: medium
- avoid if: none
- why: Reading on a light-emitting tablet before bed for 5 nights, versus a printed book, lowered melatonin, delayed the body clock, slowed sleep onset and left people less alert next morning.
- how: 1) Put the phone on its charger across the room or outside the bedroom. 2) Switch to paper, audio or stretching. 3) If you must use a screen later, lowest brightness with night mode, held farther away.
- conflicts/synergies: Same as CalmMax `screen_free_evening`; schedule once. Its time is never after the `wind_down` start.
- source: https://pubmed.ncbi.nlm.nih.gov/25535358/

### `warm_shower` — Warm shower or bath before bed
- minutes: 10 / 15
- kind: action
- lever: temperature
- anchor: wind_down (ending 1–2 h before bed)
- frequency: 4–5 times a week (daily when falling asleep is the main issue)
- tier: medium
- avoid if: pregnancy, heart condition or high blood pressure, low blood pressure, fainting, epilepsy
- why: In a meta-analysis, a 40–42.5 °C shower or bath for as little as 10 minutes, 1–2 h before bed, shortened time to fall asleep (about 10 minutes) and raised sleep efficiency.
- how: 1) Shower or bathe comfortably hot, not scalding, for about 10 minutes. 2) Let your hands and feet warm through; dry off without a cold rinse. 3) Move into your dim, cool room routine, and stand up slowly if you feel light-headed.
- conflicts/synergies: Can double as the Skin & Hair PM cleanse slot (keep face water lukewarm). Never the same evening as CalmMax `heat_session`, LongevityMax `sauna_session` or FitMax `sauna_after_training`, or after alcohol. No cold water in this window.
- source: https://pubmed.ncbi.nlm.nih.gov/31102877/

### `bedroom_setup` — Cool, dark, quiet room
- minutes: 5 / 10
- kind: setup
- lever: temperature
- anchor: weekend (first weekend)
- frequency: once (week 1)
- tier: core
- avoid if: none
- why: Heat in the bedroom increases wakefulness and cuts deep and REM sleep, and one night with a 100-lux light on raised night heart rate and next-morning insulin resistance.
- how: 1) Set the thermostat or window so the room is cool at night (about 18–20 °C / 65–68 °F is a common target; adjust to your bedding). 2) Make it dark: close curtains fully, cover or turn away LEDs, and use an eye mask or folded cloth if light leaks in. 3) Cut noise with earplugs you already have, a closed door or a fan; phone face-down across the room.
- conflicts/synergies: Sets up `dim_evening_light`. Earplugs and an eye mask helped sleep in lab studies with ICU-level noise. Continuous white noise is not scheduled (weak evidence).
- source: https://pubmed.ncbi.nlm.nih.gov/22738673/

### `wind_down` — Slow-breathing wind-down
- minutes: 5 / 10
- kind: action
- lever: breathing
- anchor: wind_down (30–60 min before bed, after `screens_off`)
- frequency: daily
- tier: core
- avoid if: none
- why: In people with insomnia, 20 minutes of paced breathing at 6 breaths a minute before bed raised vagal activity, shortened sleep onset and reduced night wakings (a small study).
- how: 1) Lights low, phone already away. 2) Sit or lie down and breathe slowly through the nose, in for about 4 seconds and out for about 6, for 5–10 minutes. 3) Finish with gentle stretching or a paper book in dim light, and go to bed when sleepy.
- conflicts/synergies: Same technique as CalmMax `slow_belly_breathing`; one evening breathing slot. The Skin & Hair PM routine and `scalp_massage` fit just before it.
- source: https://pubmed.ncbi.nlm.nih.gov/25234581/

### `alcohol_buffer` — Alcohol buffer before bed
- minutes: 0 / 0
- kind: rule
- lever: compound
- anchor: dinner (only on days they drink)
- frequency: only on drinking days
- tier: medium
- avoid if: none
- why: Across 27 studies REM sleep dropped after about two drinks and worsened with dose, and in 4,098 workers HRV-measured overnight recovery fell 9, 24 and 39 points at low, moderate and high intake.
- how: 1) If you drink, finish at least 3 hours before bed. 2) Alternate each drink with a glass of water. 3) Never use alcohol to fall asleep.
- conflicts/synergies: Merges with LongevityMax `alcohol_awareness`. No `warm_shower` or sauna on drinking evenings.
- source: https://pubmed.ncbi.nlm.nih.gov/39631226/

### `late_meal_buffer` — Finish big meals earlier
- minutes: 0 / 0
- kind: rule
- lever: nutrition
- anchor: dinner
- frequency: daily
- tier: medium
- avoid if: none
- why: The same dinner eaten 1 h instead of 5 h before bed raised overnight blood sugar and cortisol and lowered fat burning in a randomized crossover trial.
- how: 1) Make dinner the last big meal, finished 2–3 hours before bed. 2) If dinner runs late, keep it smaller and lower in sugar and fat. 3) If you're hungry later, a small protein snack is fine.
- conflicts/synergies: Pairs with EnergyMax `post_meal_walk`. Late FitMax sessions get a small protein snack, not a big meal. Not a fasting rule.
- source: https://pubmed.ncbi.nlm.nih.gov/32525525/

### `exercise_timing` — Hard training ends earlier
- minutes: 0 / 0
- kind: rule
- lever: movement
- anchor: workout (applies to FitMax and LongevityMax hard sessions)
- frequency: on hard training days
- tier: core
- avoid if: none
- why: In 14,689 wearable users, maximal-strain workouts ending 2 h before bed delayed sleep onset 36 min and cut HRV 14%, while sessions ending 4+ h before bed showed no effect.
- how: 1) End intervals and heavy lifting at least 2 hours before bed, ideally 4. 2) If evening is the only slot, keep the last 2 hours to easy movement. 3) After a late session, cool down for 10 minutes and shower warm, not cold.
- conflicts/synergies: Constrains FitMax `strength_full_body` and `vigorous_intervals` and LongevityMax `interval_4x4`. Moderate evening cardio is fine.
- source: https://pubmed.ncbi.nlm.nih.gov/40234380/

### `twenty_minute_rule` — Get up if awake
- minutes: 0 / 0
- kind: rule
- lever: sleep
- anchor: pre_bed (a rule for the night, not a scheduled task)
- frequency: only when it happens
- tier: medium
- avoid if: none
- why: Stimulus control, which uses about 20 minutes awake as the cue to leave the bed and return only when sleepy, is a recommended insomnia treatment in the AASM's 2021 guideline.
- how: 1) If you've been awake for what feels like 20 minutes, get up. 2) Sit somewhere dim and do something quiet (paper book, slow breathing). 3) Go back to bed only when sleepy; don't check the clock.
- conflicts/synergies: Pairs with `wind_down`. If this happens most nights for 3+ months, suggest a CBT-I clinician.
- source: https://pubmed.ncbi.nlm.nih.gov/33164742/

### `nap_rule` — Short early naps only
- minutes: 10 / 20
- kind: rule
- lever: sleep
- anchor: afternoon (early afternoon, at least 7 h before bed)
- frequency: as needed
- tier: hard
- avoid if: none
- why: After a short night a 10-minute nap improved alertness at once while a 30-minute nap brought grogginess first, and naps of 60+ minutes a day are linked to 27% higher mortality.
- how: 1) Nap only if you're genuinely sleepy. 2) Keep it to 20 minutes or less, and get up even if you didn't fall asleep. 3) Get some light and move for a few minutes afterwards.
- conflicts/synergies: Governs FocusMax and EnergyMax `power_nap` and CalmMax `body_scan` (one rest slot a day). No naps when falling asleep is the main issue.
- source: https://pubmed.ncbi.nlm.nih.gov/16796222/

### `sleep_log` — Morning sleep check-in
- minutes: 1 / 1
- kind: checkin
- lever: tracking
- anchor: wake
- frequency: daily for 2 weeks, then 3 times a week
- tier: medium
- avoid if: none
- why: Consumer trackers detect sleep well but spot wake poorly and are inconsistent on stages, and chasing perfect scores can itself worsen sleep, so log a few simple signals and watch weekly trends.
- how: 1) Rate how rested you feel, 1–5. 2) Tap last night's factors: late caffeine, alcohol, late meal, late hard workout, bright evening. 3) If you wear a tracker, add resting heart rate or HRV only and skip the stage breakdown.
- conflicts/synergies: Same morning number as FitMax `readiness_check` and CalmMax `stress_checkin` (one card). Never presented as diagnostic.
- source: https://pubmed.ncbi.nlm.nih.gov/33378539/

## What the AI needs to know (intake)
The profile already has wake and bed times, work, meals and workout time; don't ask them.

1. `sleep_main_issue` (required) — Which levers lead: falling asleep → `dim_evening_light`, `warm_shower`, `caffeine_cutoff`; waking at night → `alcohol_buffer`, `bedroom_setup`, `late_meal_buffer`; waking tired → `fixed_wake_time`, `morning_light`, `sleep_log`; schedule → the wake anchor and light; snoring → a clinician referral first.
   Q: "What's the biggest sleep thing you'd like to fix?" Options: Falling asleep | Waking up at night | Waking up tired | My schedule is all over the place | Snoring or gasping at night
2. `caffeine_last_time` (required) — Sets the cutoff and whether to taper it.
   Q: "When's your last caffeine on a typical day?" Options: Before noon | Noon–3 pm | After 3 pm | I don't have caffeine
3. `health_flags` (required, multi) — Removes `warm_shower` for heart or blood-pressure conditions, pregnancy, seizures or fainting (shared across programs).
   Q: "Do any of these apply to you?" Options: None of these | Heart or blood-pressure condition | Pregnant or breastfeeding | Pain or injury | Raynaud's or cold sensitivity | Panic attacks, seizures or fainting | Prefer not to say
4. `drinks_alcohol` (optional) — Whether `alcohol_buffer` appears.
   Q: "Do you usually have alcohol in the evening?" Options: Rarely or never | 1–2 nights a week | 3+ nights a week | Prefer not to say
5. `wears_tracker` (optional) — The `sleep_log` variant, and FitMax `readiness_check` (shared).
   Q: "Do you wear something that tracks your sleep or heart rate at night?" Options: Yes, most nights | Sometimes | No

## Scheduling rules
- Everything is placed relative to their wake and bed times. Never move bedtime earlier by more than 15 min a week.
- Wake anchor every day; weekends within 60 min.
- Light: `morning_light` within 60 min of waking, after `water_on_waking`. `dim_evening_light` starts 2–3 h before bed. `screens_off` 30–60 min before bed, at or before the `wind_down` start.
- Caffeine: cutoff 9 h before bed by default (never under 6 h); 13 h for pre-workout-sized doses. If their last caffeine is later now, move it back about 1 h a week.
- Alcohol finished at least 3 h before bed; the big meal finished 2–3 h before bed.
- Heat: `warm_shower` ends 1–2 h before bed. On sauna evenings it's skipped; never both.
- Cold: no cold plunges or cold showers in the last 2 h before bed.
- Exercise: hard sessions end at least 2 h before bed (4 h preferred); easy movement is fine later.
- Naps: 10–20 min, at least 7 h before bed, none when the main issue is falling asleep.
- Week 1: `fixed_wake_time` and `morning_light`, plus one lead lever from `sleep_main_issue`; `bedroom_setup` once on the first weekend. Add one habit a week at 70%+ adherence.
- Time budget: about 5 min a day → rules plus light on the commute; 10–20 min → add `wind_down` and `warm_shower`; 20+ min → add `sleep_log`. Rules don't count against the budget; at most 4 visible SleepMax tasks a day.
- Bedtime after 1 am or a wake time that varies a lot: steady the wake time first.
- "Snoring or gasping": show the referral first and never present any habit as a fix.

## Safety and claims
- Never diagnose insomnia, sleep apnea, narcolepsy, restless legs or circadian disorders; refer for long-term insomnia, snoring with gasping, or dozing while driving.
- No mouth taping (10 studies, 213 patients, only 2 positive, plus an asphyxiation risk with a blocked nose and a chance of masking sleep apnea), no nasal "training" for apnea, no sleep restriction, all-nighters or "sleep less" hacks.
- No hot baths, showers or saunas for heart or blood-pressure flags, pregnancy, fainting or epilepsy. Water comfortably hot (40–42 °C), not scalding.
- Supplements (melatonin, magnesium, glycine, tart cherry) live only in Suppmax. Never discuss sleep medication or antihistamines, and never suggest changing medicines.
- No blue-light-glasses claims (Cochrane: the sleep effect is uncertain; dimming the room is more reliable), no red-light-at-night claims, no promises ("you'll sleep 8 hours"); use "may help".
- Alcohol and cannabis are never sleep aids. Don't drive when drowsy.
- Wearable stage data is not diagnostic; if scores cause anxiety, suggest pausing tracking.

## Sources
- https://pubmed.ncbi.nlm.nih.gov/37738616/
- https://pubmed.ncbi.nlm.nih.gov/28607474/
- https://pubmed.ncbi.nlm.nih.gov/35298459/
- https://pubmed.ncbi.nlm.nih.gov/28162893/
- https://pubmed.ncbi.nlm.nih.gov/21193540/
- https://pubmed.ncbi.nlm.nih.gov/31138694/
- https://pubmed.ncbi.nlm.nih.gov/25535358/
- https://pubmed.ncbi.nlm.nih.gov/36870101/
- https://pubmed.ncbi.nlm.nih.gov/39631226/
- https://pubmed.ncbi.nlm.nih.gov/29549064/
- https://pubmed.ncbi.nlm.nih.gov/31102877/
- https://pubmed.ncbi.nlm.nih.gov/22738673/
- https://pubmed.ncbi.nlm.nih.gov/37474050/
- https://pubmed.ncbi.nlm.nih.gov/35286195/
- https://pubmed.ncbi.nlm.nih.gov/20398302/
- https://pubmed.ncbi.nlm.nih.gov/25234581/
- https://pubmed.ncbi.nlm.nih.gov/32525525/
- https://pubmed.ncbi.nlm.nih.gov/40234380/
- https://pubmed.ncbi.nlm.nih.gov/30374942/
- https://pubmed.ncbi.nlm.nih.gov/25596964/
- https://pubmed.ncbi.nlm.nih.gov/33164742/
- https://pubmed.ncbi.nlm.nih.gov/16796222/
- https://pubmed.ncbi.nlm.nih.gov/26158892/
- https://pubmed.ncbi.nlm.nih.gov/33378539/
- https://pubmed.ncbi.nlm.nih.gov/27855740/
- https://pubmed.ncbi.nlm.nih.gov/40397877/
- https://pubmed.ncbi.nlm.nih.gov/33007706/
- https://pubmed.ncbi.nlm.nih.gov/37593770/
