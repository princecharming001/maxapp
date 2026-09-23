import type { QueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { queryKeys } from './queryClient';
import { fetchChatHistory } from '../hooks/useAppQueries';
import { fetchTaskGuide, taskGuideQueryKey } from '../hooks/useTaskGuide';

/** Guide requests in flight at once during the boot warm-up. Each one is a
 *  schedule SELECT + cache SELECT on a single Render instance; an unbounded
 *  burst (it used to be one request per task INSTANCE across all days, ~90 per
 *  schedule) queued every other user's requests behind it. */
export const GUIDE_PREFETCH_CONCURRENCY = 3;

/** One guide fetch to make, plus the same-catalog task instances that can be
 *  seeded from its result without their own request. */
export type GuidePrefetchTarget = {
    scheduleId: string;
    taskId: string;
    siblingTaskIds: string[];
};

/** Today as the schedule payload keys its days. The server's `today_date` is
 *  computed in the user's timezone; the device's local date is only a fallback
 *  for an older backend that doesn't send it. */
export function scheduleTodayISO(data: any, now: Date = new Date()): string {
    const fromServer = data?.today_date || data?.schedule_streak?.today_date;
    if (typeof fromServer === 'string' && fromServer) return fromServer;
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Mirrors the server's guide cache key normalisation (task_guide_service
 *  `_normalise_key`): lower-case, parentheticals dropped, whitespace collapsed,
 *  56 chars. Used only when a task has no `catalog_id`. */
function normalizeGuideTitle(title: string): string {
    let s = String(title || '').toLowerCase().trim();
    s = s.replace(/\s*\([^)]*\)/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s.slice(0, 56);
}

/** The key the SERVER caches a task's guide under, as far as the client can
 *  tell: catalog id when present, else the normalised title. Two instances of
 *  the same habit share one guide, so only one of them needs a request. */
export function guideCatalogKey(task: any): string | null {
    const cid = task?.catalog_id ? String(task.catalog_id) : '';
    if (cid) return `c:${cid}`;
    const t = normalizeGuideTitle(task?.title || '');
    return t ? `t:${t}` : null;
}

/** Pure: which guides to warm for TODAY only — one request per (schedule,
 *  catalog key), with the other same-catalog instances listed as siblings so
 *  the fetched guide can be copied into their cache slots. Task ids are minted
 *  per instance (a 14-day skinmax has ~90 distinct ids), so keying by instance
 *  alone never deduped anything. */
export function collectTodayGuideTargets(data: any, today: string): GuidePrefetchTarget[] {
    const out: GuidePrefetchTarget[] = [];
    const schedules: any[] = Array.isArray(data?.schedules) ? data.schedules : [];
    for (const schedule of schedules) {
        const scheduleId = schedule?.id ? String(schedule.id) : null;
        if (!scheduleId) continue;
        const byCatalog = new Map<string, GuidePrefetchTarget>();
        const seenTaskIds = new Set<string>();
        for (const day of Array.isArray(schedule.days) ? schedule.days : []) {
            if (!day || String(day.date || '') !== today) continue;
            for (const task of Array.isArray(day.tasks) ? day.tasks : []) {
                const taskId = task?.task_id ? String(task.task_id) : null;
                if (!taskId || seenTaskIds.has(taskId)) continue;
                seenTaskIds.add(taskId);
                const ck = guideCatalogKey(task) ?? `id:${taskId}`;
                const existing = byCatalog.get(ck);
                if (existing) {
                    existing.siblingTaskIds.push(taskId);
                } else {
                    byCatalog.set(ck, { scheduleId, taskId, siblingTaskIds: [] });
                }
            }
        }
        out.push(...byCatalog.values());
    }
    return out;
}

/** Pure: run async thunks with at most `limit` in flight. Never rejects — a
 *  failed thunk is just skipped (prefetching is best-effort). */
export async function runLimited(
    thunks: Array<() => Promise<unknown>>,
    limit: number,
): Promise<void> {
    const width = Math.max(1, Math.floor(limit));
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < thunks.length) {
            const thunk = thunks[next++];
            try {
                await thunk();
            } catch {
                /* best-effort */
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(width, thunks.length) }, worker));
}

/** Warm today's task guides, bounded. Skips entries already cached (a re-mount
 *  or purchase event calls this again) and entries that already errored this
 *  session (the screen fetches fresh when the user actually opens one). */
async function prefetchTodayTaskGuides(qc: QueryClient): Promise<void> {
    const data: any = qc.getQueryData(queryKeys.schedulesActiveFull);
    if (!data) return;
    const targets = collectTodayGuideTargets(data, scheduleTodayISO(data));
    const thunks = targets.map((t) => async () => {
        const key = taskGuideQueryKey(t.scheduleId, t.taskId);
        const state = qc.getQueryState(key);
        if (!state?.data && state?.status !== 'error') {
            await qc.prefetchQuery({
                queryKey: key,
                queryFn: () => fetchTaskGuide(t.scheduleId, t.taskId),
                staleTime: Infinity,
                retry: false,
            });
        }
        const guide = qc.getQueryData(key);
        if (!guide) return;
        // Same habit, other instance today: the server would return the same
        // guide (its cache is per task_key), so seed it instead of requesting.
        for (const sib of t.siblingTaskIds) {
            const sibKey = taskGuideQueryKey(t.scheduleId, sib);
            if (!qc.getQueryData(sibKey)) qc.setQueryData(sibKey, guide);
        }
    });
    await runLimited(thunks, GUIDE_PREFETCH_CONCURRENCY);
}

/** Warm cache for all main-tab endpoints so switching tabs feels instant. */
export function prefetchMainTabData(qc: QueryClient): void {
    void qc.prefetchQuery({
        queryKey: queryKeys.maxes,
        queryFn: () => api.getMaxxes(),
    });
    // Prefetch schedules, then warm guides for TODAY's habits only (bounded,
    // deduped by the server's cache key) so tapping any of today's tasks
    // opens its guide instantly. Other days' guides load on demand.
    void qc.prefetchQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
    }).then(() => prefetchTodayTaskGuides(qc));
    // BYTE-IDENTICAL queryFn to useChatHistoryQuery(null): the screen reads
    // {messages, conversationId, pendingQuestion} from this key, so seeding it
    // with any other shape (the old bare messages[]) hid the pending intake's
    // chips for the first 60s after a cold start.
    void qc.prefetchQuery({
        queryKey: queryKeys.chatHistory,
        queryFn: () => fetchChatHistory(null),
    });
    void qc.prefetchQuery({
        queryKey: queryKeys.activeSchedulesSummary,
        queryFn: () => api.getActiveSchedules(),
    });
}
