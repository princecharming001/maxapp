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

/** The ONE cache key for a task's guide — shared by the screen hook and the boot
 *  prefetch so both read/write the same entry. */
export const taskGuideQueryKey = (scheduleId: string, taskId: string) =>
    ['taskGuide', scheduleId, taskId] as const;

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

export function useTaskGuide(scheduleId: string, taskId: string) {
    return useQuery<TaskGuide>({
        queryKey: taskGuideQueryKey(scheduleId, taskId),
        queryFn: () => fetchTaskGuide(scheduleId, taskId),
        staleTime: (q) => taskGuideStaleTime(q.state.data),
        // An `unavailable` answer is deterministic (the task id is gone from the
        // schedule) — retrying it only burns requests; transport errors still retry.
        retry: (failureCount, error) => !isTaskGuideUnavailableError(error) && failureCount < 2,
        enabled: !!(scheduleId && taskId),
    });
}
