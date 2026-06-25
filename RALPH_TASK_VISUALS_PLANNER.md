# RALPH LOOP — Real step visuals (inspiration-accurate) + Planner redesign

## STATUS / READ THIS FIRST
- **Nothing here is implemented yet.** You are done ONLY when EVERY criterion (SC1–SC8) is implemented
  AND verified — UI criteria on the iOS simulator with Maestro, backend/data criteria with backend
  scripts/pytest.
- This **revises** two earlier decisions:
  - Step images should be **REAL photos pulled from web/image search — NOT generated with Higgsfield
    every time.** Higgsfield-generated blobs look basic/uncanny (a vague pink shape for a water
    bottle). Replace that source.
  - The hero **transition must NOT use the basic grey→cream gradient smear** currently in
    `TaskGuideScreen`. Match the inspiration instead (see §2).
- Part A = redo the habit-step-screen visuals. Part B = redesign the Planner tab in the same
  editorial aesthetic. **Do not regress** the vertical steps-only pager, per-step distinct images,
  per-user product consistency, or the ingredient relevance/visibility work.

---

## 2. THE INSPIRATION (what "good" looks like)
Reference (Julienne recipe app): a **real, high-quality photo** sits at the **top**, bleeding from the
top edge and naturally toward one side (the round plate of food extends to the top-right). The photo's
own background is light/neutral, so it **blends into the cream page on its own — there is NO grey
gradient band**. The "Watch" pill overlays the photo's top-right. "Step NN" + the big serif
instruction begin just below / slightly overlapping the bottom of the photo. Calm, editorial, premium.

What we have now (WRONG):
- The step image is a **basic generated blob** (e.g. a flat pink rounded-rect for a "water bottle") —
  looks cheap and abstract, not a real object.
- A `LinearGradient(['transparent','transparent',CREAM])` paints an obvious **grey/cream gradient
  smear** under the image to force a fade. It reads as a muddy band, nothing like the inspiration.

The fix, in one line: **real photo + natural blend (no gradient smear) + inspiration-style placement.**

---

## 3. KEY FILES
**Step visuals (Part A)**
- `mobile/screens/task/TaskGuideScreen.tsx` — the step pager. Hero render ~lines 202–212:
  `ExpoImage contentFit="cover"` + the `LinearGradient` fade (~208). `heroHeight` ~176 (0.38–0.48 ×
  screen). `heroUri = step.image || hero_image` (~392). **This is where the placement + the gradient
  treatment are fixed.**
- `mobile/hooks/useTaskGuide.ts` — `TaskGuideStep.image`, `TaskGuide.hero_image`.
- `backend/services/hero_image_service.py` + `backend/scripts/generate_hero_images.py` — the current
  Higgsfield per-maxx generation. **Replace/augment the SOURCE with web image search + download +
  cache.** Keep the resolve/fallback shape.
- `backend/services/task_guide_service.py` — `_finalize_guide` (sets hero), `_resolve_for_user`,
  per-step `ingredients`. Per-step image population lives around here. `_PAYLOAD_V` — bump when the
  cached shape changes.
- Images are served from `/uploads/...`; mobile resolves via `api.resolveAttachmentUrl(...)`.

**Planner (Part B)**
- `mobile/screens/profile/DayPlannerScreen.tsx` — the Planner tab body (rendered `embedded` by
  `navigation/TabNavigator.tsx` `PlannerTab` ~line 101). **Study it fully before redesigning** — keep
  all its data/functionality (schedule, tasks, times, any drag/direct-manipulation, day-shape), change
  the look.
- `mobile/screens/_mocks/PlannerMockups.tsx` — check whether it holds an intended planner design; if
  useful, use it as a north star.
- Match the HOME screen's editorial look (the "DAY 1 / 365" + habit-cards screen) — find the home
  screen + the shared design tokens (cream/ink/gold, the Fraunces serif) it uses and reuse those exact
  tokens/components. Do not invent a new palette.

**Available libs (already installed — NO native rebuild):** reanimated 4.1, gesture-handler 2.28,
expo-image, expo-linear-gradient, expo-blur, expo-video/av, react-native-svg.

---

## 4. HARD CONSTRAINTS
- **No new native deps / no `expo prebuild` / no native rebuild.**
- **Do NOT regress:** the vertical steps-only pager + swipe transition; distinct per-step images;
  per-user product consistency; ingredient relevance + visibility.
- **Real images must be cached locally and fetched ONCE** (download to `/uploads/...`), never hot-link
  a live Google/CDN URL at render time and never fetch per request. Idempotent: skip images already
  fetched. Log fetched-vs-skipped (no silent cost/quota blowups).
- **Licensing/safety:** prefer license-clean sources (Unsplash/Pexels/Openverse APIs) over scraping
  raw Google results. If using a Google image search, only download freely-usable results and store
  attribution where the source requires it. No copyrighted/watermarked junk.
- Keep the cream/editorial aesthetic; the Planner redesign reuses the SAME tokens/components as Home.
- Bump `_PAYLOAD_V` when the cached guide shape changes so stale caches regenerate.

---

## 5. SUCCESS CRITERIA (done only when ALL pass)

### SC1 — Step images are REAL photos pulled from search (not generated)
- Replace Higgsfield generation for step/hero images with a **web image-search + download pipeline**:
  given a step's subject (built from step title/body + maxx), query an image search
  (Unsplash/Pexels/Openverse API preferred; Google image search acceptable for freely-usable images),
  pick the best **real photo with a light/neutral background**, download it, store under `/uploads/...`,
  and set `step.image`.
- Real objects/scenes — a water step shows an actual water bottle/glass, an SPF step shows real
  sunscreen — NOT an abstract blob.
