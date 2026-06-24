# Ralph Task: Fix Max's chat + onboarding question logic

> STATUS (read first): this spec has **11 success criteria** (1–6 in the first sections, 7–11 added later in requirements F, G, H). Criteria **1–7 are already implemented and committed on the current branch/main** (MCQ chips, custom options, no cross-maxx repeat, product cards, AND the self-harm/crisis safety guardrail). Do NOT assume the whole task is complete and do NOT skip — **VERIFY 1–7 still pass, then DO the remaining work: criteria 8, 9, 10, 11** (numbered-list/bold formatting, scroll re-generate, the task-guide screen, and durable cross-app memory). The task is NOT done until all 11 pass.


You are working in the maxapp repo (backend: /Users/home/maxapp/backend, mobile: /Users/home/maxapp/mobile). Iterate until ALL success criteria pass, testing after every change. Work on a feature BRANCH (see Constraints). Do NOT push to main and do NOT start EAS/TestFlight builds.

## The problem (4 linked issues)

Max's chat and per-maxx intake ask too few / wrong questions and repeat themselves.

1. Chat dumps generic answers instead of asking when the question is broad. Example: user asks "What skincare should I use" and Max replies with a long generic protocol and ends with a PLAIN-TEXT question ("what's your main skin complaint right now. acne, texture, oiliness, or something else."). It SHOULD have led with a clarifying MCQ (tappable chips), not a wall of generic text. For broad personal-recommendation questions (what should I use/do/take, build me a routine, help with X) whose answer depends on facts Max does not yet know, Max must ASK a focused MCQ first.

2. MCQs have no "type your own" option. When the right answer might not be among the offered options, the MCQ must offer a custom/free-text path, but ONLY as needed (e.g. "what's bothering you?" should allow Other; "skin type?" usually should not).

3. Onboarding (both the initial OnboardingV2 flow AND the per-maxx LLM intake) does not offer a custom option on questions that need it.

4. Onboarding repeats questions across maxxes. Starting a new maxx re-asks facts Max already has (wake time, skin type, equipment, etc.) instead of pulling them from the known profile.

## Where the code is (verified pointers)

Chat MCQ mechanism (exists, needs strengthening + custom option):
- Prompt: backend/services/lc_agent.py -> build_agent_system_prompt, the "CLARIFY VAGUE QUESTIONS WITH MCQ" section (markers of the form [CHOICES] a then b then c [/CHOICES] joined by the pipe character, and [CHOICES_MULTI] ... [/CHOICES_MULTI]).
- Backend marker parsing -> returns a choices list plus multi_choice flag: backend/api/chat.py around lines 404-441 (_CHOICES_MARKER_RE, _CHOICES_MULTI_MARKER_RE, the extractor).
- Mobile chip rendering: mobile/screens/chat/MaxChatScreen.tsx -> serverChoices/multiChoice state (around lines 368-370), quickReplies (around line 726); tapping a chip calls sendMessage(choice).

Never-re-ask / known facts:
- Injection: backend/services/lc_agent.py around lines 453-460 injects user_facts / KNOWN PROFILE near the top of the system prompt; the "NEVER RE-ASK KNOWN FACTS" section is the rule.
- Facts store + rendering: backend/services/user_facts_service.py (FACTS_KEY, merge, "render as compact prompt block").
- Personalization: backend/services/personalization.py.

Onboarding screens: mobile/screens/onboarding/OnboardingV2Screen.tsx (initial, static) and OnboardingScreen.tsx. Per-maxx intake is LLM-driven through the chat agent (same MCQ system).

## What to build (design — refine as you go)

A) Make Max ASK for broad questions. Strengthen the MCQ prompt section so that for personal-recommendation questions whose answer depends on unknown facts, Max leads with ONE clarifying MCQ instead of a generic answer. Do NOT make it ask when it already knows enough (use KNOWN PROFILE) or for general-knowledge questions. A trailing plain-text question is a FAILURE; it must be emitted as a CHOICES or CHOICES_MULTI marker so chips render.

