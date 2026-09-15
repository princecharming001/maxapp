import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useFlag } from '../../constants/featureFlags';
import api from '../../services/api';

/**
 * First-run walkthrough: the guided path from an empty Home to the user's OWN
 * first Max, then their first task, then chat.
 *
 *   build → (user goes to Explore and starts a schedule) → task → chat → done
 *
 * Two things the previous version got wrong, both visible on a real device:
 *
 *  1. It marked itself "seen" the instant it rendered (local + server) and was
 *     a one-shot — a scrim tap, a modal collision, or a relaunch and it was
 *     gone for good. This one is RESUMABLE: it keeps a per-user step cursor and
 *     re-shows on every Home focus until the user actually finishes it. The
 *     server flag is written only on finish.
 *
 *  2. The "seen" key was device-wide, never cleared on logout. Once any account
 *     had shown it on a device, no later account on that device ever saw it.
 *     The cursor is keyed by user id.
 *
 * The cursor advances only on the user's own action ("build it" / "open it"),
 * never on time, so a plan that lands while they're away is picked up on
 * their next visit at the right step.
 */

export type WalkthroughStep = 'build' | 'task' | 'chat';
type Cursor = WalkthroughStep | 'done';

const cursorKey = (uid: string) => `main_app_tour_v2:${uid}`;

// ── Cross-tree hold signal ──────────────────────────────────────────────────
// The achievement celebration host must not stack its transparent Modal on top
// of (or under) the walkthrough card — and not in the same tick the card is
// about to appear, either, which reads as a flash. It subscribes here and
// holds while the walkthrough is visible OR pending (decided, awaiting the
// interaction settle). Its queue survives and promotes when the hold lifts.
let _hold = false;
const _holdListeners = new Set<(v: boolean) => void>();

function setHold(v: boolean) {
    if (_hold === v) return;
    _hold = v;
    _holdListeners.forEach((l) => l(v));
}

/** Reactive: true while the walkthrough is on screen or about to be. */
export function useWalkthroughVisible(): boolean {
    const [v, setV] = useState(_hold);
    useEffect(() => {
        _holdListeners.add(setV);
        setV(_hold);
        return () => { _holdListeners.delete(setV); };
    }, []);
    return v;
}

export function useFirstRunWalkthrough(opts: {
    /** A post-pay reveal redirect is about to fire from Home — wait. */
    redirectPending: boolean;
    /** The user has at least one live schedule. */
    hasPlan: boolean;
    /** Schedules haven't loaded yet — don't decide a step on an unknown. */
    planLoading: boolean;
}) {
    const { user, isPaid, refreshUser } = useAuth();
    const isFocused = useIsFocused();
    const enabled = useFlag('mainAppTour');
    const { redirectPending, hasPlan, planLoading } = opts;
    const uid = user?.id ? String(user.id) : null;

    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState<WalkthroughStep>('build');
    // null = still reading; otherwise the persisted cursor (missing ⇒ 'build').
    const [cursor, setCursor] = useState<Cursor | null>(null);
    // One decision per Home focus: a dismissed card stays dismissed until the
    // user leaves and comes back (or the step they need changes).
    const decidedThisFocus = useRef(false);
    const decidedFor = useRef<WalkthroughStep | null>(null);

    // Load the per-user cursor.
    useEffect(() => {
        let cancelled = false;
        setCursor(null);
        if (!uid) return;
        AsyncStorage.getItem(cursorKey(uid))
            .then((v) => {
                if (cancelled) return;
                setCursor(v === 'done' || v === 'task' || v === 'chat' || v === 'build' ? (v as Cursor) : 'build');
            })
            .catch(() => { if (!cancelled) setCursor('build'); });
        return () => { cancelled = true; };
    }, [uid]);

    const persist = useCallback((c: Cursor) => {
        setCursor(c);
        if (uid) AsyncStorage.setItem(cursorKey(uid), c).catch(() => {});
    }, [uid]);

    // Reset the per-focus latch when Home loses focus so the next visit can
    // decide again (that is what makes "build it → Explore → back" resume).
    useEffect(() => {
        if (!isFocused) {
            decidedThisFocus.current = false;
            decidedFor.current = null;
            setVisible(false);
        }
    }, [isFocused]);

    useEffect(() => {
        if (visible) return;
        if (!enabled || !isPaid || !isFocused || !uid) return;
        if (cursor === null || cursor === 'done') return;
        const ob = user?.onboarding as Record<string, unknown> | undefined;
        if (ob?.main_app_tour_completed) return;          // finished on another device
        if (ob?.post_subscription_onboarding) return;     // scan reveal still pending
        if (redirectPending || planLoading) return;

        // Which step does this visit need?
        //   no plan            → build (whatever the cursor says: they need a Max)
        //   plan, cursor build → task  (their Max landed since last time)
        //   otherwise          → the cursor
        const next: WalkthroughStep = !hasPlan ? 'build' : cursor === 'build' ? 'task' : cursor;
        if (decidedThisFocus.current && decidedFor.current === next) return;

        decidedThisFocus.current = true;
        decidedFor.current = next;
        setHold(true);
        // Let the arrival animation / any navigation settle before presenting.
        const task = InteractionManager.runAfterInteractions(() => {
            const ob2 = user?.onboarding as Record<string, unknown> | undefined;
            if (ob2?.post_subscription_onboarding || !isFocused) return;
            if (next !== cursor) persist(next);
            setStep(next);
            setVisible(true);
        });
        return () => task.cancel();
    }, [enabled, isPaid, isFocused, uid, cursor, user?.onboarding, redirectPending, hasPlan, planLoading, visible, persist]);

    // Hold badge celebrations for the WHOLE guided flow, not just while the
    // card is on screen: "build it" → Explore → start a Max earns "First Steps"
    // (and the scan already earned "Baseline Set"), and a badge Modal popping
    // over the very screen the walkthrough just sent them to breaks the thread.
    // The queue survives; everything promotes the moment they finish.
    const unfinished =
        enabled && isPaid && !!uid && cursor !== null && cursor !== 'done'
        && !(user?.onboarding as Record<string, unknown> | undefined)?.main_app_tour_completed;
    useEffect(() => {
        if (unfinished) setHold(true);
        else if (!visible) setHold(false);
    }, [unfinished, visible]);

    // Belt-and-braces: release the hold if the hosting screen unmounts.
    useEffect(() => () => setHold(false), []);

    /** Hide for this visit; the same step comes back next time Home focuses. */
    const dismiss = useCallback(() => {
        setVisible(false);
    }, []);

    /** Move to another step while staying on screen (e.g. "skip" → chat). */
    const goTo = useCallback((to: WalkthroughStep) => {
        persist(to);
        setStep(to);
    }, [persist]);

    /** The user acted on a step — remember where to resume, then hide. */
    const advance = useCallback((to: WalkthroughStep) => {
        persist(to);
        setStep(to);
        setVisible(false);
    }, [persist]);

    /** Done for good: local cursor + server flag (so other devices agree). */
    const finish = useCallback(() => {
        persist('done');
        setVisible(false);
        setHold(false);
        void api.completeMainAppTour().then(() => refreshUser()).catch(() => {});
    }, [persist, refreshUser]);

    return { visible, step, dismiss, advance, goTo, finish };
}
