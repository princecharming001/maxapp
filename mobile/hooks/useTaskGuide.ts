import { useQuery } from '@tanstack/react-query';
import apiService from '../services/api';

export type TaskGuideStep = {
    n: number;
    title: string;
    body: string;
    tip: string | null;
};

export type TaskGuide = {
    task_key: string;
    title: string;
    overview: string;
    steps: TaskGuideStep[];
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