B) Custom-answer option ("only as needed"). Add a way for the model to mark a question as allowing a typed answer. Suggested approach (pick the cleanest): include an explicit "Other" sentinel as the last option when appropriate, and in the mobile chip renderer make an "Other" / "Something else" chip FOCUS the text input instead of sending. Update the prompt so the model adds it only when a custom answer is plausible. Apply the same renderer to per-maxx intake. Keep single-pick vs multi-pick semantics intact.

C) Custom option in OnboardingV2. For the static onboarding questions where a free-text answer is reasonable, add an "Other -> type" affordance.

D) Stop cross-maxx repeats. Ensure every fact captured during onboarding / any maxx intake is persisted into the user_facts / KNOWN PROFILE blob, and that the per-maxx intake reads it and skips already-known fields. The likely real bug: onboarding answers never land in user_facts (they may only be extracted passively from chat and missed). Audit and fix that gap.

## CRITICAL setup (do this FIRST, before any behavioral test)

- python3.14 breaks langchain; use the prebuilt venv at backend/.venv312 (if missing: python3.12 -m venv .venv312 then .venv312/bin/pip install -r requirements.txt).
- PIN the LLM so local responses are reliable. The default provider gemini has no key locally and the failover hits a Claude timeout, returning the "trouble reaching my brain" fallback. Start the backend like this (one line), from /Users/home/maxapp/backend:

    LLM_PROVIDER=openai .venv312/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000

  (OPENAI_API_KEY is already in backend/.env. It connects to the real Supabase.)
- SANITY CHECK before any behavioral assertion: POST /api/chat/message with body {"message":"hey"} must return a real response, not the fallback. If it returns the fallback, fix the provider FIRST; never run behavioral assertions against a failing LLM.
- Restart the backend after EVERY backend edit: run "lsof -ti :8000 | xargs kill -9" then relaunch. Never leave two on the port.
- Get a paid test user token: POST /api/auth/faux-signup-skip with body {} returns access_token. Use it as a Bearer token on chat calls.

## How to test (be rigorous)

BEHAVIORAL (the LLM is nondeterministic, so run each prompt 5 times and assert a hit RATE, not a single pass):
- Broad question asks MCQ: POST /api/chat/message with {"message":"what skincare should i use"} and the token; ASSERT the JSON has a non-empty choices list, NOT a generic protocol. Repeat with "build me a workout", "what should i eat", "help with my hair".
- Custom option only when warranted: for "what's bothering you about your skin" ASSERT the choices include an Other/custom sentinel; for "what's your skin type" ASSERT they do NOT.

DETERMINISTIC (prefer these, they are fast and reliable):
- Marker parsing: unit-test the CHOICES / CHOICES_MULTI / Other extractor in api/chat.py with crafted strings.
- Criterion 4 made deterministic (do not rely on a flaky multi-turn sim): directly write a fact via user_facts_service (e.g. wake_time = 07:00), rebuild build_agent_system_prompt for that user, and ASSERT the KNOWN PROFILE block contains it; then send a new-maxx intake message and ASSERT the reply does not ask for wake time. Separately verify the intake path actually writes answers into user_facts (read the blob after the call; short poll if it is a background task).
- Mobile: compile-check edited tsx files with: node -e "require('@babel/core').transformFileSync('FILE', {presets:['babel-preset-expo']})" (replace FILE).
- UI affordance (Other chip focuses input): verify by reading the renderer plus a compile check. Optional: maestro MCP (flows in mobile/maestro/) against the iOS simulator, but do NOT block the loop on maestro if it is flaky.

## Success criteria (loop stops when ALL hold)

1. Broad personal-rec questions return choices at least 4 of 5 runs each, for at least 4 distinct broad prompts.
2. Questions that warrant it include an Other/custom option that focuses the text input; closed questions do not.
3. OnboardingV2 has a custom option on the questions that need one.
4. A seeded known fact is NOT re-asked by a new maxx's intake, AND intake answers are confirmed to persist into user_facts.
5. No regression: specific questions (such as "what percent niacinamide") still answer directly without forcing an MCQ; existing MCQ examples still work; product links and length preferences are unaffected.

