/**
 * AchievementCelebrationHost — fires the celebration the moment a badge is earned.
 *
 * The day-state endpoint (/schedules/active/full) returns `newly_earned_achievements`
 * exactly once, on the response where the badge was first awarded. This host
 * reads that query's cache (it does NOT drive fetching — Today/Home do), catches
 * the transient value, queues a CelebrationOverlay, and marks the badges seen so
 * it never double-fires. Mount once inside the authenticated app.
 *
 * Timing: the badge is captured immediately, but the overlay is HELD while the
 * user is in a focused flow (mid face-scan, onboarding, auth) so it never pops
 * over the camera. It appears once they land on a calm screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { EarnedAchievement } from '../../services/api';
import { queryKeys } from '../../lib/queryClient';
import { navigationRef } from '../../lib/navigationRef';
import CelebrationOverlay from './CelebrationOverlay';

// Screens where a full-screen celebration would interrupt — the camera/scan
// flow, the onboarding + paywall funnel, auth, and setup flows. The badge still
// gets captured + marked seen; the overlay just waits until the user is elsewhere.
const SUPPRESS_ROUTES = new Set<string>([
    'FaceScan', 'FaceScanResults', 'FaceScanArchive', 'ModuleSelect',
    'Onboarding', 'RoutineReveal', 'FeaturesIntro', 'Payment',
    'Landing', 'Login', 'Signup', 'ForgotPassword',
]);

function useCurrentRouteName(): string | undefined {
    const [name, setName] = useState<string | undefined>(
        () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined),
    );
    useEffect(() => {
        const update = () => setName(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined);
        update();
        // The container ref is ready by the time this host mounts (user is in
        // the app), so the 'state' subscription fires on every navigation.
        const unsub = navigationRef.isReady() ? navigationRef.addListener('state', update) : undefined;
        return unsub;
    }, []);
    return name;
}

export default function AchievementCelebrationHost() {
    // enabled:false — purely reads the cache Today/Home populate, never fetches.
    const { data } = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        enabled: false,
    });
    const shown = useRef<Set<string>>(new Set());
    const [queue, setQueue] = useState<EarnedAchievement[]>([]);
    // The frozen batch currently being celebrated. Freezing it (rather than
    // handing the live, growing `queue` to the overlay and clearing it wholesale
    // on done) means a badge that arrives mid-celebration is NOT dropped by the
    // done handler — it stays queued and gets its own celebration next.
    const [showing, setShowing] = useState<EarnedAchievement[] | null>(null);
    const routeName = useCurrentRouteName();

    const fresh = (data as any)?.newly_earned_achievements as EarnedAchievement[] | undefined;
    useEffect(() => {
        const list = (fresh || []).filter((a) => a && !shown.current.has(a.code));
        if (!list.length) return;
        list.forEach((a) => shown.current.add(a.code));
        setQueue((q) => [...q, ...list]);
        // NOTE: mark-seen is deferred until the badge is actually displayed
        // (the promote effect below), not fired here at capture.
    }, [fresh]);

    // Hold the celebration until the user is on a calm screen (not mid-scan etc.).
    const onSafeScreen = !!routeName && !SUPPRESS_ROUTES.has(routeName);

    // Promote the pending queue to a frozen "showing" batch once we're on a safe
    // screen and nothing is currently celebrating. Mark those seen now (they're
    // about to be displayed).
    useEffect(() => {
        if (showing || !onSafeScreen || !queue.length) return;
        const batch = queue;
        setShowing(batch);
        api.markAchievementsSeen(batch.map((a) => a.code)).catch(() => {});
    }, [showing, onSafeScreen, queue]);

    if (!showing || !onSafeScreen) return null;
    return (
        <CelebrationOverlay
            queue={showing}
            onDone={() => {
                // Drop exactly the celebrated codes — anything appended during
                // the celebration survives and triggers the next batch.
                const shownCodes = new Set(showing.map((a) => a.code));
                setQueue((q) => q.filter((a) => !shownCodes.has(a.code)));
                setShowing(null);
            }}
        />
    );
}
