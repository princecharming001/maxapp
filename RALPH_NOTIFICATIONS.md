# Ralph Task: Redo Max's push-notification logic

You are working in the maxapp repo (backend: /Users/home/maxapp/backend, mobile: /Users/home/maxapp/mobile). Iterate until ALL success criteria pass, testing after each change. Work on a feature BRANCH `feat/notifications-v2`; do NOT push to main and do NOT start EAS/TestFlight builds. Commit each verified step on the branch; when all criteria pass, stop and report for human review.

## Goal

Replace the current push-notification system with a simpler, human, high-quality one. Today's pushes are too long, complex, and intimidating, and the per-maxx engines are over-engineered. The new system: SHORT, dry-witty, personalized pushes that name the task and pull the user into the app (where they see the full step-by-step), plus a broader set of notification types throughout the day — all governed by one clean planner.

These product decisions are LOCKED (build to them, don't re-litigate):
- Content: NAME the task, with a personal/specific hook — more than "time for your skincare". Short. The push is a hook; the details live in-app.
- Voice: DRY & WITTY. Clever, light humor, never corny, never mean, never cringe. Lowercase, like a sharp friend. E.g. "your future jaw called. it wants those mewing reps." / "skincare o'clock, anish. 2 min and your barrier forgives you."
- Personalize with: first name + streak/progress + their goal/why + plan & time-of-day context (use what's available; degrade gracefully when a signal is missing).
- Timing: send ONLY within each user's wake-to-sleep window. Never while they're asleep.
- Volume: 4-6 per day MAX per user, enforced by a priority planner. Priority when the day fills: time-sensitive tasks first, then streak/recap, then tips/broadcasts.
- 8 notification categories (below), spanning plan-specific and broad/everyone.

## Current state (read before changing)

- Copy: `backend/services/notification_copy.py` — `personalized_reminder(profile, ...)` returns {title, body}; bodies are too long/earnest ("A small step toward {why}. You've got this."). REWRITE for the new short dry-witty format.
- Per-maxx engines (over-complex, to consolidate/retire): `backend/services/{bonemax,fitmax,hairmax,heightmax}_notification_engine.py` (+ their *_reference.md). The new system is ONE engine across all maxxes; the "which task" comes from the schedule, not separate per-maxx logic.
- Scheduler / send loop: `backend/services/scheduler_job.py` — `send_due_notifications()` plus the existing JITAI "nudge budget / min interval" logic. This is where the new daily planner lives. NOTE: a comment says schedule task reminders are currently SMS-only — this task is about APPLE PUSH (APNs); make task reminders push-first (keep SMS if it exists, but the planner governs push).
- Delivery: `backend/services/apns_service.py` (APNs HTTP/2; picks sandbox vs prod via `apns_use_sandbox`). Keep; ensure every push payload carries a deep-link route + a category tag.
- Achievements (for milestone pushes): `backend/services/achievements.py`.
- Personalization signals: `backend/services/personalization.py` + `user_facts_service.py` (name, goal/why), schedule/profile (wake/sleep, streak, plan, task times).
- Mobile tap handling: `mobile/App.tsx` (`NOTIFICATION_DEEP_LINK_ROUTES`, `goToNotificationRoute`) already deep-links a notification's `data.route`. Extend the allowed routes so each category opens the right screen (Today/TaskGuide/the relevant plan/Profile).

## The 8 categories (build all; trigger + example in-voice copy)

Plan/task:
1. Task-due reminder — near a scheduled habit's time, within the window. Names the task. "skincare o'clock, anish. 2 min, then it leaves you alone."
2. Morning "here's your day" — once, at/after wake. "today's lineup: 3 small things between you and a sharper jaw. take a look."
3. Evening recap / last call — before sleep, only if tasks are still pending. "2 left, anish. your streak's watching."
4. Streak protection / momentum — when a streak is at risk (e.g. nothing done by late afternoon, or a streak day not yet secured). "day 6. ghosting now would be a crime against day 7."

Broad / everyone:
5. Re-engagement (lapsed) — user hasn't opened the app in N days. "your routine misses you. it's been 4 days; the jaw doesn't mew itself."
6. Milestone / achievement — fires on an unlocked achievement/streak milestone. "first 7-day streak. officially a person with discipline. proof's inside."
7. App-wide broadcast — admin-triggered send to all (launches, big tips). Copy authored by admin but in-voice; needs an admin-only endpoint.
8. Tips / quick win — occasional, midday. "one thing today: 10s of cold water on the face. tightens everything. you're welcome."

## What to build

A) Copy engine (rewrite notification_copy.py): one function per category (or a category-keyed generator) returning {title, body} that is SHORT (title <= ~6 words; body one short sentence, <= ~90 chars), dry-witty, and personalized from the available signals (name, streak, why, task label, plan, time-of-day). Use a curated rotation of witty templates per category with personalization slots so users don't see the same line repeatedly; keep a do-not-repeat-recently guard. (You MAY use an LLM to expand the template library offline, but do NOT make an LLM call per push at send time — latency/cost/quality control. Templates + slots + rotation is the baseline.) Every line must pass a taste bar: no corniness, no guilt-tripping, no fake urgency, nothing that could read as mean.

B) Daily planner (in scheduler_job.py): for each active user per day, assemble the eligible notifications, then SELECT up to the per-user cap (default 5, configurable 4-6) by the locked priority (time-sensitive tasks > streak/recap > morning preview > tips; milestones are event-driven and always send; broadcasts are separate/manual; re-engagement only for lapsed users). Enforce: only within wake-to-sleep window; a minimum interval between pushes (e.g. >= 90 min); dedup (never two of the same category, never re-send a task already nudged). Make cap/min-interval/lapse-threshold config-driven.

