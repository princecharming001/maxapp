import type { QueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { queryKeys } from './queryClient';

/** Warm cache for all main-tab endpoints so switching tabs feels instant. */
export function prefetchMainTabData(qc: QueryClient): void {
    void qc.prefetchQuery({
        queryKey: queryKeys.maxes,
        queryFn: () => api.getMaxxes(),
    });
    // Prefetch schedules, then fan out guide prefetches for today's tasks so
    // tapping a habit opens the guide instantly (server-side cache is warm by
    // the time the app loads; these requests are instant cache hits).
    void qc.prefetchQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
    }).then(() => {
        const data: any = qc.getQueryData(queryKeys.schedulesActiveFull);
        const schedules: any[] = data?.schedules ?? [];
        for (const schedule of schedules) {
            const days: any[] = schedule.days ?? [];
            const today = days[0];
            if (!today) continue;
            for (const task of today.tasks ?? []) {
                const taskId = task.task_id ? String(task.task_id) : null;
                const schedId = schedule.id ? String(schedule.id) : null;
                if (!taskId || !schedId) continue;
                void qc.prefetchQuery({
                    queryKey: ['taskGuide', schedId, taskId],
                    queryFn: () => api.getTaskGuide(schedId, taskId),
                    staleTime: Infinity,
                });
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
