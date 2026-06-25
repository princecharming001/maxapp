# RALPH LOOP — Make "Tune your plan" actually control the schedule (1:1)

## STATUS / READ THIS FIRST
- **Nothing here is implemented yet.** Done = the "Tune your <Max> plan" habit picker reflects and
  controls the user's REAL schedule tasks one-to-one — verified on the simulator (Maestro) AND with
  backend scripts/pytest.
- This is THE core bug: selecting/deselecting in the picker does not match what lands on Home/Schedule.
  A prior fix (honoring explicit deselect over the essential-floor guard) is in place; this fixes the
  deeper cause: **the picker's chips don't correspond to the schedule's actual tasks.**

---

## 1. ROOT CAUSE (confirmed)
- The picker offers a **hardcoded, generic list** from `mobile/data/habitCatalog.ts`
  (`HABIT_CATALOG[maxx_id]`, ~10 chips per max). `mobile/components/ChatHabitPicker.tsx` renders
  exactly that list; the widget payload only carries `{ type, maxx_id, schedule_id, label }`.
- The actual schedule is **skeleton-expanded** from the onboarding answers (`data/maxes/<max>.md`),
  producing a DIFFERENT and LARGER set of `catalog_id`s. For skinmax:
  - **ID mismatch:** chip `skin.spf` ≠ scheduled `skin.spf_reapply`. Deselecting the SPF chip never
    drops the SPF task.
  - **Orphans (no chip at all):** `skin.hydration_mask`, `skin.monthly_review`, `skin.derm_consult`,
    and concern-driven actives (`skin.azelaic_am`, `skin.centella_am`, `skin.retinoid_pm`,
    `skin.dermastamp_pm`, `skin.cleanse_*`, `skin.moisturize_*`, …) — these are never offered, so the
    user "never selected" them yet they appear and can't be removed.
- Net: `wanted`/`avoided` only govern the subset of tasks whose `catalog_id` happens to match a chip.
  Everything else shows regardless. **The page is disconnected from the real plan.**
- Same class of mismatch exists for the other maxes (e.g. heightmax schedules `height.foam_roll_back`,
  `height.inversion`, `height.outfit_check`, `height.posing_practice`, `height.morning_log`,
  `height.monthly_review`, `height.calcium_check` — none are chips). Fix generically, not per-max.

## 2. THE FIX (architecture)
**The picker must be driven by the user's ACTUAL schedule, not a hardcoded list.** When the
habit-picker is shown (onboarding, right after generation) and in the My-Maxxes "tune later" flow, the
**offered set = the distinct catalog tasks currently on that max's schedule**, each with a display
label and a group/area. Selection is then authoritative: what you keep selected is exactly what stays;
deselecting anything removes it; nothing appears that wasn't offered.

- **Backend** builds the offered list from the generated/active schedule's distinct `catalog_id`s
  (resolve each to a short title via the task catalog, and a group from its tag/area), and returns it
  in the habit-picker payload (and/or a small endpoint the picker fetches for a given schedule_id).
- **Mobile** renders the offered list FROM that payload (keep `habitCatalog.ts` only as a last-resort
  fallback / for nice area labels). Submit `wanted` + `avoided` over those real `catalog_id`s.
- The existing drop/ensure logic (`schedule_runtime._drop_excluded_tasks` / `_ensure_wanted_tasks`)
  already keys on `catalog_id`, and explicit deselect now wins — so once the offered ids ARE the real
  task ids, deselection works end-to-end.

## 3. KEY FILES
- `mobile/components/ChatHabitPicker.tsx` — currently reads `HABIT_CATALOG[spec.maxx_id]`; make it
  render an offered list passed in via the widget spec/props (fallback to the static catalog).
- `mobile/data/habitCatalog.ts` — keep as fallback + a tag→area label source.
- `mobile/screens/chat/MaxChatScreen.tsx` (~L904 submit → `api.updateHabitPrefs`) and the My-Maxxes
  tune sheet in `mobile/screens/marketplace/MarketplaceScreen.tsx` (`applyTune` → `updateHabitPrefs`,
  prefilled from `mx.wanted/avoided`) — both must use the dynamic offered set for the same schedule.
