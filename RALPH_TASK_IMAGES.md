# RALPH LOOP — Distinct per-step images + relevant, visible ingredients

## STATUS / READ THIS FIRST
- **Nothing in this spec is implemented yet.** Do NOT believe you are "done" because a few images
  changed or the screen "looks fine." You are done ONLY when EVERY success criterion (SC1–SC7) is
  implemented AND verified — UI criteria on the iOS simulator with Maestro, backend criteria with
  backend scripts/pytest.
- This is a **follow-up** to the editorial vertical-pager redo that already shipped (commits
  `1e560b6c`, `23d97164`). The pager, the per-step `ingredients`, the per-user product consistency
  (SC5), and the per-maxx hero image all already exist. You are fixing two real, user-reported defects
  on top of that. **Do not regress the existing behavior.**

---

## 1. THE TWO DEFECTS (root cause already diagnosed — start here)

### Defect A — every SkinMax guide shows the SAME image
- `backend/services/task_guide_service.py` → `_finalize_guide()` sets
  `guide["hero_image"] = resolve_hero_image(maxx_id)`.
- `backend/services/hero_image_service.py` → `resolve_hero_image(maxx_id)` returns **ONE curated image
  per maxx** (`/uploads/hero/skinmax.jpg`), applied to **every step of every task** in that maxx.
- The data model already supports a **per-step** image: `useTaskGuide.ts` has `step.image` (falls back
  to `hero_image`), and `TaskGuideScreen.tsx` renders `api.resolveAttachmentUrl(step.image) || heroUri`.
  **But the backend never populates `step.image`.** So all steps collapse to the single per-maxx hero.
- **Fix direction:** populate a **distinct, relevant `step.image` for every step**, generated/pulled
  once and cached. The per-maxx hero stays ONLY as a last-resort fallback. Net effect: many more
  images, one per step, visibly different across steps AND across tasks.

### Defect B — recommended ingredients are sometimes off-screen, and sometimes shouldn't exist
- Per-step `ingredients` (0–3, `{name, note}`) are produced by the LLM (prompt ~lines 91–111 of
  `task_guide_service.py`), cleaned by `_clean_ingredients`, and resolved per-user to real catalog
  products by `services/ingredient_resolver.resolve_products_for_user` (SC5 — keep this).
- Two problems:
  1. **Relevance/quality:** the model lists generic/unpurchasable items (water, a towel, a bowl, a
     spoon, "warm water", pantry staples) that nobody needs to buy. These should NEVER appear as
     product cards.
  2. **Visibility:** on the full-screen vertical step page, the "Ingredients" row sometimes renders
     below the fold / clipped / unreachable, so the user never sees it.
- **Fix direction:** (1) only surface an ingredient when it is BOTH genuinely needed for that step AND
  a **specific purchasable product** that resolves to a real catalog/Amazon item; drop everything else;
  a step that needs no real product shows **no Ingredients section at all**. (2) make the Ingredients
  row reliably visible/reachable on screen, verified with Maestro on small and large devices.

---

## 2. KEY FILES
**Backend**
- `backend/services/task_guide_service.py` — guide generation, `_clean_ingredients` (~174), the LLM
  prompt (~91–111), `_finalize_guide` (~391, sets hero_image), `_resolve_for_user` (~399, per-user
  product resolution + top-level union). The cache lives in the `task_guides` table; payload version
  is `_PAYLOAD_V` (bump it when the shape changes so old cache regenerates).
- `backend/services/hero_image_service.py` — `resolve_hero_image(maxx_id)`; assets in
  `/uploads/hero/`; build-time generator `scripts/generate_hero_images.py` (Higgsfield pipeline,
  neutral cream background). **Extend this for per-step images** (or add a sibling service/script).
- `backend/services/ingredient_resolver.py` — `resolve_products_for_user(db, user_id, maxx_id, ings)`
  (deterministic, facts-filtered, consistent across tasks — SC5). Hook the relevance gate in here
  and/or in `_clean_ingredients`.
- `backend/services/product_catalog.py` — `lookup_by_name(name_substr, min_overlap=2)` (returns the
  matched real product or `None`), `find_products(...)`, `_passes_user_facts(...)`. Real Amazon
  products only; commodities like water are NOT in the catalog (use this as the gate).

**Mobile**
- `mobile/hooks/useTaskGuide.ts` — types: `TaskGuideStep.image?`, `TaskGuide.hero_image?`,
  ingredient/product shape. Extend if needed.