## Constraints

- Create and work on a branch: git checkout -b fix/chat-onboarding-mcq. Commit each verified step there. Do NOT push to main per-change (it auto-deploys experimental prompts to prod and spams test users into the prod Supabase). When ALL criteria pass: summarize the diff, STOP, and let the human review and merge. Do not merge to main yourself.
- Preserve the existing chat voice/quality (a chat-alpha baseline is blessed). Tighten behavior; do not rewrite the persona. Keep the system prompt within its token budget (it is already compressed).
- Do NOT start EAS/TestFlight builds.
- STOP conditions: cap at about 25 iterations; if criteria still fail, STOP and report exactly which one fails plus your best diagnosis rather than thrashing. After finishing, list the throwaway test-user emails you created (they are in the prod Supabase) so they can be cleaned up.

## Additional requirement E: product previews (Amazon-style cards at the bottom)

Right now product links feel oddly placed and inconsistently named. The links suggested by the chatbot are emitted as inline markdown in the LLM's prose, so the titles are whatever the model wrote and the placement is wherever it dropped them. Rework the whole product-surfacing UX into clean preview cards.

Current state (verified — read these before changing anything):
- Catalog: backend/data/product_catalog.yaml. Each of the 72 entries has: id, name, brand, module, concerns, url (a DIRECT amazon.com/.../dp/ASIN page), price_tier, tags (fact flags), rationale (a short, OUR-words "why recommended", at most 120 chars), references. There is NO image field yet.
- recommend_product tool + readers: backend/services/lc_agent.py (returns a CATALOG-VETTED block to the LLM), backend/services/product_catalog.py (loads the yaml), backend/services/fast_product_links.py (name to ASIN/url resolution), backend/services/link_validator.py.
- Chat response shape: backend/api/chat.py returns response, choices, multi_choice, input_widget, conversation_id.
- Mobile (current, to be replaced): mobile/screens/chat/MaxChatScreen.tsx -> extractProductLinks (around line 734) parses markdown [label](url) out of the message text, stripProductLinkLines (around 750) removes those lines, productLinksContainer (around 999) renders them at the bottom as plain links. Depending on the LLM to emit well-formed markdown links in prose is exactly why titles/placement are off.

What to build:
1. Stop relying on LLM-emitted inline markdown links for the cards. Return a STRUCTURED products array in the chat API response (the same way choices is returned), populated from the recommend_product results. Each product object should be: name, brand, url, description, image.
   - name, brand, url come straight from the catalog (authoritative) so titles are always correct.
   - description is OUR words (Max's voice), NOT Amazon's copy. Use the catalog rationale or a slightly richer one-line Max-voice blurb. Never scrape or paste Amazon's product description.
   - image is a product image URL. The catalog has none today: add an image field to product_catalog.yaml with a curated, working image URL per entry (most reliable). ASIN-derived Amazon image URLs are unofficial and frequently break, so prefer curated and verify each one loads (HTTP 200). If an image is missing, the card must still render gracefully without it.
2. Mobile: render the products array as Amazon-style preview cards at the BOTTOM of the assistant message: product image, the product name, and the our-words description underneath, the whole card tappable to open url via Linking.openURL.
   - If there are more than about 2 products, lay them out as a horizontal SLIDER (horizontal FlatList or ScrollView), Amazon-carousel style, so they never stack into a wall.
   - Replace extractProductLinks / stripProductLinkLines / productLinksContainer with this structured rendering.
3. Keep the LLM prose clean: it should mention products conversationally by name and let the cards carry the links. No naked URLs and no oddly-placed inline markdown links left in the text.

Test:
- Backend: trigger recommend_product (or a chat turn that surfaces products) and assert the response carries a products array where name, url, description (our-words), and image are populated for catalog hits. Verify the curated image URLs return HTTP 200 (curl -I).
- Mobile: compile-check MaxChatScreen.tsx; verify the card plus horizontal-slider renderer by reading it (optionally a maestro flow).

Add this to the success criteria:
6. Recommended products render as Amazon-style cards at the bottom of the message (image, name, and our-words description), each tappable to the correct Amazon page, with a horizontal slider when there are several. Card titles match the catalog name (never an LLM-invented label), descriptions are in Max's voice (never Amazon's), and no oddly-placed inline product links remain in the prose.

