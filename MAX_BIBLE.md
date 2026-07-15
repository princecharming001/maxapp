# Max — Source of Truth & Language Bible

> The canonical explanation of what Max is, how it works, and the exact words we use to talk about it. When any other doc, screen, or model output disagrees with this file, **this file wins.** Keep it current; treat edits here as edits to the product's definition.

_Last reconciled: 2026-07-13 (Apple-native billing only; single-plan "Chad"; Chad Lite retired/grandfathered; trial = subscription)._

---

## 1. What Max is, in one breath

**Max is a looksmaxxing coaching app.** You scan your face, Max builds you a daily routine across the things that actually move the needle — skin, hair, body, jaw/bone, height/posture — and then coaches you through it day by day like a friend who knows this stuff and wants you to win.

The promise, said plainly: **get hotter, more confident, more yourself — with a plan that's concrete and a coach that's honest.**

It is not a wellness blog, not a generic self-care app, and not a medical product. It's candid, results-first, and native to the looksmaxxing / lookism community it serves.

---

## 2. Names & codenames (read this first — the naming is layered)

| You'll see | It means |
|---|---|
| **Max** | The product's real, user-facing name. The app icon says "Max." Also the name of the in-app AI coach. |
| **maxapp** | Informal/internal name for the whole project + repo. Same thing as "Max." |
| **cannon** | The original codename. Lives on in the bundle id, App Group, and URL scheme. Not user-facing. |
| `com.cannon.mobile` | iOS bundle identifier. |
| `cannon://` | The app's URL scheme (e.g. widgets deep-link to `cannon://today`). |
| `group.com.cannon.mobile` | The App Group shared between the app and its widgets. |
| **Cannon** (the repo at `/Users/home/Cannon`) | A **different, older** project. Not this. This app lives at `/Users/home/maxapp`. |

**Rule:** to users it is always **Max**. In code/infra you'll meet **cannon**. Never expose "cannon" in UI or copy.

---

## 3. The Lexicon (the language bible)

These are load-bearing words. Use them exactly; don't invent synonyms.

- **Looksmaxxing** — the practice of systematically improving your appearance. The whole domain the app is about. First-class term; never soften it to "grooming" or "self-care."
- **max** (verb / suffix) — to optimize a specific area. "Skinmax," "jawmax," etc.
- **a maxx** (noun) — one of the app's **programs**. Spelled with the double-x when we mean a program/track. There are **five native maxxes**:
  - `skinmax` — skin.
  - `hairmax` — hair.
  - `fitmax` — body / training.
  - `heightmax` — height & posture.
  - `bonemax` — jaw & bone structure.
  Their coaching content lives in `backend/rag_content/<maxx>/`. In code, the program id is the `maxx_id`.
- **Scan** — a face scan. The user submits photos (front + left/right profile); a separate facial-analysis service (MediaPipe, `cannon_facial_analysis/`) computes metrics, and the model returns a **PSL-style rating** across six categories (jawline, etc.) plus an overall. Scans are the on-ramp: scan → results → plan.
- **PSL** — the community's face-rating scale (from the lookism forums). Ratings are calibrated "like experienced forum raters": honest, specific, full 0–10 range. Not medical, not surgical advice.
- **Max (the coach)** — the in-app AI. See §5 for voice. Users text Max like a friend; Max builds/adjusts their routine and answers questions from their program's protocol.
- **Routine / Plan / Schedule** — the user's daily set of things to do, generated from their active maxxes. Interchangeable in copy; in code it's the **schedule**.
- **Task** — one item on the day's plan (e.g. "Mewing hold, 4:30p"). A **task guide** is an LLM-generated step-by-step how-to for a task, cached server-side.
- **Streak** — consecutive days the user closed out their plan. A core motivation surface (the Streak widget, the ring). Measured in **days** (label: "days," not a flame emoji).
- **Chad** — the **single subscription plan** and the "full access" tier. Internally the tier string is `premium`.
- **Chad Lite** — the **retired** cheaper tier (internally `basic`). No longer sold. Existing Lite subscribers are **grandfathered**: they keep their old price and get full Chad benefits. Never build new features that split Lite from Chad.
- **Creator / Creator maxx** — a third-party coach ("creator") who publishes their own course/program in the app. Creator subscriptions are separate Apple IAP products (`com.cannon.creator.<...>`).
- **Native maxx vs creator course** — the five maxxes above are **native** (included in the Chad subscription, subject to active-program slot caps). Creator courses are their own paid products.

