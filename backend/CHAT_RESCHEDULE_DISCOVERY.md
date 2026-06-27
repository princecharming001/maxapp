# CHAT_RESCHEDULE_DISCOVERY.md (Phase 0)

How a chat turn currently reaches the schedule, how `[CHOICES]` round-trips, how
each mutator persists + which caches it should invalidate, and how user_facts are
injected. No behavior changed in this phase. All refs are `file:line` at the time
of writing (may drift a few lines).

## 1. Chat turn → schedule tools
- POST `chat/message` → `send_message` (`backend/api/chat.py:4341`) → `_send_message_locked`
  (`backend/api/chat.py:4366`) → shared core `process_chat_message` (`backend/api/chat.py:2214`).
- Intent routing: `classify_turn(...)` (`backend/api/chat.py:2356`). Two mutually-exclusive paths:
  - **Fast RAG path** `answer_from_rag(...)` (`backend/api/chat.py:2617`) — early-returns for
    KNOWLEDGE intent with maxx hints and NO task-op; never mutates the schedule.
  - **Full agent** `run_chat_agent(...)` (`backend/api/chat.py:3373` → `backend/services/lc_agent.py:2255`).
- Tools are built by `make_chat_tools(db, rds_db, user_id, user, onboarding, active_schedule, channel, user_context)`
  (`backend/services/lc_agent.py:813`); `AgentExecutor` assembled at `lc_agent.py:2305`.

## 2. `[CHOICES]` round-trip
- Agent emits `[CHOICES]a|b|c[/CHOICES]` / `[CHOICES_MULTI]…[/CHOICES_MULTI]` in its text.
- Parsed by `_extract_inline_choices(text)` (`backend/api/chat.py:576`; regexes at `:562`,`:570`),
  called at `backend/api/chat.py:4585`.
- Response DTO `ChatResponse` (`backend/models/leaderboard.py:82`): fields `response`, `choices`,
  `multi_choice`, `input_widget`, `products`, `conversation_id`.
- Mobile renders chips from `serverChoices` (`mobile/screens/chat/MaxChatScreen.tsx:488`, set at `:692`,
  mapped to `quickReplies` at `:872`). Single-select chip row `:1310-1340`; tap handler `:1321`
  (`custom ? inputRef.current?.focus() : sendMessage(choice)`). Multi-select row `:1341-1425`.
- "custom / something else" chips: `CUSTOM_CHIP_LABELS` + `isCustomChip` (`MaxChatScreen.tsx:71-74`);
  focusing reuses `inputRef` (`:503`, attached at `:1451`) via `.focus()`. **This is the No→type
  focus behavior to reuse.**
- Composer: `TextInput` `:1450-1464` (no testID yet); send button `MorphSend` `:1465` (no testID yet);
  send fn `sendMessage()` `:784-870` → `api.sendChatMessage(...)` → POST `chat/message`.
- Client `Message` interface `MaxChatScreen.tsx:49-66` (role, content, products, …; no confirm field yet).

## 3. Schedule mutators (persist + commit) — `backend/services/lc_agent.py`
All run under `db_mutation_lock` (`lc_agent.py:840`) and commit.
- `modify_schedule(feedback)` `:851` → `adapt_and_persist()` (schedule_runtime); commit `:1635`-area.
- `generate_maxx_schedule(maxx_id, wake_time, sleep_time, …)` `:896` → `generate_and_persist()`; commit `:966`.
- `edit_schedule_task(schedule_id?, task_id?, task_hint?, time?, title?, description?, duration_minutes?)`
  `:1600` → `schedule_service.edit_task()`; commit `:1635`.
- `delete_schedule_task(schedule_id?, task_id?, task_hint?)` `:1650` → `schedule_service.delete_task()`; commit `:1670`.
- `update_schedule_preferences(wake_time?, sleep_time?, notifications_enabled?, notification_minutes_before?)`
  `:1684` → `schedule_service.update_preferences()`; commit `:1704`.
- `update_schedule_context(key, value)` `:1753` → `user_context_service.merge_context()/append_to_list()`,
  optional `regenerate_active_schedules()`; commit `:1810`,`:1822`.
- `complete_today_tasks(maxx_id?)` `:1502` → `schedule_service.complete_task()`; commit `:1540`.

## 4. Cache keys to invalidate after a schedule write
- `queryKeys.schedulesActiveFull = ['schedules','active','full']` (`mobile/lib/queryClient.ts:45`).
- `queryKeys.activeSchedulesSummary` (`:48`), `queryKeys.maxes` (`:50`).
- Existing invalidation after a chat send: `MaxChatScreen.tsx:846-853` (predicate) and `:705-716`
  (onboarding path, `refetchType:'all'`). The confirm-apply path must invalidate the same keys so
  Planner/Home/Today reflect the change immediately.

## 5. user_facts (allergy / diet / constraints) injection
- `format_facts_for_prompt(facts)` (`backend/services/user_facts_service.py:319`) and
  `hard_constraints_reminder(facts)` (`:366`).
- Injected at the TOP of the system prompt in `build_agent_system_prompt` (`backend/services/lc_agent.py:537-576`):
  facts pulled from `user_context['user_facts']` / `persistent_context.user_facts`, merged with
  `facts_from_onboarding()` (`:76`), prepended as "## ABSOLUTE RULES" + `DIET_SUBSTITUTIONS`.
- Per-turn reminder appended to the human message in `run_chat_agent` (`lc_agent.py:2282-2290`).
- ⇒ A diet proposal must read the SAME merged facts and never propose an avoided/allergen food.

## 6. Conversation persistence (where a pending proposal can live)
- `ChatConversation` (`backend/models/sqlalchemy_models.py:269`) and `ChatHistory` (`:325`,
  conversation_id FK `:334`).
- `active_conversation_id` ContextVar (`sqlalchemy_models.py:306`, set in `process_chat_message`) —
  a good pattern to surface a freshly-created proposal id back to `process_chat_message`.
- **Decision:** store proposals in a NEW table `schedule_change_proposals` (auto-created by
  `Base.metadata.create_all` in `init_db`; no ALTER on existing tables) keyed by user + conversation,
  status `pending|applied|rejected|expired`, holding the EXACT `{tool,args}` action to replay on Yes.
