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
};

export function useTaskGuide(scheduleId: string, taskId: string) {
    return useQuery<TaskGuide>({
        queryKey: ['taskGuide', scheduleId, taskId],
        queryFn: () => apiService.getTaskGuide(scheduleId, taskId),
        staleTime: Infinity, // backend caches; content never changes
        retry: 2,
        enabled: !!(scheduleId && taskId),
    });
}