- `mobile/screens/task/TaskGuideScreen.tsx` — vertical step pager; renders `step.image || heroUri`
  (~359), ingredient cards (~85). The Ingredients row layout lives here — this is where visibility is
  fixed. `api.resolveAttachmentUrl()` turns `/uploads/...` into an absolute URL.

**Available libs (already installed — NO native rebuild):** reanimated 4.1, gesture-handler 2.28,
expo-image, expo-linear-gradient, expo-video/av, expo-blur, react-native-svg. (Same constraint set as
the prior spec.)

---

## 3. HARD CONSTRAINTS
- **No new native deps / no `expo prebuild` / no native rebuild.**
- **Do NOT regress** the vertical steps-only pager, the image fade (SC4), or per-user product
  consistency (SC5). The same product must still resolve identically for a given user across tasks.
- **Generate/pull images ONCE and cache** — never generate per guide request (cost + latency). Make
  generation idempotent (skip images that already exist).
- **Do NOT fabricate Amazon links or invent products.** Only surface items that resolve to a real
  `product_catalog` entry. If it doesn't resolve, it doesn't show.
- Keep the existing cream/editorial aesthetic; images must keep the neutral background so the fade
  (SC4) doesn't look uncanny.
- Bump `_PAYLOAD_V` when you change the cached guide shape so stale caches regenerate.

---

## 4. SUCCESS CRITERIA (done only when ALL pass)

### SC1 — A distinct image per step (many more images, none duplicated)
- Every step renders its **own** `step.image`, populated by the backend — NOT the shared per-maxx hero.
- Within a task, no two steps share the same image. Across different SkinMax tasks (e.g. morning vs
  evening skincare), the images are clearly different too. The "all SkinMax guides look identical"
  problem is gone.
- The per-maxx hero remains ONLY as a fallback when a step has no image. Never show a broken/empty box.
- VERIFY (Maestro, UI): open a SkinMax guide, screenshot Step 01/02/03 — the hero images are visibly
  different from each other; open a different SkinMax task and confirm its images differ from the
  first task's.

### SC2 — Images are RELEVANT and on-aesthetic (not just "different")
- Each step image meaningfully matches that step's action/subject (e.g. a cleanser step looks like
  cleansing, an SPF step looks like sunscreen — not a random unrelated photo).
- Neutral / cream / soft background so it fades cleanly into the page (SC4 compatibility). No uncanny,
  garish, or off-brand imagery. Consistent style across steps.
- VERIFY: eyeball the screenshots from SC1 — the image suits the step text and blends into the page.

### SC3 — Generated/pulled once, cached, cost-guarded
- Implement per-step images via ONE of:
  - **Generate:** extend `scripts/generate_hero_images.py` (or a sibling) to produce a per-step image
    keyed by `(task_key, step.n)` using the existing Higgsfield pipeline with a prompt built from the
    step title/body + maxx, neutral background. Save to `/uploads/hero/steps/...` (or similar).
  - **Pull:** if generation is impractical, pull from a stock source keyed by step keywords — but it
    must still be relevant, license-clean, neutral-background, and de-duplicated.
- Keying + caching: the image URL is stored with the cached guide (or resolved from a stable on-disk
  path by `(task_key, step.n)`), so it is created **once** and reused for every user and every read.
  Generation is **idempotent** — re-running skips images that already exist. Log how many were created
  vs skipped (no silent cost blowups).
- Fallback chain: per-step image → per-maxx hero → generic → "" (page still correct on solid cream).
- VERIFY (backend): run the generator twice; the second run creates 0 new images (all skipped). The
  guide endpoint returns distinct `step.image` values per step without generating anything at request
  time.

### SC4 — Ingredients only when genuinely needed AND purchasable
- An ingredient appears for a step ONLY if BOTH are true:
  1. it is **actually used in that step** (not just generally related to the task), and
  2. it is a **specific product a user would buy** that **resolves to a real `product_catalog` entry**
     (i.e. `lookup_by_name` / the resolver returns a real product with a real Amazon URL).
