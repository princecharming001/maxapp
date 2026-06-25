# RALPH LOOP — Verify & harden every control in the Max chat drawer

## STATUS / READ THIS FIRST
- **Nothing is assumed working until proven.** Every control in the chat conversations drawer is wired
  in code today (see §2), so this loop's job is to **prove each one actually works at runtime and fix
  anything that doesn't** — down to the per-row trash icons. "A handler exists" ≠ "it works."
- Done = every control in §3 verified on the iOS simulator with Maestro (UI behavior) AND the
  server-side effects verified with backend scripts/pytest (delete really removes; tone/length really
  change the model output), with any bug found fixed.

---

## 1. WHAT THIS COVERS (the drawer in the screenshot)
The Max chat side-drawer: **"Max" title + X close**, **+ New chat**, a **RECENT** list of conversations
(each row = title + timestamp + **trash/delete** icon; long-press = rename), a **TONE** segmented
control (Softcore / Mediumcore / Hardcore), and a **LENGTH** radio list (Concise / Medium / Detailed).

## 2. CURRENT WIRING (already mapped — confirm reality matches)
- **Component:** `mobile/components/ChatConversationsDrawer.tsx`
  - X close → `onClose()` (~L315). + New chat → `handleNewChat()` (~L191) → `api.createChatConversation()`
    → `onCreated(id)` → `onClose()`. Row tap → `handleSelect(id)` (~L206) → `onSelect(id)`.
    Trash → `confirmDelete(conv)` (~L231) → Alert → `api.deleteChatConversation(id)` → `invalidate()`;
    if active, `onSelect('')`. Long-press → `startRename`/`commitRename` (~L211) →
    `api.renameChatConversation`. TONE → `applyTone()` (~L257) → `api.patchCoachingTone(backend)` →
    `refreshUser()`. LENGTH → `applyLength()` (~L278) → `api.patchResponseLength()` → `refreshUser()`.
- **Parent:** `mobile/screens/chat/MaxChatScreen.tsx` — `drawerOpen` state (~L493); drawer props
  (~L1229) `onClose/onSelect/onCreated`; a SEPARATE header `newChat()` (~L1219) that resets to a
  "pending new chat" WITHOUT creating a server conversation. (Two different new-chat paths — see SC2.)
- **API:** `mobile/services/api.ts` — `listChatConversations` (GET /chat/conversations),
  `createChatConversation` (POST), `renameChatConversation` (PATCH), `deleteChatConversation` (DELETE);
  `patchCoachingTone` (PATCH /users/coaching-tone), `patchResponseLength` (PATCH /users/response-length).
- **Backend:** `backend/api/chat.py` conversation CRUD + `backend/services/chat_conversations_service.py`
  (`delete_conversation` cascades to messages). Tone → `backend/services/persona_prompts.py`
  `tone_preamble()` prepended to the prompt. Length → `backend/services/lc_agent.py` reads
  `onboarding["response_length"]` and appends explicit length rules.

## 3. SUCCESS CRITERIA (verify each; fix anything that fails)

### SC1 — Open / close
- The drawer opens from the chat header and the **X** closes it (and tapping the backdrop, if that's
  the design). No stuck/half-open state. VERIFY (Maestro): open → screenshot → tap X → drawer gone.

### SC2 — New chat (and the duplicate-conversation bug)
- "+ New chat" in the drawer creates a fresh conversation, switches to it (empty thread), and it
  appears in RECENT. The header `newChat()` path and the drawer `handleNewChat()` path must not
  produce **duplicate** conversations or leave orphaned empty ones.
- **Investigate the duplicate "Fitmax plan" (two rows, same 1:31 PM) seen in the screenshot.** Find why
  duplicate conversations get created (e.g. onboarding/schedule-build creating a conversation twice, or
  both new-chat paths firing, or a conversation created per send). Fix so one logical chat = one row.
- VERIFY (Maestro + backend): create a new chat → exactly one new row; run a normal onboarding/build
  flow → no duplicate rows; (backend) assert no duplicate conversations created for one session.

### SC3 — Select / switch conversation
- Tapping a row opens THAT conversation: its messages load, the drawer closes, and the active id is
  set. Switching between two conversations shows the correct, distinct histories (no message bleed).
