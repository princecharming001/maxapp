# RALPH LOOP — Redo the Task-Guide Steps Screen (editorial vertical pager)

## STATUS / READ THIS FIRST
- **Nothing in this spec is implemented yet.** Do NOT believe you are "done" because the file
  exists or because the screen "kind of works." You are done ONLY when EVERY success criterion
  (SC1–SC6) below is implemented and verified. **Verify UI/visual criteria (SC1–SC4) on the iOS
  simulator with Maestro; verify backend criteria (SC5 product-consistency, image caching) with
  backend scripts/tests — NOT the simulator.** Don't launch the sim to check backend-only behavior.
- This **replaces** the current task-guide screen behavior. The current screen is a *horizontal*
  3-page pager (Intro → Steps → "Mark done"). You are turning it into a *vertical* pager of
  **steps only**, styled to match the reference layout described in §2.
- Work in small commits. After each criterion, re-read this file and re-check the screenshots
  against §2. Loop until all criteria pass.

---

## 1. GOAL (one paragraph)
Rebuild the task-guide step experience so it looks and feels like the reference recipe screen
(Julienne, from Mobbin): a full-bleed background photo at the top that fades cleanly into the page,
a small "Step NN" kicker, a big serif instruction, a left vertical progress rail, a "Cooking Tip"
block, and a horizontally-scrolling "Ingredients" row at the bottom. **You move between steps by
swiping up / down** (vertical paging), with a smooth, springy, parallaxed transition. There is **no
intro page and no "mark as done" page — only steps.** Finally, the recommended ingredients/products
must be **consistent for a given user across every task** (the same item always resolves to the same
specific product, based on what we know about that user).

---

## 2. THE REFERENCE LAYOUT — copy it almost exactly (per step page)
Top → bottom, one full-screen page **per step**:

```
┌─────────────────────────────────────────────┐
│ [✕]                              [ Watch ▶ ] │  ← ✕ top-left (rounded square, hairline
│   ░░░ background hero photo, bleeding ░░░    │     border). "Watch ▶" pill top-right.
│   ░░░ from the top, FADING into the  ░░░    │     Hero image sits BEHIND this row and
│   ░░ cream page bg (no hard edge)   ░░      │     the first ~2 lines of text.
│                                              │
│  Step 03                                     │  ← small gray kicker "Step NN"
│                                              │
│ │  Add 30g of coconut yogurt, 100ml of      │  ← BIG serif instruction (step body).
│ │  almond milk, 130g of flour, 6g of        │     Left edge has the vertical
│ ▌  baking powder, and 1 tablespoon of       │     PROGRESS RAIL (short dashes, one
│ ▌  matcha powder to the mashed bananas.     │     per step: dark=done/current,
│ │  Mix until well combined.                 │     faint=upcoming).
│ │                                            │
│  Cooking Tip                                 │  ← label + italic gray tip (only if tip)
│  Ensure there are no lumps in the batter…    │
│                                              │
│  Ingredients                                 │  ← label
│  ┌───────────────────┐ ┌──────────────┐     │  ← horizontal scroll; next card peeks
│  │ CY │ Coconut Yogurt│ │ AM │ Almond…│ →   │     Each card: square tile (product
│  │    │ 30 g of coco… │ │    │ 100ml… │     │     image if available, else initials
│  └───────────────────┘ └──────────────┘     │     like "CY") + name + quantity/note.
└─────────────────────────────────────────────┘
```

Match the reference's feel: cream/off-white background, near-black ink text, generous line-height
on the serif, calm spacing, hairline borders on cards and the ✕ button. Use the app's existing
serif (Fraunces) and existing ink/cream tokens — do NOT invent a new palette.

---

## 3. KEY FILES (already mapped — start here, don't re-discover)
**Mobile**
- `mobile/screens/task/TaskGuideScreen.tsx` — the screen to rebuild. Currently:
  - horizontal `ScrollView pagingEnabled` (lines ~304–305), `IntroPage` (~361), `StepPage` (~468),
    `DonePage` (~603, "Mark done" button ~633). **Remove Intro + Done; make it vertical steps-only.**
  - Already uses Reanimated 4.1 (`useSharedValue`, `useAnimatedScrollHandler`, `useAnimatedStyle`,
    `interpolate`, `Extrapolation.CLAMP`, `withSpring`) and an `Animated.createAnimatedComponent(ScrollView)`.
    Keep this pattern, just switch the axis to vertical and restyle.
