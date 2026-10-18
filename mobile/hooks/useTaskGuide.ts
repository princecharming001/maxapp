import { useQuery } from '@tanstack/react-query';
import apiService from '../services/api';

/** A resolved ingredient/product card for one step. The backend resolves the generic
 *  ingredient to this user's deterministic, facts-filtered product (SC5); `name` is the
 *  specific product when one resolved, else the generic name. */
export type TaskGuideIngredient = {
    name: string;
    /** The original generic ingredient ("vitamin C serum") before product resolution. */
    generic_name?: string;
    /** Quantity / usage note for this step ("2 drops"). */
    note: string;
    brand?: string;
    /** Direct product page; "" when unmatched (card renders, not tappable). */
    url?: string;
    /** Product image URL; "" when none (card shows initials instead). */
    image?: string;
    /** Amazon ASIN: opens the Amazon app (Safari without it). */
    asin?: string;
    price_usd?: number | null;
    rating?: number | null;
    /** C5: the Products-tab need id this product fills ("Other options" opens it). */
    need?: string;
    /** C5: dose/strength of this product ("1 mg"), when it has one. */
    strength?: string | null;
    /** 'gear' for equipment (bottles, masks…) — listed under "Gear", not
     *  "What you'll use". Absent = a consumable. */
    kind?: string;
};

export type TaskGuideStep = {
    n: number;
    title: string;
    body: string;
    tip: string | null;
    /** Per-step hero image (relative /uploads/... or absolute); falls back to the
     *  task-level `hero_image`. */
    image?: string;
    /** Optional how-to video URL; the "Watch ▶" pill only shows when present. */
    video?: string | null;
    /** Items used in this step, resolved per-user. */
    ingredients?: TaskGuideIngredient[];
    /** C5: equipment for this step, shown under "Gear". */
    gear?: TaskGuideIngredient[];
};

export type TaskGuide = {
    task_key: string;
    title: string;
    overview: string;
    /** Task-level hero image (one curated image per maxx), applied to every step. */
    hero_image?: string;
    steps: TaskGuideStep[];
    products?: TaskGuideIngredient[];
    duration_minutes: number;
    why_it_matters: string;
    /** The server could not find the schedule/task (e.g. ids re-minted by a regen
     *  while the request was in flight). It is a placeholder that says "Unavailable",
     *  NOT a guide — `fetchTaskGuide` throws on it so it is never cached as data. */
    unavailable?: boolean;
    error?: string;
    /** Both LLM providers failed and the server sent its generic fallback text.
     *  Usable, but stale immediately so the next open fetches the real guide. */
    degraded?: boolean;
};

export const TASK_GUIDE_UNAVAILABLE = 'TASK_GUIDE_UNAVAILABLE';

/** Marker on the error thrown for an `unavailable` guide. A `code` field rather
 *  than an Error subclass: `instanceof` on transpiled Error subclasses is not
 *  reliable under Hermes, and React Query's retry predicate needs a sure test. */
export function isTaskGuideUnavailableError(e: unknown): boolean {
    return !!e && typeof e === 'object' && (e as { code?: unknown }).code === TASK_GUIDE_UNAVAILABLE;
}

/** When the task happens. C5: the server regenerates a guide when the task's
 *  time or duration changes, so both are part of the cache key — a retimed
 *  task is a different key and refetches instead of showing the old guide. */
export type TaskGuideTiming = { time?: string | null; duration_minutes?: number | null };

/** The ONE cache key for a task's guide — shared by the screen hook and the boot
 *  prefetch so both read/write the same entry. */
export const taskGuideQueryKey = (scheduleId: string, taskId: string, timing?: TaskGuideTiming | null) =>
    ['taskGuide', scheduleId, taskId, String(timing?.time ?? ''), Number(timing?.duration_minutes) || 0] as const;

/** The task's time/duration from the cached /schedules/active/full payload. */
export function findTaskTiming(data: any, scheduleId?: string, taskId?: string): TaskGuideTiming | null {
    if (!scheduleId || !taskId) return null;
    const schedules: any[] = Array.isArray(data?.schedules) ? data.schedules : [];
    const sched = schedules.find((s) => String(s?.id) === String(scheduleId));
    for (const d of (Array.isArray(sched?.days) ? sched.days : []) as any[]) {
        for (const t of (Array.isArray(d?.tasks) ? d.tasks : []) as any[]) {
            if (String(t?.task_id ?? '') === String(taskId)) {
                return { time: t?.time ?? null, duration_minutes: t?.duration_minutes ?? null };
            }
        }
    }
    return null;
}

/** The ONE queryFn for a task's guide (screen + prefetch). Throws on the
 *  server's `unavailable` placeholder so React Query keeps it out of the data
 *  cache — a placeholder cached with staleTime Infinity kept that task's guide
 *  broken until relaunch. */
export async function fetchTaskGuide(scheduleId: string, taskId: string): Promise<TaskGuide> {
    const guide = (await apiService.getTaskGuide(scheduleId, taskId)) as TaskGuide;
    if (!guide || guide.unavailable) {
        const err = new Error(guide?.error || 'Task guide unavailable') as Error & { code: string };
        err.code = TASK_GUIDE_UNAVAILABLE;
        throw err;
    }
    return guide;
}

/** Backend caches real guides, so content never changes → never stale. A
 *  degraded (LLM-failed fallback) guide is stale at once so the next open
 *  replaces it with the real one. */
export function taskGuideStaleTime(data: TaskGuide | undefined): number {
    return data?.degraded ? 0 : Infinity;
}

export function useTaskGuide(scheduleId: string, taskId: string, timing?: TaskGuideTiming | null) {
    return useQuery<TaskGuide>({
        queryKey: taskGuideQueryKey(scheduleId, taskId, timing),
        // The key also changes when the task's timing first becomes known
        // (day-state loaded after the screen opened): keep showing what we
        // have while that refetches instead of flashing the spinner.
        placeholderData: (prev) => prev,
        queryFn: () => fetchTaskGuide(scheduleId, taskId),
        staleTime: (q) => taskGuideStaleTime(q.state.data),
        // An `unavailable` answer is deterministic (the task id is gone from the
        // schedule) — retrying it only burns requests; transport errors still retry.
        retry: (failureCount, error) => !isTaskGuideUnavailableError(error) && failureCount < 2,
        enabled: !!(scheduleId && taskId),
    });
}
