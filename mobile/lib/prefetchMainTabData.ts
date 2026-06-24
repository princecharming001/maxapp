import type { QueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { queryKeys } from './queryClient';

/** Warm cache for all main-tab endpoints so switching tabs feels instant. */
export function prefetchMainTabData(qc: QueryClient): void {
    void qc.prefetchQuery({
        queryKey: queryKeys.maxes,
        queryFn: () => api.getMaxxes(),
    });
    // Prefetch schedules, then fan out guide prefetches for EVERY distinct task
    // across all days (deduped) so tapping any habit opens the guide instantly.
    // The server-side cache is warmed by pregenerate_for_schedule on
    // create/adapt, so these are near-instant cache hits.
    void qc.prefetchQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
    }).then(() => {
        const data: any = qc.getQueryData(queryKeys.schedulesActiveFull);
        const schedules: any[] = data?.schedules ?? [];
        for (const schedule of schedules) {
            const schedId = schedule.id ? String(schedule.id) : null;
            if (!schedId) continue;
            const seen = new Set<string>();
            for (const day of schedule.days ?? []) {
                for (const task of day.tasks ?? []) {
                    const taskId = task.task_id ? String(task.task_id) : null;
                    if (!taskId || seen.has(taskId)) continue;
                    seen.add(taskId);
                    void qc.prefetchQuery({
                        queryKey: ['taskGuide', schedId, taskId],
                        queryFn: () => api.getTaskGuide(schedId, taskId),
                        staleTime: Infinity,
                    });
                }
            }
        }
    });
    void qc.prefetchQuery({
        queryKey: queryKeys.chatHistory,
        queryFn: async () => {
            const { messages } = await api.getChatHistory({ limit: 80, offset: 0 });
            return messages ?? [];
        },
    });
    void qc.prefetchQuery({
        queryKey: queryKeys.activeSchedulesSummary,
        queryFn: () => api.getActiveSchedules(),
    });
}
