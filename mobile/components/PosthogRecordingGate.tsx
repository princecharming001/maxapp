/**
 * Session replay never records anyone running Peptidemax (their Home, plan and
 * guides name the peptides). Signed-out people (landing, onboarding, paywall)
 * are recorded; a signed-in person is held paused until their programs load,
 * so a peptide user's first screens never slip into a replay.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { phIdentify, phReset, phSetPeptideUser, posthogEnabled } from '../lib/posthog';

export default function PosthogRecordingGate() {
    const { user, isAuthenticated } = useAuth();
    // the same cached /schedules/active/full the app already loads (canonical
    // key, one fetch), only while signed in
    const schedulesQ = useQuery({
        queryKey: queryKeys.schedulesActiveFull,
        queryFn: () => api.getActiveSchedulesFull(),
        enabled: isAuthenticated,
        staleTime: 60_000,
    });

    // identity: the account id only (no email or name), reset on sign-out
    const uid = user?.id ? String(user.id) : '';
    const lastUid = useRef('');
    useEffect(() => {
        if (!posthogEnabled) return;
        if (uid) phIdentify(uid, { is_paid: !!(user as any)?.is_paid, is_admin: !!(user as any)?.is_admin });
        else if (lastUid.current) phReset();     // a real sign-out, not a signed-out launch
        lastUid.current = uid;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid]);

    const schedules = (schedulesQ.data as any)?.schedules as any[] | undefined;
    useEffect(() => {
        if (!posthogEnabled) return;
        if (!isAuthenticated) {
            phSetPeptideUser(false);
            return;
        }
        if (!schedules) {
            phSetPeptideUser(true);        // unknown yet: stay paused
            return;
        }
        phSetPeptideUser(schedules.some((s) => String(s?.maxx_id || '').toLowerCase() === 'peptidemax'));
    }, [isAuthenticated, schedules]);

    return null;
}
