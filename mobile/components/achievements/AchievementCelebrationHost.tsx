/**
 * AchievementCelebrationHost — fires the celebration the moment a badge is earned.
 *
 * The day-state endpoint (/schedules/active/full) returns `newly_earned_achievements`
 * exactly once, on the response where the badge was first awarded. This host
 * reads that query's cache (it does NOT drive fetching — Today/Home do), catches
 * the transient value, queues a CelebrationOverlay, and marks the badges seen so
 * it never double-fires. Mount once inside the authenticated app.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { EarnedAchievement } from '../../services/api';
import { queryKeys } from '../../lib/queryClient';
import CelebrationOverlay from './CelebrationOverlay';

export default function AchievementCelebrationHost() {
    // enabled:false — purely reads the cache Today/Home populate, never fetches.
    const { data } = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        enabled: false,
    });
    const shown = useRef<Set<string>>(new Set());
    const [queue, setQueue] = useState<EarnedAchievement[]>([]);

    const fresh = (data as any)?.newly_earned_achievements as EarnedAchievement[] | undefined;
    useEffect(() => {
        const list = (fresh || []).filter((a) => a && !shown.current.has(a.code));
        if (!list.length) return;
        list.forEach((a) => shown.current.add(a.code));
        setQueue((q) => [...q, ...list]);
        api.markAchievementsSeen(list.map((a) => a.code)).catch(() => {});
    }, [fresh]);

    if (!queue.length) return null;
    return <CelebrationOverlay queue={queue} onDone={() => setQueue([])} />;
}