**Community register:** terms like `bonesmashing`, `mewing`, `cope`, `ngmi`, `psl` are legitimate, first-class topics. Treat them the way the user does. Be candid — if the evidence says something is mostly cope for adults (e.g. mewing on closed sutures), say so. **Candid, never cruel** — no slurs, no "subhuman."

---

## 4. The core loop (how the product actually works)

```
  SCAN ──▶ RATE ──▶ PLAN ──▶ DO (daily) ──▶ STREAK
   ▲                  │           │             │
   └──── COACH (Max) ◀┴───────────┴─────────────┘
         adjusts the plan, answers questions, remembers you
```

1. **Scan** — user photographs their face; the analysis service + model produce a PSL rating and surface weak points.
2. **Plan** — from the user's active maxxes, the backend builds a merged daily **schedule** of tasks with times.
3. **Do** — the user works the plan each day, checking tasks off (in-app, and now from the Home Screen widget).
4. **Streak** — closing the day advances the streak; retention/achievement systems reinforce it.
5. **Coach** — **Max** (the AI) is the connective tissue: it chats, remembers the user's facts, adjusts the routine, and recommends products — always in-voice.

---

## 5. Voice & tone (Max, the coach — and the brand)

This is the exact persona the chat model is tuned on. Product copy should rhyme with it.

**Who Max is:** the friend who's actually been in the trenches — tried the routines, wasted money on junk, figured out what works. Sharp, a little blunt, warm underneath. The older brother who tells you the truth nobody else will, then helps you fix it. Has opinions and backs them ("tret over ten serums," "honestly that's a waste of money").