## Additional requirement F: formatting, SAFETY, off-topic, and scroll re-generate

### F1 (P0 — SAFETY): crisis / self-harm responses

RIGHT NOW the chat has NO self-harm handling. A message like "I wanna kms" (kill myself) gets a normal skincare/diet answer AND a product card. This is a serious harm + liability gap and is the top priority of this task.

Build a DETERMINISTIC guardrail that runs BEFORE any LLM / RAG / agent routing in `backend/api/chat.py` (the chat turn entry, near where the message text is first available — before the fast-RAG and agent paths). Detect self-harm / suicidal ideation with a reliable matcher (phrases and common variants: "kms", "kill myself", "end it all", "want to die", "suicidal", "hurt myself", "no reason to live", etc. — be generous; false-positives toward safety are acceptable here). When matched, SHORT-CIRCUIT: return a brief, warm, human response that (a) takes it seriously and expresses care, (b) points to crisis resources (US: 988 Suicide & Crisis Lifeline, call or text 988; and "if you're in immediate danger call 911" / local emergency), (c) does NOT give looksmaxxing/skincare/coaching content, (d) returns an EMPTY products array and NO product cards, no MCQ, no schedule actions. Keep Max's caring voice but drop the coaching. Do not diagnose. (If you can localize beyond the US later, fine, but ship the US 988 baseline now.)

Do NOT rely on the LLM alone to catch this — the deterministic pre-check is the guarantee. You may ALSO add a system-prompt instruction as a second layer, but the pre-check is what must pass the test.

### F2: dense paragraphs -> numbered lists + bold

Answers come back as dense walls of text (e.g. a "tips to sleep well" reply that's one long paragraph). Multi-point / how-to / listy answers must render as a NUMBERED LIST (or tight bullets) with the key term of each point in **bold**, not a paragraph. Single-fact answers stay short prose (don't force a list on everything).
- This is mostly a PROMPT change: strengthen the structure rule in `build_agent_system_prompt` (`backend/services/lc_agent.py`, the VOICE section already says "structure multi-step answers" but the model ignores it) — make it explicit: when the answer is 3+ tips/steps/points, output a numbered markdown list with each item's lead phrase in **bold**.
- The mobile renderer `mobile/utils/chatMarkdown.ts` (`renderRichText`, used in MaxChatScreen) already handles `**bold**` and `### headings`. VERIFY it renders ordered lists ("1. ", "2. ") and bullets cleanly; if not, add it. Keep the lowercase voice — bold/lists are about structure, not capitalization.

### F3: off-topic / unrelated answers

The bot sometimes answers something unrelated to the question (separate from the safety case above). Investigate the routing in `backend/api/chat.py` (fast-RAG vs agent) and the RAG retrieval — a likely cause is the fast-RAG path answering from whatever module context is loaded rather than the actual question. Ensure the answer addresses the user's actual message; when the question is broad, the MCQ behavior from requirement A handles it.

### F4: chat "regenerates" when you scroll up then back down

Scrolling up and back down re-runs the answer (the typing animation re-plays / the message appears to regenerate). Likely cause: the per-message typing animation (`animate` flag on the AnimatedText component in `MaxChatScreen.tsx`, ~line 351-382) re-fires when the FlatList recycles the row on scroll, OR a focus/scroll refetch re-seeds messages. Fix so a message animates ONCE (when it first arrives) and never re-animates on scroll/re-render — e.g. gate the typing animation on a per-message "already shown" flag, not on every render. Do not refetch/re-seed history on scroll.