- Backend: the habit-picker widget emission in `backend/api/chat.py` (after `generate_and_persist`);
  the task-catalog lookup (`backend/services/task_catalog_service.py` `get_task`) for id→title/tags;
  `backend/services/schedule_service.set_habit_prefs` + `schedule_runtime` drop/ensure (already keyed
  on catalog_id). Build the offered set from `schedule.days[].tasks[].catalog_id` (distinct).

## 4. SUCCESS CRITERIA

### SC1 — Offered set == the schedule's real tasks
- The picker's chips are exactly the distinct catalog tasks on that max's schedule (no orphans, no
  id-mismatched stand-ins). Each chip shows a readable label (task title, trimmed) grouped by area.
- VERIFY (backend): for a generated skinmax schedule, the offered ids == the set of distinct
  `catalog_id`s across `schedule.days[].tasks`; every scheduled task has a corresponding chip.

### SC2 — Selection is authoritative on Home/Schedule
- After the user keeps a subset selected and submits, the regenerated schedule contains **only** the
  selected tasks (plus any genuinely structural non-task items) — nothing the user deselected, and
  nothing that was never offered.
- VERIFY (backend/pytest): select {am_routine} only for skinmax → regenerated days contain am_routine
  and NOT spf_reapply/hydration_mask/monthly_review/derm_consult/actives. (Maestro): select a subset →
  open Home/Schedule → only the selected tasks appear.

### SC3 — Deselect removes, on both entry points
- Works identically from the onboarding picker and the My-Maxxes "tune later" sheet (prefilled with the
  user's current selection from the live schedule). Deselect → that task is gone after save; re-opening
  the tune sheet reflects the current state accurately.
- VERIFY (Maestro): tune a max, deselect two tasks, save → Home no longer shows them; reopen tune →
  those two are unselected.

### SC4 — Prefill matches reality
- When tuning later, the picker's initial selected/unselected state matches what's actually on the
  schedule right now (selected = on the schedule; unselected = previously avoided), so it's never
  misleading.
- VERIFY: deselect one, save, reopen → exactly that one is unselected, the rest selected.

### SC5 — No regressions
- Generation still works for users who never open the picker (default = all offered selected → full
  plan). Per-user product consistency + the schedule skeleton still function. Deterministic, no LLM
  added. `npx tsc --noEmit` clean for touched files; app cold-starts clean; existing schedule tests pass.

### SC6 — Verification split
- UI (offered chips match the plan; select subset → Home shows only those) → Maestro on the simulator.
- Data (offered set == distinct schedule catalog_ids; post-save days == selected) → backend pytest/scripts.

## 5. CONSTRAINTS
- No new native deps. Keep the deterministic (no-LLM) path. Don't break existing `wanted/avoided`
  persistence or the drop/ensure logic — just feed it the REAL ids.
- Keep a sensible fallback: if the offered set can't be derived (legacy/no skeleton), fall back to the
  static `habitCatalog.ts` so the picker still renders.
- Bump any cached payload/version if the widget payload shape changes.

## 6. LOCAL DEV SETUP (use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach it: DEV → onboard a max (the picker appears after the plan builds) and/or DEV → Paid → My
  Maxxes → tune a max. Cross-check Home/Schedule for the tasks. Maestro at `~/.maestro/bin/maestro`.

## 7. WORK ORDER
1. Backend: build + return the offered set from the real schedule (id, title, area). pytest: offered ==
   distinct scheduled catalog_ids.
2. Mobile: render the offered set from the payload in ChatHabitPicker (both entry points); submit real ids.
3. pytest: select-subset → regenerated days == selected only. 4. Maestro: subset → Home shows only those.
5. SC4 prefill accuracy. 6. SC5 regression sweep.

## 8. DEFINITION OF DONE
- The picker lists exactly the tasks on the user's plan; selecting/deselecting is authoritative — Home/
  Schedule shows precisely the selected tasks, nothing more, nothing unremovable. Works from onboarding
  and tune-later, with accurate prefill. No regressions; verified via Maestro + backend tests. Commit
  in logical chunks.
