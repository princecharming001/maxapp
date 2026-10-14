# FocusMax

## What it is
FocusMax helps busy people protect attention for the work that matters: a 2-minute plan for the day's top 3, one protected deep-work block, phone-free time, real breaks, and a short shutdown at the end of the workday. Most habits sit inside work hours as calendar-style tasks, so they add structure without adding much time. It is a productivity routine, not a treatment for attention conditions.

## Who it fits / who should check with a professional first
Fits: knowledge workers, students, founders and parents who feel scattered, interrupted or unable to finish important work.

Check with a professional first:
- Long-standing attention problems since childhood that affect work, school or relationships (possible ADHD): the app can still help with structure, but suggest an assessment if the user asks about diagnosis or medication.
- Persistent low mood, anxiety or burnout signs (dread, no recovery on weekends, panic): suggest talking to a GP or mental health professional; pair with CalmMax.
- Very short sleep most nights: focus habits help less; prioritize SleepMax.
- Never suggest starting, stopping or changing stimulant or other medications.

## Habit library

### `top_three_plan` — Plan your top 3
- minutes: 2 / 5
- anchor: before_work (first 15 min of work hours)
- frequency: every workday
- tier: core
- why: Making a specific plan for unfinished goals reduced intrusive thoughts and freed attention for other tasks in lab studies.
- how: 1) Write the 3 outcomes that would make today a win (not a to-do dump). 2) Mark the one that needs deep focus. 3) Put it in the deep-work block.
- conflicts/synergies: Pairs with `shutdown_ritual` the evening before (which drafts tomorrow's 3).
- source: https://doi.org/10.1037/a0024192

### `deep_work_block` — Deep-work block
- minutes: 25 / 60 (scheduled as a work task, does not count against the habit budget beyond the 2-min start ritual)
- anchor: before_work or within work hours (the user's peak time; default first 2–3 hours of work)
- frequency: 3–5× per week
- tier: core
- why: Switching between tasks leaves "attention residue" that lowers performance on the next task; one uninterrupted block avoids it.
- how: 1) Block 25–90 min on your calendar as busy. 2) One task only; close email and chat. 3) Note where you stopped before switching.
- conflicts/synergies: Requires `phone_away`. Avoid putting it right after a heavy lunch or during the user's slump time (EnergyMax).
- source: https://doi.org/10.1016/j.obhdp.2009.04.002

### `phone_away` — Phone in another room
- minutes: 0 / 0 (a setup action at the block start)
- anchor: start of deep-work block
- frequency: every deep-work block
- tier: core
- why: Having your own phone on the desk, even face down and silent, lowered working-memory performance compared with leaving it in another room.
- how: 1) Put the phone in another room or a bag out of sight. 2) Turn on Focus/Do Not Disturb with emergency contacts allowed. 3) Check it at the break.
- conflicts/synergies: Same behavior as CalmMax `screen_free_evening`, applied during work.
- source: https://www.journals.uchicago.edu/doi/10.1086/691462

### `notification_cleanup` — Notification cleanup
- minutes: 5 / 10
- anchor: weekend (one-time, then monthly)
- frequency: once in week 1, then 1× per month
- tier: core
- why: In a one-week experiment, turning phone alerts off lowered reported inattention and hyperactivity compared with alerts on.
- how: 1) Turn off notifications for all apps except calls, messages from key people, and calendar. 2) Remove badge counts for email and social apps. 3) Schedule a Focus mode for work hours.
- conflicts/synergies: Supports CalmMax and SleepMax (fewer evening pings).
- source: https://www.interruptions.net/literature/Kushlev-CHI16.pdf

### `batch_inbox` — Batch email and chat
- minutes: 0 / 0 (a placement rule)
- anchor: work hours (2–4 fixed check times)
- frequency: every workday
- tier: medium
- why: Checking messages constantly creates the task switching and residue that deep work avoids.
- how: 1) Pick 2–4 check times (for example 11:00, 14:00, 16:30). 2) Close the email tab between. 3) Tell your team your response window if needed.
- conflicts/synergies: Never schedule a check inside the deep-work block.
- source: https://doi.org/10.1016/j.obhdp.2009.04.002

