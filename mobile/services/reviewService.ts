/**
 * reviewService — gates + fires Apple's native in-app review sheet
 * (SKStoreReviewController via expo-store-review) at genuine positive moments,
 * never on launch or after a negative event.
 *
 * Throttling is two-layered:
 *   • LOCAL (AsyncStorage): a short cool-down so two positive events in one
 *     session can't double-fire.
 *   • GLOBAL (server profile): lifetime cap + a long minimum gap across installs,
 *     read from /users/me (profile.review_request_count / last_review_request_date)
 *     and bumped via POST /users/me/review-opened. Apple itself only shows the
 *     sheet ~3x/year, so we count REQUESTS (Apple never tells us if the user rated).
 *
 * Defensive: the native module is required lazily inside a try/catch, so a build
 * without expo-store-review simply no-ops instead of crashing. Never throws.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from './api';

const LOCAL_KEY = 'review_last_prompt_ms_v1';
const MIN_LOCAL_MS = 3 * 24 * 60 * 60 * 1000; // no re-prompt within 3 days (any device)
const MIN_DAYS_BETWEEN = 45;                    // our cross-install gap (Apple caps ~3/yr)
const MAX_LIFETIME_REQUESTS = 3;

// TODO: set the real numeric App Store ID once the app is published — only the
// Linking fallback (native module unavailable) needs it; requestReview() doesn't.
const APP_STORE_ID = '0000000000';

async function loadStoreReview(): Promise<any | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('expo-store-review');
    } catch {
        return null; // module not in this build → graceful no-op
    }
}

async function requestNative(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    const StoreReview = await loadStoreReview();
    if (!StoreReview) return false;
    try {
        const available = StoreReview.isAvailableAsync ? await StoreReview.isAvailableAsync() : true;
        const hasAction = StoreReview.hasAction ? await StoreReview.hasAction() : true;
        if (!available || !hasAction) return false;
        await StoreReview.requestReview();
        return true;
    } catch {
        return false;
    }
}

/**
 * Fire the review prompt if every throttle allows. `context` is for logging /
 * future analytics only (Apple decides whether to actually show the sheet).
 */
export async function checkAndRequestReview(_context: string): Promise<void> {
    try {
        if (Platform.OS !== 'ios') return;

        // Local short-window cool-down.
        const rawLocal = await AsyncStorage.getItem(LOCAL_KEY);
        const lastLocal = rawLocal ? parseInt(rawLocal, 10) : 0;
        if (lastLocal && Date.now() - lastLocal < MIN_LOCAL_MS) return;

        // Global (server) throttle.
        const me = await api.getMe().catch(() => null);
        const profile = (me as any)?.profile || {};
        if (Number(profile.review_request_count || 0) >= MAX_LIFETIME_REQUESTS) return;
        const last = profile.last_review_request_date;
        if (last) {
            const lastMs = new Date(`${last}T00:00:00Z`).getTime();
            if (!Number.isNaN(lastMs) && (Date.now() - lastMs) / 86400000 < MIN_DAYS_BETWEEN) return;
        }

        const shown = await requestNative();
        if (shown) {
            await AsyncStorage.setItem(LOCAL_KEY, String(Date.now()));
            await api.markReviewOpened();
        }
    } catch {
        /* a review attempt must never affect app flow */
    }
}

/**
 * From an explicit "Rate us" tap — try the native sheet first (best UX, stays
 * in-app), else deep-link to the App Store review page.
 */
export async function manualReview(): Promise<void> {
    const shown = await requestNative();
    if (shown) {
        await api.markReviewOpened();
        return;
    }
    try {
        const { Linking } = require('react-native');
        await Linking.openURL(`itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`);
    } catch {
        /* nothing else to do */
    }
}