C) Delivery + deep-link: every push payload carries `category` and `route` (+ params) so a tap opens the right screen via mobile/App.tsx. Extend `NOTIFICATION_DEEP_LINK_ROUTES` accordingly (task reminder -> the task/Today, milestone -> Profile/Achievements, etc.).

D) Broadcast endpoint: `POST /api/admin/notifications/broadcast` (admin-only, 403 otherwise) that sends an in-voice push to all opted-in users, respecting each user's window (queue for next in-window slot if currently asleep).

E) Consolidate: retire/replace the per-maxx notification engines so all categories flow through the one engine + planner. Don't leave two systems sending pushes.

## Tests

- Copy: for each of the 8 categories, generate copy for a sample profile and ASSERT: title <= ~6 words, body is one short sentence, names the task for category 1, includes name + streak when those signals are present, and rotation returns different lines across repeated calls. Add a few assertions against a banned-phrase list (no "don't miss out", no "!!!", no guilt).
- Planner (deterministic): simulate a user-day with several due tasks + an at-risk streak + an available tip. ASSERT: <= cap notifications selected, in the locked priority order, all timestamps within the user's wake-sleep window, all >= min-interval apart, no duplicate categories, no task nudged twice.
- Window: a user asleep at the moment ASSERT gets nothing now; a queued/broadcast push is scheduled for their next in-window time, not delivered while asleep.
- Broadcast: admin token -> sends to all opted-in; non-admin -> 403.
- Deep-link: each category's payload includes a `route` that mobile/App.tsx is configured to handle (assert the route is in the allowed set).
- Backend: run on the python3.12 venv (`backend/.venv312`); `LLM_PROVIDER=openai` if any LLM is used. Mobile: babel compile-check edited files.

## Success criteria
1. Pushes are short (one-line title + one short sentence), dry-witty, name the task, and personalize from name/streak/why/plan+time; tapping opens the app to the relevant details. No long/intimidating bodies remain.
2. All 8 categories are implemented with correct triggers and in-voice copy.
3. A per-user daily planner caps at 4-6, applies the locked priority, dedups, respects a min-interval, and sends ONLY within each user's wake-to-sleep window.
4. App-wide broadcast works and is admin-only.
5. Re-engagement fires for lapsed users; milestones fire on achievement unlock; tips appear occasionally.
6. Tapping any notification deep-links to the right screen.
7. The per-maxx notification engines are consolidated into the single system — only one path sends pushes, and copy quality passes the taste bar (no banned phrases).

## Review-pass: glaring problems found by reading this as a real user (MUST fix)

These are the things that would make a real user mute notifications or delete the app. Treat them as required, not optional.