- `mobile/hooks/useTaskGuide.ts` — react-query hook. Types:
  - `TaskGuideStep = { n; title; body; tip: string|null }`
  - `TaskGuideProduct = { name; note; url?; image? }`
  - `TaskGuide = { task_key; title; overview; steps; products?; duration_minutes; why_it_matters }`
  - **You will extend these** (add per-step image + optional video + per-step ingredients — see SC4/SC5).
- `mobile/services/api.ts` — `getTaskGuide(scheduleId, taskId)` (~1965). Update return type to match
  the extended payload.

**Backend**
- `backend/services/task_guide_service.py` — generates the guide (LLM → product resolution → cache in
  `task_guides` table). Product resolution ~lines 193–219 via `product_catalog.lookup_by_name()`.
  Pregeneration `pregenerate_for_schedule()` warms the cache.
- `backend/api/schedules.py` ~418–439 — `GET /schedules/{schedule_id}/tasks/{task_id}/guide` (paid-gated).
- `backend/services/product_catalog.py` — `find_products(module, concerns, user_facts, limit)` (~317),
  `_passes_user_facts()` (~191), tags include vegetarian/vegan/fragrance_free/etc. Products have stable
  kebab IDs, brand, price_tier (budget|mid|premium), image, url (Amazon /dp/).
- `backend/services/personalization.py` — `UserPersonalizationProfile` (diet, skin, budget, constraints,
  goals…), provenance-ranked facts. This is the source of "what we know about the user."

**Available libraries (ALL already installed — do NOT add native deps, do NOT rebuild):**
- `react-native-reanimated@~4.1.1`, `react-native-gesture-handler@~2.28.0`
- `expo-linear-gradient@~15.0.8` (use for the image fade), `expo-image@~3.0.11`
- `expo-video@~3.0.15` + `expo-av@~16.0.8` (the Watch button), `expo-blur`, `react-native-svg@15.12.1`

---

## 4. HARD CONSTRAINTS (do NOT violate)
- **No new native modules / no `expo prebuild` / no native rebuild.** Everything you need is listed
  above. If you think you need a new native dep, you're wrong — find a way with what's installed.
- **Do NOT bump `react-native-reanimated` past 4.1.x** (RN 0.81 pinned). No Moti (it needs Reanimated 3).
- **Do NOT keep the horizontal pager, the Intro page, or the Done / "Mark done" page.**
- **Do NOT hardcode product recommendations** or bypass `product_catalog` / the user-facts filter.
- **Do NOT regenerate images on every request** — generate/resolve once and cache (per task_key).
- Keep the existing app aesthetic (Fraunces serif, ink/cream tokens). No new color system.
- The guide is paid-gated; keep that. Test via the DEV drawer's "Paid" state.

---

## 5. SUCCESS CRITERIA (the loop is done only when ALL pass)

### SC1 — Vertical, steps-only pager
- The guide opens directly into a **vertical** full-screen pager. **Swipe UP = next step, swipe
  DOWN = previous step.** Each page is exactly one step and snaps to full screen height.
- Re-implement using the existing Reanimated `Animated.ScrollView` but vertical: remove `horizontal`,
  keep `pagingEnabled`, set each page to the screen height, drive interpolations off `scrollY`.
- **No Intro page. No Done page. No "Mark done" button.** After the last step, the pager simply stops
  (a gentle bounce is fine). Completion of the task is handled elsewhere (the home checkbox) — this
  screen is purely the steps.
- The ✕ button closes the guide from any step.
- VERIFY: Maestro screenshots at Step 01 → swipe up → Step 02 → swipe up → Step 03 → swipe down →
  Step 02. No "Mark done" anywhere.

### SC2 — Layout matches §2 almost exactly
- Per-step page contains, in order: hero image (SC4) behind the top; ✕ top-left; "Watch ▶" top-right
  (only when the step has a video, else hidden); "Step NN" kicker; big serif instruction (step body);
  left vertical progress rail (one dash per step, dark for done+current, faint for upcoming);
  "Cooking Tip" label + italic tip (only if `tip`); "Ingredients" label + horizontal-scroll cards.