### `micro_break` — Real micro-break
- minutes: 3 / 5
- anchor: work_break (after each 50–90 min focus period)
- frequency: 2–4× per workday
- tier: core
- why: Breaks of 10 min or less improved vigor and reduced fatigue in a meta-analysis; longer breaks helped more after demanding work.
- how: 1) Stand up and look away from screens. 2) Walk, stretch or get water. 3) No phone scrolling during the break.
- conflicts/synergies: Same slot as EnergyMax `movement_snack`; merge them.
- source: https://doi.org/10.1371/journal.pone.0272460

### `nsdr_break` — NSDR / yoga nidra
- minutes: 10 / 15
- anchor: afternoon or lunch
- frequency: 2–5× per week
- tier: medium
- why: Guided deep-relaxation (yoga nidra, often called NSDR) is being studied for stress and recovery; early studies of 11–30 min sessions show promise.
- how: 1) Lie down or recline with headphones. 2) Play a 10–20 min guided body-scan or yoga nidra track. 3) Sit up slowly when the track ends.
- conflicts/synergies: Can replace a nap (SleepMax `nap_rule`). Same as CalmMax `body_scan`.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC12080877/

### `single_tab_rule` — One tab, one task
- minutes: 0 / 0
- anchor: during the deep-work block
- frequency: every deep-work block
- tier: medium
- why: Fewer open loops means less switching and residue.
- how: 1) Close tabs not needed for the task. 2) Keep a "later" note for stray ideas. 3) Return to the task.
- conflicts/synergies: None.
- source: https://doi.org/10.1016/j.obhdp.2009.04.002

### `shutdown_ritual` — Workday shutdown
- minutes: 3 / 5
- anchor: after_work (last 10 min of work hours)
- frequency: every workday
- tier: core
- why: Writing down open tasks with a next step reduces the mental pull of unfinished goals, which helps you switch off.
- how: 1) List what's still open and the next step for each. 2) Draft tomorrow's top 3. 3) Close the laptop and say (or tap) "done for today".
- conflicts/synergies: Merges with SleepMax `worry_list` and CalmMax evening habits.
- source: https://doi.org/10.1037/a0024192

### `caffeine_for_focus` — Time caffeine to the block
- minutes: 0 / 0
- anchor: before_work
- frequency: workdays (if the user uses caffeine)
- tier: medium
- why: Using caffeine for the morning focus block, not late afternoon, gets the benefit while protecting sleep.
- how: 1) Have caffeine with or just before the morning block. 2) Stop by the SleepMax cutoff. 3) Use a break or walk for the afternoon dip instead.
- conflicts/synergies: Bound by SleepMax `caffeine_cutoff`.
- source: https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/

### `walk_to_think` — Walking think-time
- minutes: 10 / 15
- anchor: lunch or afternoon
- frequency: 2–3× per week
- tier: hard
- why: Combines a break, light movement and outdoor time; good for problems that need loose thinking.
- how: 1) Take one question with you. 2) Walk without headphones. 3) Voice-note any ideas.
- conflicts/synergies: Counts toward LongevityMax steps and CalmMax outdoor walk.
- source: https://doi.org/10.1038/s41598-019-44097-3

### `weekly_review` — Weekly review
- minutes: 10 / 20
- anchor: weekend (or Friday afternoon)
- frequency: 1× per week
- tier: hard
- why: Planning the week's few priorities ahead reduces daily decision load and keeps the deep-work blocks pointed at what matters.
- how: 1) Look back: what moved, what slipped. 2) Choose 3 priorities for next week. 3) Book next week's deep-work blocks.
- conflicts/synergies: Good place to adjust all program habits.
- source: https://doi.org/10.1037/a0024192