- **Hard-drop** commodities and non-purchasables: water, warm/cold water, ice, a towel, washcloth,
  cotton pad (unless it's a real catalog SKU), bowl, cup, spoon, your hands, a mirror, sink, common
  pantry/household staples, and anything the user obviously already owns. Build an explicit
  deny-list/heuristic AND require a successful catalog resolution — if it doesn't resolve to a real
  product, it does not show.
- A step that needs no specific purchasable product shows **ZERO ingredients** and the mobile renders
  **no "Ingredients" section** for it (no empty header, no placeholder card).
- Tighten the LLM prompt accordingly (instruct: list only specific purchasable products actually used
  in this step; never list water, household items, or things the user already owns; 0 is a valid
  count). AND enforce it in code (`_clean_ingredients` / the resolver) so a chatty model can't leak
  commodities through — the code gate is the source of truth, not the prompt.
- Do not repeat the same product on steps that don't use it (an item shows on the step(s) that use it).
- Keep SC5 consistency: whatever DOES show still resolves to the user's deterministic, facts-filtered
  product, identical across tasks.
- VERIFY (backend): generate a SkinMax guide; assert no step ingredient is a commodity (water/towel/
  etc.); assert every shown ingredient has a non-empty real catalog URL; assert at least one step
  legitimately has 0 ingredients and that the union excludes the dropped items.

### SC5 — Ingredients are actually VISIBLE on screen (Maestro)
- For steps that DO have ingredients, the "Ingredients" row is reliably **visible and reachable** on
  screen — not clipped, not pushed permanently below the fold, not hidden behind the safe-area/tab bar.
- Fix the step-page layout so the ingredients are reachable (e.g. the step content scrolls within the
  page, or the layout reserves space for the row) on **both a small device (iPhone SE) and a large one
  (Pro Max)**.
- VERIFY (Maestro, UI): on a step known to have ingredients, confirm the ingredient cards are on
  screen (scroll within the step if the design requires it) and that the cards render with a product
  name + note. Repeat on a small-screen simulator. Use coordinate taps + `takeScreenshot` and read the
  screenshots — remember Maestro reads the accessibility tree, so add `accessibilityLabel`/`testID` to
  the ingredient cards and assert/scroll to them rather than relying on inner text. "Present in the
  tree" is NOT the same as "visible on screen" — verify visually.

### SC6 — No regressions
- Vertical steps-only pager, swipe transition, and image fade all still work.
- Per-user product consistency (SC5 of the prior spec) still holds: same item → same product for a
  given user across tasks; a vegan/sensitive user still gets a different but self-consistent product.
- App cold-starts with no red error boundary; `npx tsc --noEmit` clean for touched mobile files.

### SC7 — Verification split (UI vs backend)
- **Simulator/Maestro = UI only:** SC1 image diversity, SC2 relevance/aesthetic eyeball, SC5
  ingredient visibility. Do NOT use the sim to prove backend logic.
- **Backend scripts/pytest = data/logic:** SC3 idempotent caching, SC4 commodity-drop + real-URL
  gating + zero-ingredient steps, SC6 consistency. Prove these with assertions, not screenshots.

---

## 5. LOCAL DEV SETUP (already working — use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start it: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach a guide: DEV drawer (floating "DEV", accessibilityLabel **"Open dev drawer"**) → "Paid" →
  Home → tap a habit → guide opens. Switch states by coordinate taps if text matching fails.
- Maestro CLI at `~/.maestro/bin/maestro` (v2.6.1). Put flows under `mobile/maestro/`.
- For SC5's small-device check, boot an iPhone SE simulator as well as the default.

## 6. WORK ORDER (suggested)
1. SC4 backend gate first (cleanest, unblocks correct ingredient data): tighten prompt + hard code
   gate dropping commodities and unresolved items; bump `_PAYLOAD_V`. Backend test.
2. SC1/SC3: per-step image generation/pull + caching + idempotent script + `step.image` population +
   fallback chain. Backend test (idempotency).
3. SC5: fix the mobile Ingredients-row layout + add testIDs; Maestro-verify on large + small device.
4. SC1/SC2: Maestro-verify image diversity + relevance across steps and across two tasks.
5. SC6: regression sweep (consistency + cold start + tsc).

## 7. DEFINITION OF DONE
- SC1–SC7 implemented and verified (UI via Maestro screenshots, backend via scripts/pytest).
- Distinct, relevant, cached per-step images; no two steps share an image; SkinMax tasks no longer
  look identical; images generated once (idempotent) — never per request.
- Ingredients show only when genuinely needed AND a real purchasable product; commodities (water,
  towels, etc.) never appear; zero-ingredient steps render no section; visible/reachable on small and
  large devices.
- No regressions to the pager, fade, or per-user product consistency; app cold-starts clean; tsc clean.
- Work committed in logical chunks with clear messages.
