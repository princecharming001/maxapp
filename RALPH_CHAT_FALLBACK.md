# RALPH LOOP — Off-topic chat queries must fall back to web/general, not return wrong-topic docs

## STATUS / READ THIS FIRST
- **Nothing here is implemented yet.** Done = a not-in-docs / off-topic chat query (e.g. "fat loss
  meal plan") returns a RELEVANT answer (from general knowledge + web), never an irrelevant on-topic
  doc answer (e.g. skincare), AND in-docs queries still answer from the docs — verified with backend
  scripts/pytest (this is chat logic, not UI).

## 1. THE BUG (root cause confirmed — a chain, fix all links)
A nutrition query returns skincare because:
1. **Intent/scoping locks to the active max.** `backend/services/intent_classifier.py` is keyword-based;
   "fat loss meal plan" (no "gym/workout/fitmax/calorie") gets no fitmax hint, so it defaults to
   `active_maxx` (skinmax). Retrieval is then scoped to the skinmax index.
2. **No real relevance gate.** `backend/services/rag_service.py` applies `min_similarity≈0.35` AFTER
   ranking; marginal skincare chunks (any mention of "diet/nutrition") pass and get returned.
3. **EVIDENCE-ONLY forces an answer.** `backend/services/fast_rag_answer.py` `answer_from_chunks()`
   (system prompt ~L537–548) says "answer using ONLY the provided Evidence" — so the model answers the
   nutrition question from skincare chunks. There is NO topic-mismatch check.
4. **Web fallback fires only on a refusal phrase.** `backend/api/chat.py` (~L2593) runs web search
   only if the answer matches `_looks_like_doc_refusal()` ("don't see enough in the docs"). A confident
   off-topic answer never matches → web search never fires. A real `web_search` service already exists
   (`backend/services/web_search.py`, DuckDuckGo, free, no key).

## 2. THE FIX (generic — do NOT just add keywords)
The durable fix is a **relevance gate + a real fallback**, not chasing keyword lists:
- After retrieval, decide whether the evidence actually answers THIS query. If the top chunks are
  off-topic / below a real confidence bar (or from a different max than the query is about), treat it
  as **not in docs** — do not answer from them.
- When there's no relevant doc evidence, **fall back to general knowledge + web search** and answer the
  actual question in Max's voice — instead of forcing a doc answer or returning a bare refusal.
- Keep doc-grounded answers for queries the docs genuinely cover (no regression).

## 3. KEY FILES
- `backend/api/chat.py` — `process_chat_message()` (~L2175); fast-RAG routing (~L2534) and the web
  fallback block (~L2593) gated by `_looks_like_doc_refusal()` (~L4253). Broaden the fallback trigger.
- `backend/services/fast_rag_answer.py` — `answer_from_rag()` (~L864), `answer_from_chunks()` (~L492,
  the EVIDENCE-ONLY prompt ~L537), tier-2 broad fan-out (~L916), final miss (~L969). Add the relevance
  gate + route to fallback.
- `backend/services/rag_service.py` — `retrieve_chunks()` (~L290), BM25 `top_k` min-score (~L101).
- `backend/services/web_search.py` — `search()` (~L41); already returns snippets. Use it for the
  fallback answer.
- `backend/services/intent_classifier.py` — keyword routing (~L103). Improve so nutrition routes to
  fitmax, but treat this as secondary to the relevance gate (the gate must catch mis-routing anyway).
- LLM: `get_chat_llm_with_fallback` / `lc_providers.py` — the general-knowledge answer path.

## 4. SUCCESS CRITERIA

### SC1 — Off-topic query never returns wrong-topic doc content
- "fat loss meal plan", "best running shoes for flat feet", "how much water should I drink a day", and
  a random general question, asked while skinmax (or any unrelated max) is active, must NOT return a
  skincare/other-max answer. They return a relevant answer (general/web) or a clean "here's the
  general take" — never irrelevant grounded content.
- VERIFY (pytest/script): assert the reply to "fat loss meal plan" contains nutrition/meal content and
  contains NO skincare terms (cleanser/SPF/retinoid/serum/acne).

### SC2 — Relevance gate on retrieved evidence
- In `answer_from_chunks()` (and/or before it), reject evidence that doesn't match the query topic:
  use a real confidence bar (raise/enforce the similarity gate as a HARD cutoff, not post-rank
  decoration) AND a topic-match check (e.g. the chunk's max/topic vs the query). If evidence fails the
  gate → return "no relevant evidence" so the caller routes to fallback (don't answer from it).
- VERIFY (pytest): feed a nutrition query with only skincare chunks → `answer_from_chunks` yields the
  no-relevant-evidence signal (not a skincare answer).

### SC3 — Web + general-knowledge fallback actually fires
- The fallback runs whenever there is **no relevant doc evidence** (retrieval miss OR relevance-gate
  fail) — not only when the model emits a refusal phrase. It answers the real question using general
  knowledge, enriched by `web_search.search()` when useful, in Max's voice and the user's
  tone/length settings. Guard against junk web results (the existing "no web results" checks).
- VERIFY (pytest/script): "fat loss meal plan" with no relevant docs → a coherent meal-plan answer
  (mentions calories/protein/meals), logged as using the fallback path; no crash, sane latency.

### SC4 — In-docs queries still ground in docs (no regression)
- A genuine skincax question ("what order do I apply niacinamide and moisturizer?") still answers from
  skinmax docs; a fitmax training question still uses fitmax docs. The relevance gate must not nuke
  legitimately-relevant evidence.
- VERIFY (pytest): an on-topic doc query returns the doc-grounded answer (uses chunks; no web needed).

### SC5 — Fat-loss meal plan is handled well specifically
- "fat loss meal plan" returns a useful meal-plan response. If the user has a fitmax profile
  (goal/calories/restrictions), personalize it; otherwise give a sensible general plan via
  general/web. Respect dietary restrictions the app already knows (don't suggest meat to a vegetarian).
- VERIFY (pytest): with a fitmax fat-loss user, the answer reflects a deficit/protein target and
  excludes any known dietary restriction.

### SC6 — No regressions / robustness
- Deterministic routing where possible; the fallback adds bounded latency (web timeout already short).
  No errors/500s on off-topic queries. Crisis/self-harm guardrail still short-circuits first. Existing
  chat tests pass.

## 5. CONSTRAINTS
- Don't break the crisis/self-harm short-circuit, the onboarding fast-path, or doc-grounded answers.
- Prefer the relevance gate (generic) over keyword whack-a-mole; keyword/intent tweaks are secondary.
- Use the existing `web_search` service; no new paid API/keys. Keep within current providers/timeouts.
- Don't fabricate citations; the fallback answer should read as Max's own general guidance.

## 6. LOCAL DEV SETUP (use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`, LLM_PROVIDER=openai for reliable local
  chat); `mobile/.env.local` → `http://127.0.0.1:8001/api/`. Start:
  `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- This is verifiable purely backend: call the chat handler / endpoint with the test queries above and
  assert on the reply. A Maestro chat sanity check is optional, not required.

## 7. WORK ORDER
1. SC2 relevance gate in fast_rag_answer (hard similarity + topic-match) → returns no-evidence signal.
2. SC3 broaden the fallback in chat.py to fire on no-relevant-evidence (not just refusal text) + answer
   via general knowledge + web_search.
3. SC1/SC5 verify off-topic + fat-loss specifically. 4. SC4 regression (in-docs still grounded).
5. SC6 robustness. Secondary: nudge intent_classifier so nutrition hints fitmax.

## 8. DEFINITION OF DONE
- Off-topic / not-in-docs queries fall back to general+web and answer relevantly (never wrong-topic
  doc content); in-docs queries still ground in docs; "fat loss meal plan" returns a real, restriction-
  aware plan. Backend-verified, no regressions. Commit in logical chunks.
