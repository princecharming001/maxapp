# SleepMax

## What it is
SleepMax is a set of small daily habits that help you keep a steady sleep schedule and set your body clock: morning light, sensible caffeine and alcohol timing, a short wind-down, and a bedroom set up for sleep. It is about consistency, not perfection, and it works around your real wake and bed times. It is not a treatment for any sleep disorder.

## Who it fits / who should check with a professional first
Fits: adults who want more regular, better-feeling sleep; people with irregular schedules or weekend "catch-up" habits; anyone who relies on late caffeine or screens to stay up.

Check with a professional first (the app should suggest this, not diagnose):
- Ongoing trouble falling or staying asleep for 3+ nights a week for 3+ months, or daytime impairment (possible insomnia; CBT-I with a clinician is the first-line approach, not an app plan).
- Loud snoring, gasping or pauses in breathing, or falling asleep while driving (possible sleep apnea or other disorder).
- Shift workers on rotating nights: standard light/caffeine timing rules may not apply; keep habits generic.
- Pregnancy, new parents, or anyone taking medications that affect sleep or alertness: keep habits gentle; do not suggest changing medication.
- Bipolar disorder or a history of mania: sleep restriction and big schedule shifts can be risky. Never schedule sleep restriction.

## Habit library

### `fixed_wake_time` — Same wake time daily
- minutes: 0 / 0 (it is an anchor, not a task)
- kind: rule
- anchor: wake
- frequency: daily (including weekends, within 60 min)
- tier: core
- why: A regular sleep-wake pattern is tied to better health outcomes, and a fixed wake time is the strongest lever on your body clock.
- how: 1) Pick a wake time that works on workdays. 2) Keep weekends within about 1 hour of it. 3) If you slept badly, still get up at the usual time and skip the lie-in.
- conflicts/synergies: Anchors EnergyMax morning light and LongevityMax sleep regularity. Avoid scheduling early workouts that force a much earlier wake on only some days.
- source: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10782489/

### `morning_light` — Morning outdoor light
- minutes: 5 / 10
- kind: action
- after: water_on_waking
- anchor: wake (within 60 min of waking); commute counts if outdoors
- frequency: daily
- tier: core
- why: Bright light early in the day is the main signal that sets the body clock and supports earlier, easier sleep onset.
- how: 1) Step outside within an hour of waking (after your glass of water, if that is in your plan); on cloudy days stay toward the longer end. 2) Walk, have your coffee, or commute on foot for 5–15 min. 3) Do not stare at the sun; sunglasses off if comfortable and safe.
- conflicts/synergies: Same habit as EnergyMax `morning_light`; schedule once and credit both. When EnergyMax `water_on_waking` is also on, water comes first and light follows; neither has to happen before everything else. Pairs with CalmMax outdoor walk.
- source: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6751071/

### `caffeine_cutoff` — Caffeine cutoff
- minutes: 0 / 0 (a rule plus a reminder)
- kind: rule
- anchor: lunch or afternoon (reminder fires at cutoff time)
- frequency: daily
- tier: core
- why: In a lab study, caffeine taken even 6 hours before bed cut measured sleep by about an hour, and people did not notice.
- how: 1) Set the cutoff 8 hours before usual bedtime (never fewer than 6). 2) Switch to decaf, tea without caffeine, or water after it. 3) Watch for hidden caffeine (pre-workout, energy drinks, cola, some pain relievers).
- conflicts/synergies: Shared with EnergyMax and FocusMax caffeine habits; the stricter cutoff wins. Late workouts with pre-workout drinks break this rule.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/

### `alcohol_buffer` — Alcohol buffer before bed
- minutes: 0 / 0
- kind: rule
- anchor: dinner
- frequency: on days the user drinks (reminder only if they said they drink)
- tier: medium
- why: Alcohol can make you drowsy but tends to break up sleep in the second half of the night and suppress REM sleep.
- how: 1) If drinking, finish at least 3 hours before bed. 2) Alternate with water. 3) Do not use alcohol as a sleep aid.
- conflicts/synergies: Supports LongevityMax and SkinHair. Never frame drinking as a habit to schedule.
- source: https://doi.org/10.1111/acer.12006

### `wind_down` — Wind-down routine
- minutes: 10 / 20
- kind: action
- anchor: wind_down (starts 30–60 min before bed)
- frequency: daily
- tier: core
- why: A consistent, calm pre-sleep routine and less bright light in the evening make it easier to fall asleep.
- how: 1) Screens away: dim the lights and put the phone and laptop out of reach. 2) Finish small chores and lay out what you need for tomorrow. 3) Do something calm: reading, stretching, a shower.
- conflicts/synergies: `screens_off` is a rule whose time is at or before the start of this wind-down (never after it), so step 1 simply confirms screens are already away. Merge with CalmMax `screen_free_evening` and FocusMax `shutdown_ritual` (shutdown earlier, wind-down later). SkinHair PM routine fits inside it.
- source: https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/