- VERIFY (Maestro): tap conv A → its messages; open drawer → tap conv B → B's messages (different).

### SC4 — Delete (the trash icon — the small one matters)
- Tapping a row's trash icon shows the confirm, and on confirm the conversation **disappears from the
  list immediately** and is **gone server-side** (and its messages). Deleting the ACTIVE conversation
  clears the open thread. Cancel does nothing.
- VERIFY (Maestro): delete a row → confirm → row vanishes; reopen drawer → still gone. (Backend/pytest):
  after delete, the conversation and its `chat_history` rows are removed; deleting a non-owned id 404s.
- GOTCHA: the trash icon is tiny and the confirm is a native `Alert` — give the icon a `testID`/
  `accessibilityLabel`, and handle the Alert in Maestro (tap "Delete" by text), then screenshot.

### SC5 — Rename (long-press)
- Long-pressing a row lets you rename it; the new title persists (reopen drawer → new title). Empty
  title is rejected/cancels. VERIFY (Maestro): long-press → type → submit → title updated.

### SC6 — TONE actually changes the reply
- Selecting Softcore / Mediumcore / Hardcore persists (survives reopening the drawer) AND **measurably
  changes the model's voice**. Prove it reaches the prompt, not just the DB.
- VERIFY: (Maestro/UI) the selected chip stays selected after close+reopen; (backend script/pytest)
  with coaching_tone=hardcore vs gentle, `tone_preamble()` returns different text and the assembled
  chat prompt contains the selected tone's preamble. Confirm the value the UI sends
  (gentle/default/hardcore) matches what the backend validates/applies — no silent enum mismatch.

### SC7 — LENGTH actually changes the reply
- Selecting Concise / Medium / Detailed persists AND **changes response length**. Prove the prompt
  carries the matching length rules.
- VERIFY: (Maestro/UI) selection persists across reopen; (backend script/pytest) with
  response_length=concise vs detailed, the assembled prompt contains the corresponding length-rule
  block; a real chat reply with "concise" is materially shorter than with "detailed".

### SC8 — No regressions / robustness
- All API failures surface a non-crashing error (the existing Alerts) and never leave the UI in a
  broken state. Rapid taps (double new-chat, delete while creating) don't corrupt state. App
  cold-starts clean; `npx tsc --noEmit` clean for touched files.

## 4. CONSTRAINTS
- No new native deps. Keep the existing API/endpoint contracts unless fixing a real bug requires a
  change (then update both sides).
- UI verification on the simulator with Maestro; server-side effects (delete, tone/length → prompt) via
  backend scripts/pytest — don't try to prove backend behavior through screenshots.
- Add `testID`/`accessibilityLabel` to controls as needed so Maestro can target them (especially the
  trash icon and the tone/length chips); remember present-in-tree ≠ visible — read the screenshots.

## 5. LOCAL DEV SETUP (already working — use it)
- Sim backend on **port 8001** (`backend/_sim_backend.py`); `mobile/.env.local` →
  `http://127.0.0.1:8001/api/`. Start: `cd /Users/home/maxapp/backend && .venv312/bin/python _sim_backend.py`.
- Metro: `cd /Users/home/maxapp/mobile && npx expo start --clear`. App id `com.cannon.mobile`.
- Reach the drawer: DEV → "Paid" → Chat tab → open the conversations drawer (the header menu). Maestro
  CLI at `~/.maestro/bin/maestro`; flows in `mobile/maestro/`. Seed a couple of conversations first so
  the list, delete, and switch have something to act on.

## 6. WORK ORDER
1. SC2 first — find/fix duplicate-conversation creation (it pollutes every other test).
2. SC4 delete + SC3 switch (core list ops). 3. SC1 open/close, SC5 rename.
4. SC6/SC7 tone+length reach-the-prompt (backend proof) + persistence (UI). 5. SC8 robustness sweep.

## 7. DEFINITION OF DONE
- Every control (X, New chat, row tap, trash delete, rename, all 3 tone chips, all 3 length options)
  proven to work on the simulator; delete is gone server-side; tone+length demonstrably change the
  reply; the duplicate-conversation bug is fixed. No regressions; tsc + cold start clean. Commit in
  logical chunks.