**How Max talks:**
- Like texting a friend who happens to be the expert. **Short. lowercase. contractions always** (you're, gonna, idk, ngl).
- Reacts like a person before informing like a coach. Frustrated? feels it for a beat. Spiraling over one zit? brings them back down first.
- Has rhythm — a one-word line, then a real one. Fragments when they hit harder. **Never paragraphs.**
- Remembers them and uses it ("you said fragrance wrecks your skin, so skip this").
- Dry humor, the odd "honestly"/"ngl" when real, never forced. **Emoji almost never.**

**What Max never does:** sound like an AI. No disclaimers, no "as your coach," no over-explaining, no hedging every base. Pick the one thing that matters and say it. Never lecture or moralize — give the move and trust them with it.

**Brand copy** inherits the spirit: direct, confident, anti-cringe, no corporate wellness-speak. (Design-side rule: **never use Apple/system emoji in UI.**)

---

## 6. Entitlement model — the money truth (INVARIANTS)

These are non-negotiable. Code must uphold them.

- **Billing is Apple-native only.** All subscriptions are Apple IAP / StoreKit, verified server-side via the App Store Server API (`services/apple_iap_service.py`). **Stripe billing is retired** — every Stripe subscription endpoint returns `410 Gone` (`STRIPE_BILLING_RETIRED`). Never build new card-billing paths.
- **One plan: Chad** (`premium`). Chad Lite (`basic`) is retired; every entitlement path collapses `basic → premium`. Legacy Lite subs are grandfathered at their old price with full Chad access.
- **Trial = subscription = full access.** A user on the **free trial** has the **identical** entitlement to a paying subscriber. There is **no permission difference** between "in trial" and "subscribed." Never gate any feature on trial-vs-subscriber. (Apple treats the trial window as an active subscription; the tier resolves to `premium`.)
- **The only access split** is: _full access_ (trial **or** subscription) **vs** the browse-only **free tier** (users with neither, who can see the app but not use it — `usePaywallGate`).
- **Server is the source of truth.** `is_paid` and `subscription_tier` live on the user record; the client reads them. Never trust a client-reported product id in production.
- **Product recommendations** come **only** from `backend/data/product_catalog.yaml`; `link_validator.py` rejects any URL not in it. Max never invents a buy link.

Frontend flags that follow from the above (`context/AuthContext.tsx`):
- `isPaid` = has any active entitlement (trial or sub) → passes the action paywall.
- `isPremium` = Chad or admin → unlocks Chad extras (e.g. a 3rd active-program slot). Because everything resolves to `premium`, trial users are `isPremium`.

---

## 7. Surfaces (where users meet Max)

- **Onboarding funnel** — scan-first / plan-reveal → paywall. The root navigator is keyed on auth+paid state; flipping `isPaid` swaps the unpaid funnel for the full app.
- **Today** — the home surface: the day's plan, next-up, streak, check-off.
- **Coach (chat)** — texting Max; the AI agent (schedule CRUD, product recs, knowledge search, memory).
- **Maxxes / Marketplace** — start/stop programs (native maxxes included, slot-capped) and creator courses.
- **Scan** — capture + PSL results + progress archive.
- **Home Screen & Lock Screen widgets** — a **Today "day rail"** (a timeline of the day's maxes with tappable circular checkboxes; check off without opening the app, iOS 17+) and a **Streak ring** (streak count inside a progress ring that fills orange→blue and turns green when the day's done). Widgets show **real data only** — blank ("MAX · open the app") before sign-in, never sample tasks. Deep-links open the app to Home.

---

## 8. Architecture at a glance

Monorepo at `/Users/home/maxapp` (see `CLAUDE.md` for the deep dev guide):

- **`backend/`** — FastAPI (Python 3.12), ~23 routers under `/api`, Postgres via Supabase (transaction pooler, port 6543). Deploys to **Render** (`maxapp-api`) on push to `main`.
- **`mobile/`** — Expo / React Native (SDK 54, RN 0.81), **iOS-first**, ships to **TestFlight via EAS** (`com.cannon.mobile`, ASC app `6761345332`). State via React Query; auth via Bearer token.
- **`cannon_facial_analysis/`** — separate FastAPI + MediaPipe service computing scan metrics; the backend calls it over HTTP.
- **The coach** — LangChain tool-calling agent (`services/lc_agent.py`) with a fast RAG path or the full agent; multi-provider LLM with failover (HF fine-tune default). Persona in `services/prompt_constants.py` (do not embellish — it's the tuned text).
- **Personalization** — a persisted `KNOWN PROFILE` of user facts injected into the prompt; the "never re-ask what we know" mechanism.

**Design system** (`mobile/theme/`): clean **B&W ink** — near-black `#111113` on white, neutral grays, a single **blue accent** `#2C6BED`, green `#2F9E60` for success. Serif = Fraunces, sans = Matter. No rainbow, no emoji in UI.

---

## 9. What Max is NOT

- Not medical, diagnostic, or surgical advice. Ratings and routines are appearance-optimization guidance for a consenting user.
- Not a hype machine and not a corporate wellness app — the whole point is candor.
- Not multi-tier: there is one plan (Chad). Don't reintroduce tier-splitting.
- Not card-billed: Apple IAP only.
- Not a place for invented product links or fabricated protocols.

---

## 10. Ground-truth invariants (quick reference)

1. User-facing name is **Max**; **cannon** is internal only.
2. **Trial = subscription = full access.** Never gate features by trial-vs-sub.
3. **Apple IAP only.** Stripe is retired (410).
4. **One plan: Chad** (`premium`); Chad Lite retired but grandfathered; `basic → premium` everywhere.
5. Product recs only from `product_catalog.yaml`.
6. Server is the entitlement source of truth; never trust client product ids in prod.
7. Widgets show real data or a blank state — never sample tasks.
8. Coach voice: short, lowercase, candid, no AI-speak, no emoji.
9. Five native maxxes: `skinmax`, `hairmax`, `fitmax`, `heightmax`, `bonemax`.
10. Candid, never cruel.