### `screens_off` — Screens off before bed
- minutes: 0 / 0 (a boundary)
- kind: rule
- anchor: pre_bed (30–60 min before bed)
- frequency: daily (start 4×/week if resistant)
- tier: medium
- why: Bright light and engaging content late at night delay sleepiness; AASM advises devices off at least 30 min before bed.
- how: 1) At this time, put the phone on its charger outside the bedroom or across the room. 2) Swap scrolling for a paper book or audio. 3) Use a regular alarm clock if needed.
- conflicts/synergies: Same as CalmMax `screen_free_evening`; count once. Its time is at or before the start of SleepMax `wind_down`, never after it, because wind-down step 1 is screens away.
- source: https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/

### `bedroom_setup` — Cool, dark, quiet room
- minutes: 5 / 10 (one-time setup)
- kind: setup
- anchor: weekend (first weekend)
- frequency: once in week 1 (if sleep slips later, re-check the room during a weekly review; not a weekly task)
- tier: core
- why: A cool, dark, quiet room supports sleep; many sources suggest roughly 65–68°F (18–20°C).
- how: 1) Block light (curtains or an eye mask). 2) Reduce noise (earplugs, fan, white noise). 3) Set the thermostat cooler at night or use lighter bedding.
- conflicts/synergies: None. Low effort, high leverage; good week-1 win.
- source: https://www.health.harvard.edu/healthy-aging-and-longevity/sleep-hygiene-simple-practices-for-better-rest

### `late_meal_buffer` — Finish big meals earlier
- minutes: 0 / 0
- kind: rule
- anchor: dinner
- frequency: daily
- tier: medium
- why: Large meals close to bedtime can disrupt sleep; a light snack is fine if hungry.
- how: 1) Aim to finish dinner 2–3 hours before bed. 2) If dinner has to be late, keep it lighter. 3) Keep a small snack option for genuine hunger.
- conflicts/synergies: Pairs with EnergyMax `post_meal_walk`. Do not frame as fasting or calorie restriction.
- source: https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/

### `exercise_timing` — Train earlier when possible
- minutes: 0 / 0 (a placement rule on FitMax sessions)
- kind: rule
- anchor: n/a (applies to FitMax/LongevityMax sessions)
- frequency: per session
- tier: core
- why: Moderate evening exercise does not seem to hurt sleep, but vigorous exercise ending about 1 hour before bed may.
- how: 1) Prefer workouts that end 2+ hours before bed. 2) If evening is the only option, keep the last hour easy (walk, mobility). 3) Move hard intervals earlier.
- conflicts/synergies: Direct constraint on FitMax hard sessions. Daytime activity generally helps sleep.
- source: https://pubmed.ncbi.nlm.nih.gov/30374942/

### `twenty_minute_rule` — Get up if awake
- minutes: 0 / 10 (only when it happens)
- kind: rule
- anchor: pre_bed (education card, not a scheduled task)
- frequency: as needed
- tier: medium
- why: Lying awake in bed for a long time can make bed feel like a place for being awake; AASM advises getting up after about 20 min.
- how: 1) If you cannot sleep after roughly 20 min, get up. 2) Do something quiet in dim light. 3) Go back when sleepy. Do not clock-watch.
- conflicts/synergies: If this is happening most nights for weeks, suggest talking to a clinician (insomnia).
- source: https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/

### `worry_list` — Tomorrow list
- minutes: 3 / 5
- kind: action
- anchor: wind_down
- frequency: daily (or 3×/week)
- tier: medium
- why: Writing a specific plan for unfinished tasks reduced intrusive thoughts about them in lab studies.
- how: 1) Write tomorrow's top tasks and any worries on paper. 2) Add one next step for each. 3) Close the notebook.
- conflicts/synergies: Same as FocusMax `shutdown_ritual`; if both are on, merge into one task.
- source: https://doi.org/10.1037/a0024192

### `nap_rule` — Short early naps only
- minutes: 10 / 20
- kind: rule
- anchor: afternoon (before ~3 pm or 7+ hours before bed)
- frequency: optional, as needed
- tier: hard
- why: Brief naps (about 10 min) restored alertness after short sleep with little grogginess; long or late naps can push bedtime later.
- how: 1) Only nap if needed. 2) Set a 20-min alarm (allowing time to fall asleep). 3) No naps within 7 hours of bed.
- conflicts/synergies: Overlaps with EnergyMax `slump_reset` and FocusMax NSDR. Skip naps if the user reports trouble falling asleep.
- source: https://doi.org/10.1093/sleep/29.6.831

### `weekend_anchor` — Limit weekend drift
- minutes: 0 / 0
- kind: rule
- anchor: weekend
- frequency: Saturday and Sunday
- tier: core
- why: Big shifts in sleep timing between workdays and weekends ("social jetlag") are linked to worse sleep and wellbeing.
- how: 1) Keep weekend wake within about 1 hour of weekday wake. 2) If tired, add a short early-afternoon nap rather than a long lie-in. 3) Still get morning light.
- conflicts/synergies: Applies to all programs' weekend scheduling.
- source: https://doi.org/10.1080/07420520500545979

