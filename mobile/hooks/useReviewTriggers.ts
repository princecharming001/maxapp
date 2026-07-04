/**
 * useReviewTriggers — watches positive moments and (a) celebrates a rank level-up,
 * (b) asks for an App Store review at the right time (level-up or a fully-completed
 * day), each throttled. Seeds silently on first observation so an existing level
 * never fires a spurious celebration. All persistence is local; the actual review
 * gating lives in reviewService (server + local throttle). Never throws.
 */
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from '../components/InAppAlert';
import { checkAndRequestReview } from '../services/reviewService';
import type { Gamification } from '../services/api';

const LEVEL_KEY = 'gamif_last_seen_level_v1';
const DAYDONE_KEY = 'review_daydone_date_v1';

export function useReviewTriggers(
    gamif: Gamification | null | undefined,
    allDone: boolean,
    todayDate?: string,
) {
    const level = gamif?.current_level;
    const rank = gamif?.rank;

    // Level-up → celebrate + (throttled) review request.
    useEffect(() => {
        if (typeof level !== 'number') return;
        let active = true;
        void (async () => {
            try {
                const raw = await AsyncStorage.getItem(LEVEL_KEY);
                const lastSeen = raw != null ? parseInt(raw, 10) : null;
                if (lastSeen == null) {
                    // First-ever observation: seed silently, don't celebrate.
                    await AsyncStorage.setItem(LEVEL_KEY, String(level));
                    return;
                }
                if (level > lastSeen) {
                    await AsyncStorage.setItem(LEVEL_KEY, String(level));
                    if (active) {
                        Alert.alert(`Level ${level}`, `You reached ${rank ?? ''} — Level ${level}. Keep stacking.`);
                        void checkAndRequestReview('level_up');
                    }
                } else if (level !== lastSeen) {
                    // Level went down (shouldn't happen — additive) — just resync.
                    await AsyncStorage.setItem(LEVEL_KEY, String(level));
                }
            } catch {
                /* non-fatal */
            }
        })();
        return () => { active = false; };
    }, [level, rank]);

    // A fully-completed day → (throttled) review request, at most once per local day.
    useEffect(() => {
        if (!allDone) return;
        let active = true;
        void (async () => {
            try {
                const key = todayDate || new Date().toISOString().slice(0, 10);
                const seen = await AsyncStorage.getItem(DAYDONE_KEY);
                if (seen === key) return;
                await AsyncStorage.setItem(DAYDONE_KEY, key);
                if (active) void checkAndRequestReview('daily_completion');
            } catch {
                /* non-fatal */
            }
        })();
        return () => { active = false; };
    }, [allDone, todayDate]);
}