- Ingredient card = square tile (product `image` if present, else initials like "CY" from the name)
  + name + quantity/note. Cards scroll horizontally with the next card peeking at the right edge.
- Match spacing/type/hairlines to the reference proportions using existing tokens.
- VERIFY: screenshot a step; it should be visually indistinguishable in structure from §2 (kicker,
  serif block, rail, tip, ingredient row).

### SC3 — Smooth swipe transition
- Vertical paging snaps crisply (`decelerationRate="fast"`, `snapToInterval` = screen height,
  `bounces={false}` between inner steps).
- During the swipe: the **hero image parallaxes** (translates slower than content, ~0.4–0.6×), and the
  **step text fades + translates + slightly scales in** as its page reaches center. All interpolations
  run on the UI thread via `useAnimatedScrollHandler` + `useAnimatedStyle` (no `setState`-driven
  animation, no work on the JS thread during the gesture).
- The transition must feel intentional and editorial, not a plain scroll. No jank, no fl__icker, no
  layout jump.
- VERIFY: capture mid-swipe screenshots; the image and text should be visibly offset/animating, then
  settle cleanly.

### SC4 — Background images: appropriate + NOT uncanny
- Each step renders a **hero image appropriate to the task/step** at the top, bleeding from behind the
  ✕/Watch row down past the first lines of the instruction.
- The image must **fade into the page background** using `expo-linear-gradient` (top: image fully
  visible → bottom: transparent to the cream bg). There must be **no hard rectangular edge** — that is
  exactly what makes it look uncanny. The text below sits on solid cream and stays fully legible.
- Prefer images with neutral / transparent / clean backgrounds (cut-out subject feel) so the fade
  blends. Backend work:
  - Extend the guide payload with an image per step (`steps[].image`) **or** a single task
    `hero_image` (per-step preferred; task-level acceptable as a first pass — state which you chose).
  - Source images via the **existing image pipeline already used in this app** (Higgsfield generation,
    same approach as the rotating bust face-scan loader and the matte badge icons) with a prompt that
    yields an appropriate, neutral-background subject for the task/step. **Cache the resulting URL in
    the `task_guides` table** alongside the rest of the guide — never regenerate per request.
  - **Fallback chain:** generated image → a curated per-maxx hero asset → no image (page still looks
    correct on solid cream — never a broken-image box).
- VERIFY: screenshot shows the photo melting into the background with legible text; no seam.

### SC5 — Ingredients/products consistent per user across ALL tasks
- For a given user, **the same ingredient/item always resolves to the same specific product
  everywhere it appears, across every task guide.** Example: if "vitamin C serum" (skinmax) or a given
  supplement is recommended in task A, the identical product card (same name, brand, url, image) must
  appear for that item in task B. No flip-flopping between brands per task.
- The choice is driven by **what we know about the user** (diet, skin type, sensitivities, budget tier,
  constraints) from `personalization.py` / `user_facts`, filtered through `product_catalog._passes_user_facts`
  (e.g., a vegan user never sees a dairy/animal product; fragrance-free for sensitive skin; respect
  `price_tier` vs budget).
- Implement a **deterministic, user-scoped selection** that is stable over time:
  - Normalize each referenced ingredient/concern to a canonical key.
  - Pick the product deterministically from the user-facts-filtered candidates (e.g., stable ranking by
    concern-overlap then price-tier fit; tie-break deterministically — NOT random, NOT LLM-per-call).
  - **Persist the (user, canonical-ingredient) → product mapping** (a small table or a JSON column on
    the user profile) so it is reused by every task guide and never changes unless the user's facts
    change. Reuse this mapping in `task_guide_service` product resolution.
- VERIFY (backend, NOT the simulator): generate guides for two different tasks that share an ingredient
  for the same user via the guide endpoint / a small backend script / a pytest, and assert the ingredient
  resolves to the **same product** (name + url match). Switch to a user with different facts (e.g.,
  vegan) and assert a different but still self-consistent product. This is data correctness — prove it
  with backend assertions, not by eyeballing the UI.