### Tests
- SAFETY (deterministic — must be rock solid): POST /api/chat/message with each of "i wanna kms", "i want to kill myself", "i'm going to end it", "i feel suicidal". ASSERT the response contains crisis support (mentions 988) AND does NOT contain skincare/coaching content AND returns an empty products array / no product card / no choices. Run a few non-crisis controls ("i want to lose weight", "my skin sucks") and ASSERT they are NOT misrouted to the crisis response.
- FORMATTING: ask "give me tips to sleep well" / "how do i start a skincare routine" 5x each; ASSERT the reply contains a numbered list (lines starting "1." / "2.") and at least one **bold** span when there are 3+ points. Single-fact questions ("what's a good spf number") should NOT be forced into a list.
- SCROLL: verify by reading the animation-gating logic (and optionally a maestro scroll flow) that a message has an immutable "shown" flag so it can't re-animate.

### Add to success criteria
7. Self-harm/crisis messages short-circuit to a caring crisis response with the 988 resource, no coaching, and no product cards; non-crisis messages are unaffected.
8. Multi-point answers render as numbered lists with bolded lead phrases; single-fact answers stay short prose.
9. A chat message animates once and never re-generates/re-animates on scroll.

## Additional requirement G: the task-guide screen (pressing a habit on Home)

Pressing a habit/task on the Home screen opens a step-by-step guide screen. Make that whole flow reliable and complete.

Where the code is (verified):
- Mobile screen: `mobile/screens/task/TaskGuideScreen.tsx` (a swipeable pager: intro page with overview + "What you'll need" products, then one page per step, then a done page). Opened from `mobile/screens/home/HomeScreen.tsx` via navigation to 'TaskGuide'. Data via the `useTaskGuide(scheduleId, taskId)` hook -> `api.getTaskGuide` -> backend `GET /api/schedules/{scheduleId}/tasks/{taskId}/guide`.
- Backend: `backend/services/task_guide_service.py` — `get_task_guide` (cache-or-generate), `_generate_guide` (LLM, already wrapped in a 22s timeout + grounded fallback), `pregenerate_for_schedule` (warms the cache), cache table `task_guides`. The guide shape is { overview, steps[{n,title,body,tip}], products[{name,note}], duration_minutes, why_it_matters }.
- Preload: `mobile/lib/prefetchMainTabData.ts` fans out guide prefetches after the schedule loads; `pregenerate_for_schedule` is fired on schedule create/adapt.

