import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { View, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useSpotlightTour } from 'react-native-spotlight-tour';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

// Local "seen" flag, written the moment the tour STARTS (not only on a clean
// onStop). A frozen / force-quit tour never reaches onStop, so without this the
// server `main_app_tour_completed` stays false and the tour re-fires on every
// launch ("causes problems later"). The local flag short-circuits that loop
// even before the server flag converges.
export const MAIN_TOUR_SEEN_KEY = 'main_app_tour_seen_v1';

/**
 * Synchronized starter for the post-onboarding main-app tour.
 *
 * The legacy trigger was a blind 600ms `setTimeout` mounted at the provider
 * level that called `start()` regardless of which tab was focused or whether
 * step 0's HomeScreen anchor was mounted+measured. When it fired against an
 * unmounted/zero-measured anchor, react-native-spotlight-tour kept `spot` at
 * ZERO_SPOT → no cutout, and the tooltip (which holds the Skip button) never
 * fades in (it gates on spot.width/height > 0) → a full-screen backdrop that
 * swallows every touch with no escape (the "frozen screen" bug).
 *
 * This hook starts the tour ONLY when it is genuinely safe:
 *  - the user is paid,
 *  - the Home tab is actually focused (useIsFocused — not a guess),
 *  - onboarding is not still in the post-subscription scan flow AND no post-pay
 *    redirect to FaceScanResults is in flight,
 *  - the tour has not already been seen,
 *  - step 0's anchor has measured a NON-ZERO spot (we measure the anchor ref
 *    ourselves before starting, so the library can never land on a zero spot).
 * If those don't hold, it does nothing and waits for the next natural layout /
 * focus change — it never starts blind.
 */
export function useMainAppTour(
    anchorRef: RefObject<View | null>,
    opts: { redirectPending: boolean },
) {
    const { user, isPaid } = useAuth();
    const isFocused = useIsFocused();
    const { start } = useSpotlightTour();
    // Same-session guard: once we've started (or decided we never should), stay
    // off so a re-layout / re-focus can't double-fire.
    const startedRef = useRef(false);
    const { redirectPending } = opts;

    // Cross-launch guard: if we've already shown (or begun showing) the tour on
    // a previous launch, never start it again — even if the server flag didn't
    // persist because that run froze before onStop.
    useEffect(() => {
        let cancelled = false;
        AsyncStorage.getItem(MAIN_TOUR_SEEN_KEY)
            .then((v) => {
                if (!cancelled && v === '1') startedRef.current = true;
            })
            .catch(() => { /* default to allowed */ });
        return () => { cancelled = true; };
    }, []);

    const tryStart = useCallback(() => {
        if (startedRef.current) return;
        if (!isPaid) return;
        if (!isFocused) return;
        const ob = user?.onboarding as Record<string, unknown> | undefined;
        if (ob?.post_subscription_onboarding) return; // still in the scan funnel
        if (ob?.main_app_tour_completed) return; // already seen (server flag)
        if (redirectPending) return; // post-pay redirect to FaceScanResults pending
        const node = anchorRef.current;
        if (!node) return;
        // Let any in-flight navigation/layout settle one frame, then measure the
        // real anchor. Only start once it reports a non-zero rect.
        InteractionManager.runAfterInteractions(() => {
            if (startedRef.current) return;
            const target = anchorRef.current;
            if (!target || typeof target.measureInWindow !== 'function') return;
            target.measureInWindow((_x, _y, width, height) => {
                if (startedRef.current) return;
                if (!(width > 0 && height > 0)) return; // zero spot — unsafe, wait
                startedRef.current = true;
                // Persist "seen" the instant we start — survives a freeze/crash
                // before onStop. Local flag first (authoritative for re-fire),
                // then converge the server flag best-effort.
                AsyncStorage.setItem(MAIN_TOUR_SEEN_KEY, '1').catch(() => {});
                api.completeMainAppTour().catch(() => {});
                start();
            });
        });
    }, [isPaid, isFocused, user?.onboarding, redirectPending, anchorRef, start]);

    // Re-attempt whenever the gating inputs change (focus regained, onboarding
    // flags resolve after payment, etc.).
    useEffect(() => {
        tryStart();
    }, [tryStart]);

    // Returned to the screen so it can drive a start straight off the anchor's
    // onLayout (the most reliable "anchor is mounted and measured" signal).
    return { onAnchorLayout: tryStart };
}