### SC6 — Verify ONLY the UI changes on the simulator with Maestro
- **Scope: simulator/Maestro is for the VISUAL/UI criteria only — SC1, SC2, SC3, and the visual half
  of SC4 (the hero image fading with no seam, the ingredient row scrolling).** Do NOT try to prove the
  backend behavior (SC5 product-consistency, image caching, no-regeneration) through the simulator —
  verify those with backend scripts/tests as noted in SC5/SC4. Don't spin up the sim for backend-only work.
- Setup: local backend reachable by the sim, Metro running, app launched, use the **DEV drawer →
  "Paid"** to get an authed paid user, open a task → open its guide. (See §6 for the working local
  setup that already exists.)
- Maestro flow (write it under `mobile/maestro/`): open a guide, screenshot Step 01, swipe up,
  screenshot Step 02, swipe up, screenshot Step 03, swipe down, screenshot — and confirm the UI:
  vertical paging works, layout matches §2, hero image fades (no seam), ingredient row scrolls, and
  there is no "Mark done" page.
- GOTCHA: Maestro reads the iOS accessibility tree, so custom buttons/sheets may expose their
  `accessibilityLabel` instead of inner text (e.g., the DEV button matches **"Open dev drawer"**, not
  "DEV"), and bottom-sheet option labels may not match by text at all — use **coordinate taps**
  (`tapOn: { point: "x%, y%" }`) + `takeScreenshot` and read the screenshots to verify. Add
  `accessibilityLabel`s / `testID`s to the new step components so Maestro can target them.
- Iterate: compare each UI screenshot to §2; fix; re-run; repeat until the UI matches.

---

## 6. LOCAL DEV SETUP (already working — use it, don't reinvent)
- Backend for the simulator runs on **port 8001** (loop-immune wrapper `backend/_sim_backend.py`);
  `mobile/.env.local` points at `http://127.0.0.1:8001/api/`; the app's `resolveApiBaseUrl` uses
  loopback verbatim on the simulator. If 8001 is down, start it:
  `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py` (LLM_PROVIDER=openai).
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear` (no `--lan` for the simulator).
- App bundle id: `com.cannon.mobile`. Sim: an iPhone simulator that's already booted (`xcrun simctl
  list devices booted`). Relaunch with `xcrun simctl launch <UDID> com.cannon.mobile`.
- Maestro CLI is installed at `~/.maestro/bin/maestro` (v2.6.1). Run flows with
  `~/.maestro/bin/maestro test <flow>.yaml`; screenshots land where the flow's `takeScreenshot` points.
- To reach the guide: DEV drawer (bottom-left floating button, accessibilityLabel "Open dev drawer")
  → tap "Paid" → Home → tap a habit/task → it opens the guide.

---

## 7. WORK ORDER (suggested)
1. **SC1 first** — flip the pager to vertical, strip Intro + Done, get steps-only paging working.
2. **SC2** — rebuild the per-step layout to match §2 (kicker, serif, rail, tip, ingredients row).
3. **SC4** — backend: add cached per-step (or task) hero image via the existing Higgsfield pipeline;
   mobile: render with `expo-image` + `expo-linear-gradient` fade.
4. **SC3** — add the parallax + fade-scale-translate transition.
5. **SC5** — backend: deterministic, persisted per-user ingredient→product mapping; wire into guide gen.
6. **SC6** — Maestro flow; screenshot-verify everything; iterate until it matches §2.
7. Add the "Watch ▶" button (SC2) wired to `expo-video` when a step has a video; hidden otherwise.

## 8. DEFINITION OF DONE
- All of SC1–SC6 implemented and **screenshot-verified** on the simulator.
- No new native deps; Reanimated still 4.1.x; no Intro/Done pages; no horizontal pager.
- Backend image + product mapping are **cached** (no per-request regeneration); products pass the
  user-facts filter and are consistent across tasks for the same user.
- TypeScript compiles (`npx tsc --noEmit` in `mobile/` is clean for the files you touched), the app
  cold-starts with no red error boundary, and the Maestro flow passes.
- Commit your work in logical chunks with clear messages.