Goals:
1. RELIABLE — never an infinite "Preparing your guide…". It must always resolve to a guide (or a clear, retryable error) within a few seconds. The backend timeout is in place; ALSO add/verify a client-side timeout + retry so a stuck request can't spin forever, and confirm the loading state can't get stuck.
2. INSTANT via PRELOAD — every task in the user's active schedule(s) should have a cached guide so the FIRST tap is instant, not a 20s generate. Verify `pregenerate_for_schedule` covers ALL distinct tasks (every day, every active maxx, deduped), runs on create/adapt, and that the mobile prefetch warms them. If existing schedules aren't covered, add a one-time backfill path (there's an admin backfill endpoint — wire it or call pregenerate for all active schedules).
3. GOOD CONTENT — 3-5 simple, do-this-now steps + the products list, formatted cleanly (consistent with the numbered-list/bold formatting goal in requirement F2). No empty/garbage guides; the grounded fallback must be genuinely useful, not "get set up / do the work".
4. NO DEAD INTERACTIONS — exercise the screen: open from Home, swipe through steps, the products list renders + links open, the done/close action works, and re-opening a task is instant from cache. Fix anything broken.

Tests:
- Backend (use a paid test user that has a generated schedule — create one via the schedule path, or seed one): for EACH task in the active schedule, call get_task_guide and ASSERT it returns within the timeout with >=3 steps and the products key present. Then call pregenerate_for_schedule and ASSERT the cache (`task_guides`) is populated for every distinct task, so a subsequent get_task_guide is an instant cache hit.
- Mobile: compile-check TaskGuideScreen.tsx; verify the loading -> guide and loading -> error transitions both terminate (no infinite spinner), and that products + steps render.

### Add to success criteria
10. Pressing any habit on Home opens its guide that loads instantly when pre-warmed and within a few seconds cold, never hangs, shows 3-5 clean steps + the products it needs, and all on-screen interactions (swipe, product links, done/close) work. Every task in an active schedule has a pre-generated cached guide.

## Additional requirement H: durable cross-app memory (remember AND apply facts everywhere)

Max must remember things a user reveals ANYWHERE and apply them EVERYWHERE relevant. Example: the user says "i'm vegetarian" in chat once -> later, a generated meal/diet plan has no meat, onboarding a NEW maxx doesn't re-ask diet and respects it, and product recs stay vegetarian. This must also cover more nuanced facts, not just diet flags (allergies, dislikes, schedule constraints like "i work nights", equipment, skin sensitivities, goals, etc.).

This is broader than requirement A/C's "don't re-ask" — it's about CAPTURE (reliably) + APPLICATION (in every feature, not just chat).

Where the code is (verified — the plumbing exists; make it actually work end-to-end and broad):
- Store: `backend/services/user_facts_service.py` — the durable fact blob (FACTS_KEY in user_schedule_context.context.user_facts), with `extract_facts_from_message(text)` (passive capture from chat), `facts_from_onboarding(onboarding)`, `merge_facts`, `format_facts_for_prompt`, and `hard_constraints_reminder` (a hard diet/allergy enforcer).
- Explicit capture: the `remember_about_user` tool in `backend/services/lc_agent.py`.
- Apply in chat: facts are injected into the system prompt (lc_agent.py ~531, KNOWN PROFILE) — already wired.
- Apply in schedule/meal generation: `backend/services/schedule_generator.py` (see ~line 131, it intends to respect vegetarian macros etc.) and `services/schedule_service.py` / `master_schedule.py`. VERIFY generation actually loads user_facts and respects them; this is the most likely gap.
- Personalization brief: `backend/services/personalization.py`.

What to make true:
1. CAPTURE is reliable and broad. `extract_facts_from_message` (and/or the remember tool) must catch durable facts whenever stated in chat: diet ("i'm vegetarian/vegan", "no dairy"), allergies, dislikes, constraints ("i work nights", "no gym, home only"), sensitivities, goals, etc. Broaden it where it misses obvious ones. Don't store ephemeral chatter (only durable, reusable facts).
2. APPLICATION everywhere a schedule/plan/answer is produced reads the SAME user_facts blob and respects it:
   - chat (already injected) — keep.
   - new-maxx schedule + any meal/diet plan generation — must pull user_facts and never violate a hard constraint (no meat for a vegetarian, no allergen, etc.). hard_constraints_reminder exists; ensure the generator uses it / the facts.
   - onboarding a new maxx — don't re-ask known facts AND apply them (ties to requirement A/C).
   - product recommendations — already filter on diet tags via the catalog; confirm it uses the facts.
3. One source of truth: everything reads/writes the SAME user_facts blob (no parallel, drifting stores).

Tests (deterministic-leaning):
- Capture: POST a chat message "i'm vegetarian" for a test user, then read user_facts_service for that user and ASSERT a vegetarian/diet fact is stored. Repeat for an allergy ("i'm allergic to peanuts") and a constraint ("i work night shifts").
- Apply in generation: with vegetarian stored, generate a schedule/meal plan that includes diet/food (e.g. the fitmax/diet path) and ASSERT no meat/fish appears in the generated tasks/meals; with the peanut allergy stored, ASSERT no peanut product is recommended.
- Apply in chat after capture: ask "give me a meal plan" and ASSERT the reply is vegetarian without the user restating it.
- No re-ask: starting a new maxx after the fact is stored does not ask for diet again (covered by criterion 4, re-verify in this context).

### Add to success criteria
11. A durable fact stated once in chat (e.g. "i'm vegetarian", an allergy, a schedule constraint) is captured into the single user_facts store and is then respected everywhere: chat answers, newly generated schedules/meal plans (no hard-constraint violations), product recs, and new-maxx onboarding (applied, not re-asked).
