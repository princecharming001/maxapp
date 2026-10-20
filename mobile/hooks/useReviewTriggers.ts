/**
 * useReviewTriggers — watches positive moments and (a) celebrates a rank level-up,
 * (b) asks for an App Store review at the right time (level-up or a fully-completed
 * day), each throttled. Seeds silently on first observation so an existing level
 * never fires a spurious celebration. All persistence is local; the actual review
 * gating lives in reviewService (server + local throttle). Never throws.
 */
import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from '../components/InAppAlert';
import { checkAndRequestReview } from '../services/reviewService';
import { useAuth } from '../context/AuthContext';
import type { Gamification } from '../services/api';
import { navigationRef } from '../lib/navigationRef';
import { isOverlayUp, useOverlayUp } from '../lib/overlayTurns';

// Never present over these. TaskGuide is a fullScreenModal: an RN Modal raised
// while it presents or dismisses strands an invisible touch-eating window on
// iOS (the whole app stops responding). Completing the habit that crosses a
// level happens INSIDE TaskGuide, while this hook runs on Home underneath.
const BLOCKED_ROUTES = new Set<string>(['TaskGuide', 'Onboarding', 'Payment', 'ModuleSelect']);

type Pending = { kind: 'level'; level: number; rank?: string } | { kind: 'review'; reason: 'daily_completion' };

function currentRoute(): string | undefined {
    return navigationRef.isReady()
        ? (navigationRef.getCurrentRoute() as { name?: string } | undefined)?.name
        : undefined;
}

// Keyed per user (like main_app_tour_v2:<uid>). The device-wide originals
// leaked between accounts: A (level 8) logs out, B (level 3) resyncs the key
// to 3, A logs back in and "levels up" to 8 — a spurious alert plus an App
// Store review prompt on sign-in. The un-scoped keys are retired on first run.
const LEGACY_LEVEL_KEY = 'gamif_last_seen_level_v1';
const LEGACY_DAYDONE_KEY = 'review_daydone_date_v1';
const levelKey = (uid: string) => `${LEGACY_LEVEL_KEY}:${uid}`;
const dayDoneKey = (uid: string) => `${LEGACY_DAYDONE_KEY}:${uid}`;

export function useReviewTriggers(
    gamif: Gamification | null | undefined,
    allDone: boolean,
    todayDate?: string,
) {
    const level = gamif?.current_level;
    const rank = gamif?.rank;
    const uid = useAuth().user?.id;
    // One positive moment at a time, presented only when the screen is calm:
    // the old code raised the "Level N" alert AND the native review sheet in
    // the same tick, often on top of the badge celebration (a level-up and a
    // badge usually land on the same tap). Stacked modals froze the app.
    const [pending, setPending] = useState<Pending | null>(null);
    const celebrationUp = useOverlayUp('celebration');
    const [routeTick, setRouteTick] = useState(0);
    useEffect(() => {
        if (!pending || !navigationRef.isReady()) return;
        return navigationRef.addListener('state', () => setRouteTick((t) => t + 1));
    }, [pending]);

    useEffect(() => {
        if (!pending || celebrationUp) return;
        let cancelled = false;
        const task = InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            const route = currentRoute();
            // Re-runs on the next route change / celebration close.
            if (!route || BLOCKED_ROUTES.has(route) || isOverlayUp('celebration')) return;
            const p = pending;
            setPending(null);
            if (p.kind === 'level') {
                Alert.alert(
                    `Level ${p.level}`,
                    `You reached ${p.rank ?? ''} \u2014 Level ${p.level}. Keep stacking.`,
                    // The review sheet only after the alert is gone, never with it.
                    [{ text: 'Nice', onPress: () => { setTimeout(() => void checkAndRequestReview('level_up'), 800); } }],
                );
            } else {
                void checkAndRequestReview(p.reason);
            }
        });
        return () => { cancelled = true; task.cancel(); };
    }, [pending, celebrationUp, routeTick]);

    useEffect(() => {
        // Whoever owned the device-wide keys, we can't tell — drop them; the
        // per-user key seeds silently on its first observation below.
        void AsyncStorage.multiRemove([LEGACY_LEVEL_KEY, LEGACY_DAYDONE_KEY]).catch(() => undefined);
    }, []);

    // Level-up → celebrate + (throttled) review request.
    useEffect(() => {
        if (typeof level !== 'number' || !uid) return;
        const key = levelKey(uid);
        let active = true;
        void (async () => {
            try {
                const raw = await AsyncStorage.getItem(key);
                const lastSeen = raw != null ? parseInt(raw, 10) : null;
                if (lastSeen == null) {
                    // First-ever observation: seed silently, don't celebrate.
                    await AsyncStorage.setItem(key, String(level));
                    return;
                }
                if (level > lastSeen) {
                    await AsyncStorage.setItem(key, String(level));
                    if (active) setPending({ kind: 'level', level, rank });
                } else if (level !== lastSeen) {
                    // Level went down (shouldn't happen — additive) — just resync.
                    await AsyncStorage.setItem(key, String(level));
                }
            } catch {
                /* non-fatal */
            }
        })();
        return () => { active = false; };
    }, [level, rank, uid]);

    // A fully-completed day → (throttled) review request, at most once per local day.
    useEffect(() => {
        if (!allDone || !uid) return;
        const storeKey = dayDoneKey(uid);
        let active = true;
        void (async () => {
            try {
                const key = todayDate || new Date().toISOString().slice(0, 10);
                const seen = await AsyncStorage.getItem(storeKey);
                if (seen === key) return;
                await AsyncStorage.setItem(storeKey, key);
                // A level alert waiting its turn wins; its OK asks for the review.
                if (active) setPending((p) => p ?? { kind: 'review', reason: 'daily_completion' });
            } catch {
                /* non-fatal */
            }
        })();
        return () => { active = false; };
    }, [allDone, todayDate, uid]);
}