### `meeting_free_block` — Protect one morning
- minutes: 0 / 0 (calendar rule)
- anchor: within work hours
- frequency: 1–2× per week
- tier: hard
- why: Larger uninterrupted blocks allow longer deep work, which matters for demanding tasks.
- how: 1) Pick one or two mornings a week. 2) Mark them busy. 3) Decline or move meetings when possible.
- conflicts/synergies: Only suggest if the user controls their calendar.
- source: https://doi.org/10.1016/j.obhdp.2009.04.002

## What the AI needs to know (intake)
1. `peak_focus_time` (required) — Places the deep-work block.
   Q: "When do you usually think best?" Options: Early morning | Late morning | Afternoon | Evening | Not sure
2. `calendar_control` (required) — Decides block length and whether to suggest meeting-free time.
   Q: "How much control do you have over your workday schedule?" Options: A lot | Some | Very little (meetings/shifts set for me)
3. `main_distraction` (required) — Picks which habit leads (phone, notifications/email, meetings, noise/people).
   Q: "What breaks your focus most?" Options: My phone | Email and chat | Meetings | People or noise around me
4. `work_type` (optional) — Sets block length (25 min for interrupt-heavy roles; 60–90 for makers).
   Q: "Which sounds most like your work?" Options: Deep solo work | Lots of calls or customers | Mixed | Studying
5. `can_lie_down` (optional) — Decides whether NSDR is offered at work or only at home.
   Q: "Could you take a 10-minute rest break somewhere quiet?" Options: Yes, at work | Only at home | No

## Scheduling rules
- Top 3: within the first 15 min of work hours (or night before via shutdown).
- Deep-work block: at `peak_focus_time` inside work hours; default first 2–3 hours of work. It is a work task, so only the 2-min setup counts against the habit budget. Length: 25 min (week 1) → 45 → 60–90 by week 3–4 if completed.
- Never place the deep-work block within 30 min after a big lunch, or in the user's slump window if known.
- Breaks: after each 50–90 min of focused work; merge with EnergyMax movement snacks.
- Inbox batching: 2–4 fixed checks; none inside deep-work blocks.
- NSDR: afternoon or lunch; not within 1 hour of bedtime if the user has trouble falling asleep (it can be used at bedtime by people who find it helps them sleep).
- Caffeine for focus: morning only, before the SleepMax cutoff.
- Shutdown ritual: last 10 min of work hours, every workday.
- Week 1 ramp: `top_three_plan`, one 25-min `deep_work_block` 3×/week with `phone_away`, and `notification_cleanup` once. Week 2: add `shutdown_ritual` and `micro_break`. Week 3+: lengthen blocks, add `batch_inbox`, NSDR or weekly review.
- Scaling: ~5 min → top 3 + shutdown. 10–20 min → add breaks and NSDR 2×/week. 20+ min → add walking think-time and weekly review.
- Weekend: no deep-work blocks unless the user works weekends; keep `weekly_review` (Sunday or Friday) and phone-free time as optional CalmMax overlap.
- If `calendar_control` is "Very little": use 25-min blocks at the edges of the day, skip `meeting_free_block`.

## Safety and claims
- Do not diagnose ADHD or other conditions, and do not suggest, dose or comment on stimulant medication, nootropics, microdosing or "smart drugs".
- No claims like "boost IQ", "raise dopamine" or "rewire your brain". NSDR is "may help you feel rested", not a dopamine treatment.
- Do not encourage overwork: never schedule deep work in sleep time or push work outside the user's stated work hours.
- If the user describes burnout, hopelessness or thoughts of self-harm, stop productivity coaching and point to professional help (in the US, call or text 988).
- Respect workplace constraints: do not suggest ignoring a boss or required on-call duties.

## Sources
- https://doi.org/10.1037/a0024192
- https://doi.org/10.1016/j.obhdp.2009.04.002
- https://www.journals.uchicago.edu/doi/10.1086/691462
- https://news.utexas.edu/2017/06/26/the-mere-presence-of-your-smartphone-reduces-brain-power
- https://www.interruptions.net/literature/Kushlev-CHI16.pdf
- https://doi.org/10.1371/journal.pone.0272460
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12080877/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC3805807/
- https://doi.org/10.1038/s41598-019-44097-3