- VERIFY (Maestro, UI): open a guide; each step shows a recognizable real photo, visibly higher
  quality than the old blobs.

### SC2 — Inspiration-accurate placement + NO gradient smear
- Re-do the hero treatment in `TaskGuideScreen` to match §2:
  - Photo bleeds from the **top** and extends naturally toward one side (top-biased, slightly offset —
    like the plate in the inspiration), with the serif instruction beginning just below / slightly
    overlapping its lower edge.
  - **Remove the basic grey→cream `LinearGradient` smear.** Rely on real photos whose own background is
    light/neutral so they blend seamlessly. If ANY blend aid is needed, it must be subtle and
    invisible (e.g. a soft alpha mask at the very bottom edge / a feathered edge) — never the muddy
    band we have now. The seam must be imperceptible like the inspiration.
  - The "Watch" pill (when present) overlays the photo's top-right; the ✕ stays top-left.
- VERIFY (Maestro, UI): screenshot a step; it reads like the inspiration — clean photo, no visible
  gradient band, text flows naturally below it.

### SC3 — Source quality: neutral-background, relevant, de-duplicated, on-aesthetic
- Prefer images with light/neutral/soft backgrounds (so SC2's no-gradient blend works). Reject busy,
  dark, watermarked, or low-res images. Pick relevant-to-the-step subjects. No two steps in a task get
  the same photo; different tasks look different too.
- VERIFY (Maestro eyeball + backend): images suit the steps, blend cleanly, none duplicated.

### SC4 — Fetched once, cached, idempotent, with fallback
- The chosen image URL is stored with the cached guide / resolved from a stable on-disk path keyed by
  `(task_key, step.n)`; created once, reused for every user and every read; re-running the fetch skips
  existing images. Fallback chain: per-step photo → per-maxx hero → generic → "" (page still correct
  on cream, never a broken-image box).
- VERIFY (backend): run the fetch twice → second run downloads 0 new images. The guide endpoint
  returns distinct `step.image` values without fetching at request time.

### SC5 — Planner tab redesigned in the app's editorial aesthetic
- Redesign `DayPlannerScreen` so it looks like it belongs to the same app as Home (cream + ink + the
  Fraunces serif, hairline cards, calm spacing, the same accent tokens). It currently looks plainer/
  off-aesthetic — make it premium and cohesive.
- **Keep all functionality:** the day/week schedule, task/event blocks with times + durations, any
  direct-manipulation/drag, the day-shape signals, and the `embedded` tab behavior (no back button).
  This is a visual/UX redesign, not a data change — do not break the schedule hooks or react-query keys.
- Improve the actual UX, not just colors: clear time rail, readable task blocks, obvious "now",
  comfortable touch targets, empty-state handled, looks good on small (SE) and large (Pro Max) screens.
- Reuse shared components/tokens from Home rather than inventing new ones; if `PlannerMockups.tsx`
  encodes an intended design, honor it.
- VERIFY (Maestro, UI): open the Planner tab; it visually matches the app's aesthetic, the schedule
  renders with real task blocks, and it looks clean on both a small and large device.

### SC6 — Consistent aesthetic across the two surfaces
- The step screens and the Planner share the same type scale, color tokens, card/hairline treatment,
  and overall feel. Nothing looks like a different app.
- VERIFY: side-by-side screenshots of a step screen and the Planner read as one cohesive product.

### SC7 — No regressions
- Vertical steps-only pager + swipe transition still work; distinct per-step images still distinct;
  per-user product consistency holds; ingredient relevance + visibility intact.
- App cold-starts with no red error boundary; `npx tsc --noEmit` clean for touched mobile files.

### SC8 — Verification split (UI vs backend/data)
- **Simulator/Maestro = UI only:** SC1 real photos, SC2 placement/no-gradient, SC3 eyeball, SC5/SC6
  Planner look + cohesion. Verify on BOTH a large and a small simulator.
- **Backend scripts/pytest = data/logic:** SC4 idempotent fetch + caching + fallback, and that the
  guide endpoint serves cached local URLs (not live hot-links).

---

## 6. LOCAL DEV SETUP (already working — use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach a guide: DEV drawer (floating "DEV", accessibilityLabel **"Open dev drawer"**) → "Paid" →
  Home → tap a habit → guide. The Planner is the **Planner** bottom tab.
- Maestro CLI `~/.maestro/bin/maestro` (v2.6.1); flows under `mobile/maestro/`. Maestro reads the
  accessibility tree — add `accessibilityLabel`/`testID` to new components and use coordinate taps +
  `takeScreenshot`, then READ the screenshots (present-in-tree ≠ visible). Boot an iPhone SE sim too
  for the small-screen checks.

## 7. WORK ORDER (suggested)
1. SC1/SC3/SC4 backend: web image-search + download + cache + idempotency + per-step population +
   fallback; bump `_PAYLOAD_V`. Backend test (idempotency, local URLs).
2. SC2 mobile: re-do hero placement, delete the gradient smear, tune the natural blend. Maestro-verify.
3. SC5/SC6 mobile: study `DayPlannerScreen` + Home tokens, redesign Planner, keep functionality.
   Maestro-verify on large + small.
4. SC7 regression sweep; SC8 verification split.

## 8. DEFINITION OF DONE
- Step screens use real, relevant, neutral-background photos pulled from search and cached locally
  (idempotent, never per-request), placed like the inspiration with **no gradient smear** and a
  seamless blend.
- Planner tab redesigned to the app's editorial aesthetic with all functionality intact; cohesive with
  the step screens; good on small + large devices.
- No regressions; app cold-starts clean; tsc clean. Verified UI via Maestro, data via backend tests.
- Work committed in logical chunks with clear messages.