### `sleep_log` — 30-second sleep check-in
- minutes: 1 / 1
- kind: checkin
- anchor: wake
- frequency: daily for 2 weeks, then 3×/week
- tier: hard
- why: A simple log shows patterns (late caffeine, late screens) and gives the planner feedback.
- how: 1) Rate last night's sleep 1–5. 2) Note bedtime, wake time and one factor (late caffeine, late screens, stress). 3) Glance at the last few entries to spot a pattern.
- conflicts/synergies: Feeds plan adjustments. Never present it as a diagnostic tool.
- source: https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/

## What the AI needs to know (intake)
The general profile already has wake/bed, work hours, commute, meals, workout time and minutes/day. Ask only these, in order:

1. `sleep_main_issue` (required) — Decides which habits lead (falling asleep → wind-down, screens, caffeine; waking at night → alcohol, late meals, room; schedule → wake anchor, light).
   Q: "What's the biggest sleep thing you'd like to fix?" Options: Falling asleep | Waking up at night | Waking up tired | My schedule is all over the place
2. `caffeine_last_time` (required) — Sets how hard the caffeine cutoff needs to work and whether to taper.
   Q: "When's your last caffeine on a typical day?" Options: Before noon | Noon–3 pm | After 3 pm | I don't have caffeine
3. `weekend_wake_shift` (required) — Sets the weekend anchor and whether to ramp slowly.
   Q: "How much later do you wake on weekends?" Options: Same time | About 1 hour | 2+ hours
4. `evening_screens` (optional) — Sets the strength of screens-off and wind-down.
   Q: "What's usually the last thing you do before sleep?" Options: Phone or laptop | TV | Reading or quiet stuff | Varies
5. `drinks_alcohol` (optional) — Decides whether to show the alcohol buffer at all.
   Q: "Do you usually have alcohol in the evening?" Options: Rarely or never | 1–2 nights a week | 3+ nights a week | Prefer not to say

## Scheduling rules
- Wake anchor first: everything is placed relative to the user's stored wake and bed times. Never move the user's bedtime earlier by more than 15 min per week.
- Morning light: within 60 min of wake; use the commute if it is outdoors (walk, bike, transit stop).
- Caffeine cutoff: at least 8 hours before bedtime by default (minimum 6). If the user's current last caffeine is later, move it back about 1 hour per week rather than all at once.
- Alcohol: finish at least 3 hours before bed when drinking (reminder only if the user drinks).
- Big meals: finish 2–3 hours before bed when possible.
- Vigorous exercise: should end at least 2 hours before bed; nothing more than easy movement in the last hour.
- Wind-down: starts 30–60 min before bed; screens off at least 30 min before bed. `screens_off` is a rule whose time is at or before the wind-down start, never after it (wind-down step 1 is screens away).
- Naps: 10–20 min, and not within 7 hours of bedtime.
- Week 1 ramp: 2–3 habits only: `fixed_wake_time`, `morning_light`, plus either `caffeine_cutoff` or `wind_down` (based on `sleep_main_issue`). Do `bedroom_setup` once on the first weekend. Add 1 habit per week if adherence is 70% or more.
- Scaling by time budget (SleepMax's share): about 5 min → wake anchor, light (on commute), caffeine rule. 10–20 min → add wind-down and tomorrow list. 20+ min → add sleep log, longer wind-down with stretching or reading, weekend check.
- Many SleepMax habits are rules (0 min). Do not count them against the time budget, but cap visible daily tasks at 4 for this program.
- Weekend handling: keep the wake anchor within 60 min; move morning light to a walk; the bedroom setup happens once, on the first weekend only; a short weekly review is fine.
- If the user's bed time is after 1 am or wake time changes a lot by day, do not try to fix it fast. Steady the wake time first.

## Safety and claims
- Do not diagnose insomnia, sleep apnea, narcolepsy, restless legs or circadian rhythm disorders. If the user describes snoring with gasping, falling asleep while driving, or long-term insomnia, suggest seeing a clinician or an accredited sleep center.
- Sleepmax plans never include supplements or medications; supplements (melatonin, magnesium) live in Suppmax, which explains and times them but never doses past the label. Never discuss sleep medications or antihistamines as sleep aids, and never suggest stopping or changing medications.
- Never schedule sleep restriction, all-nighters or "sleep hacking" to sleep less.
- Do not promise outcomes ("you'll sleep 8 hours", "cure your insomnia"). Use "may help" and "many people find".
- No drowsy-driving advice except: do not drive if you feel drowsy.
- Do not frame alcohol or cannabis as sleep aids.
- For shift workers, keep advice general and suggest an occupational health or sleep professional for night-shift plans.

## Sources
- https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/
- https://aasm.org/late-afternoon-and-early-evening-caffeine-can-disrupt-sleep-at-night/
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6751071/
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10782489/
- https://doi.org/10.1111/acer.12006
- https://pubmed.ncbi.nlm.nih.gov/30374942/
- https://www.health.harvard.edu/healthy-aging-and-longevity/sleep-hygiene-simple-practices-for-better-rest
- https://doi.org/10.1037/a0024192
- https://doi.org/10.1093/sleep/29.6.831
- https://doi.org/10.1080/07420520500545979