1. TIMEZONE (critical, the classic catastrophic bug). Every time decision — wake/sleep window, task times, morning/evening sends, quiet hours — MUST be computed in the USER'S LOCAL timezone, never server/UTC. Persist each user's timezone (from the device on app open; fall back to a sensible default). Getting this wrong = pushing "good morning" at 3am. Test: a user in a non-server timezone gets the morning push near THEIR wake time.

2. NEVER push while the app is foregrounded or just-used. If the user is in the app (or opened it within the last few minutes), suppress the push. "you've got a task" while they're literally looking at it reads broken.

3. ADAPTIVE BACKOFF (retention-critical). 4-6/day is a CEILING, not a quota to hit. Track delivered-vs-opened; if a user ignores pushes (e.g. ~0 opens across the last K), automatically step their frequency DOWN toward 1-2/day until they re-engage. Never keep blasting a non-responder — that's exactly how you earn a "turn off notifications". Returning lapsed users ramp UP gently (start 1-2/day), not straight to 6.

4. CROSS-CHANNEL DEDUP. Task reminders may currently go over SMS. NEVER send both push and SMS for the same task. One channel per user/task (push when enabled, else SMS); coordinate so the planner and the SMS path can't double-fire.

5. MILESTONES + BROADCASTS RESPECT A CEILING. Event-driven milestones and admin broadcasts must NOT bypass the cap into a flood. Still obey the min-interval; if a user is already at the daily cap, defer/drop the low-priority one. Cap broadcasts globally (<= ~1-2/week) so a mass send can't trigger mass opt-outs.

6. PER-CATEGORY PREFERENCES. Split essential (task/plan reminders) vs optional (tips, broadcasts, streak nudges). Let users keep reminders while muting tips/broadcasts. Default optional ON, but honor toggles; never send a muted category. (Also exposes a clean per-category settings surface.)

7. RELEVANCE TO ACTIVE PLANS. Tips and plan notifications must match the maxxes the user is ACTUALLY running. No skincare tip to a fitmax-only user. Gate every plan/tip notification on an active relevant plan.

8. EMPTY-STATE / NEW USERS. Don't send streak/recap/re-engagement to users with no streak / no completed tasks / who just signed up. Guard each category on the data it needs: streak push only if streak >= 2; recap only if there were pending tasks today; re-engagement only after genuine prior activity. A brand-new user getting "don't break your streak" (streak = 0) is a bug.

9. VOICE GUARDRAIL — wit must never become shame or fear. Some example lines lean guilt-trippy ("your streak's watching", "ghosting now would be a crime"). Reconcile with the no-guilt rule: keep it playful and encouraging, never shaming, never loss-framed-as-threat. Rewrite the streak/last-call lines accordingly and add "no shame / no fear-of-loss framing" to the banned bar.

10. DEAD TOKENS + KILL SWITCH. Handle APNs failures and prune invalid/expired device tokens so the planner stops retrying dead ones. Provide a global config kill-switch to pause ALL sends instantly.

11. DEEP-LINK TO THE ACTUAL DETAIL. "open the app to see details" only works if the task push opens THAT task's guide/detail, not just the home tab. Each push routes to the specific thing it's about.

### Add to success criteria
8. All timing is per-user-local-timezone; nothing is sent outside the user's wake-sleep window or while the app is foregrounded.
9. Frequency adapts: ignored pushes back a user off toward 1-2/day; returning lapsed users ramp up gently; 4-6 is a ceiling, never a forced quota.
10. No double-notify across push + SMS for the same task; milestones/broadcasts respect the cap + min-interval; broadcasts are globally rate-limited.
11. Per-category mute is honored; tips/plan notifications only go to users with the relevant active plan; empty-state users never get streak/recap/re-engagement; copy passes the taste bar (no shame, no fear, no banned phrases); a tap deep-links to the specific detail.

## Constraints
- This is mostly BACKEND (copy + planner + delivery + endpoint) plus a small mobile deep-link extension. APNs + the notification permission already exist in the build, so no native rebuild is needed.
- Keep the user's notification on/off + quiet-hours preferences respected (don't send to users who disabled pushes).
- Work on branch `feat/notifications-v2`; commit each verified step; do not push to main or build. Stop and report when all 11 criteria pass.
