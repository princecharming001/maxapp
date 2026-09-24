/**
 * useNotificationNudges — Home's two reminder surfaces.
 *
 *   primer        "want a ping at 7:30?" — asks for notification permission at
 *                 the value moment (the user is looking at their own plan) and
 *                 names their next task. Only while permission is undetermined:
 *                 the one state in which iOS can still show its system prompt.
 *   remindersOff  a quiet inline card when permission is DENIED, pointing to
 *                 iOS Settings (the app can never re-prompt once denied).
 *
 * The eligibility rules are pure + unit-tested (lib/notificationPermission).
 * This hook adds the on-screen choreography:
 *   - the primer is decided per Home focus, after the arrival settles, and
 *     never while the first-run walkthrough is up / pending / was up during
 *     this visit (no two cards back to back), nor while a post-pay redirect is
 *     about to take the user off Home;
 *   - at most once per app session per user — walking away without answering
 *     brings it back next session, not on every focus;
 *   - "not now" (or the scrim) snoozes the primer 3 days; the card's × snoozes
 *     it 7. Timestamps live in per-user AsyncStorage keys.
 *
 * It is an in-screen overlay, not an RN <Modal>: stacking Modals (the badge
 * celebration, in-app alerts) is the iOS two-modal freeze.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useWalkthroughVisible } from '../features/mainTour/useMainAppTour';
import { useNotificationPermission } from './useNotificationPermission';
import { setOverlayUp, useOverlayUp } from '../lib/overlayTurns';
import { enableIosPushFromUserTap } from '../services/registerIosPushToken';
import {
    isPrimerEligible,
    isRemindersOffEligible,
    parseStoredTimestamp,
    pickNextTask,
    primerCopy,
    primerDismissKey,
    remindersOffDismissKey,
    type PlanTaskLike,
    type PushPermissionState,
} from '../lib/notificationPermission';

/** Beat between Home settling and the primer rising — long enough to take in the plan first. */
const PRIMER_SETTLE_MS = 1200;

/** User ids the primer has already been shown to in this JS session. */
const primerShownThisSession = new Set<string>();

async function readDismissedAt(key: string): Promise<number | null> {
    try {
        return parseStoredTimestamp(await AsyncStorage.getItem(key));
    } catch {
        // Unreadable storage fails CLOSED ("just dismissed"): better to miss
        // one nudge than to nag on every launch because a write can't stick.
        return Date.now();
    }
}

async function writeDismissedAt(key: string, at: number): Promise<void> {
    try {
        await AsyncStorage.setItem(key, String(at));
    } catch {
        /* non-fatal — in-memory state still hides it for this session */
    }
}

function minutesNow(): number {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

export type NotificationNudgesInput = {
    /** Today's merged plan rows (what Home already renders). */
    todayTasks: PlanTaskLike[];
    /** Tomorrow's rows — the "next" task for a late-evening open. */
    tomorrowTasks: PlanTaskLike[];
    /** Number of live schedules (active plans). */
    activePlanCount: number;
    /** The plan payload has loaded — never decide on an unknown. */
    planReady: boolean;
    /** A post-pay redirect is about to take the user off Home — stay out of the way. */
    redirectPending: boolean;
};

export function useNotificationNudges(input: NotificationNudgesInput) {
    const { user } = useAuth();
    const uid = user?.id ? String(user.id) : null;
    const appOptIn = user?.onboarding?.app_notifications_opt_in;
    const isIOS = Platform.OS === 'ios';
    const isFocused = useIsFocused();
    const walkthroughUp = useWalkthroughVisible();
    // A badge celebration queued/showing owns the screen first (a new user's
    // first visit earns "First Steps" right as the primer would rise).
    const celebrationUp = useOverlayUp('celebration');
    const { state: permission, refresh: refreshPermission } = useNotificationPermission(isIOS && !!uid);

    // Snooze timestamps; `undefined` = still reading (never decide on it).
    const [primerDismissedAt, setPrimerDismissedAt] = useState<number | null | undefined>(undefined);
    const [offDismissedAt, setOffDismissedAt] = useState<number | null | undefined>(undefined);
    useEffect(() => {
        let cancelled = false;
        setPrimerDismissedAt(undefined);
        setOffDismissedAt(undefined);
        if (!uid || !isIOS) return;
        void Promise.all([
            readDismissedAt(primerDismissKey(uid)),
            readDismissedAt(remindersOffDismissKey(uid)),
        ]).then(([primerAt, offAt]) => {
            if (cancelled) return;
            setPrimerDismissedAt(primerAt);
            setOffDismissedAt(offAt);
        });
        return () => {
            cancelled = true;
        };
    }, [uid, isIOS]);

    const [primerVisible, setPrimerVisible] = useState(false);
    const [primerBusy, setPrimerBusy] = useState(false);
    const [copy, setCopy] = useState(() => primerCopy(null));

    // Latest plan rows, read when the primer actually rises (the copy names
    // the next task as of THAT moment, not as of the first render).
    const inputRef = useRef(input);
    inputRef.current = input;

    // Per-visit latch: if the walkthrough owned this visit (visible, pending,
    // or finished during it), the primer waits for the NEXT focus.
    const walkthroughThisFocus = useRef(false);
    useEffect(() => {
        if (!isFocused) {
            walkthroughThisFocus.current = false;
            setPrimerVisible(false);
            return;
        }
        if (walkthroughUp) walkthroughThisFocus.current = true;
    }, [isFocused, walkthroughUp]);

    const now = Date.now();
    const common = {
        platformOS: Platform.OS,
        signedIn: !!uid,
        appOptIn,
        permission,
        activePlanCount: input.activePlanCount,
        now,
    };
    const primerEligible =
        input.planReady &&
        primerDismissedAt !== undefined &&
        isPrimerEligible({ ...common, tasksTodayCount: input.todayTasks.length, dismissedAt: primerDismissedAt });
    const remindersOffEligible =
        input.planReady &&
        offDismissedAt !== undefined &&
        isRemindersOffEligible({ ...common, dismissedAt: offDismissedAt });

    useEffect(() => {
        if (!uid || !isFocused || primerVisible || !primerEligible) return;
        if (walkthroughUp || walkthroughThisFocus.current || input.redirectPending) return;
        if (celebrationUp) return; // re-runs when the celebration clears
        if (primerShownThisSession.has(uid)) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        // Never present mid-transition: let the arrival animation / any
        // navigation settle, then a short beat so the plan registers first.
        // A walkthrough deciding meanwhile flips walkthroughUp → this cleanup
        // cancels the pending show.
        const task = InteractionManager.runAfterInteractions(() => {
            if (cancelled) return;
            timer = setTimeout(() => {
                if (cancelled) return;
                primerShownThisSession.add(uid);
                const latest = inputRef.current;
                setCopy(primerCopy(pickNextTask(latest.todayTasks, minutesNow(), latest.tomorrowTasks)));
                setPrimerVisible(true);
            }, PRIMER_SETTLE_MS);
        });
        return () => {
            cancelled = true;
            task.cancel();
            if (timer) clearTimeout(timer);
        };
    }, [uid, isFocused, primerVisible, primerEligible, walkthroughUp, input.redirectPending, celebrationUp]);

    // Publish the primer so the celebration host waits while it is up.
    useEffect(() => {
        setOverlayUp('primer', primerVisible);
    }, [primerVisible]);
    useEffect(() => () => setOverlayUp('primer', false), []);

    // Yield while up (no snooze recorded): the permission got decided elsewhere
    // (flipped in iOS Settings and came back — the question is moot), or the
    // walkthrough claimed the screen late — never two cards at once.
    useEffect(() => {
        if (!primerVisible || primerBusy) return;
        if ((permission !== null && permission !== 'undetermined') || walkthroughUp) setPrimerVisible(false);
    }, [primerVisible, primerBusy, permission, walkthroughUp]);

    const snoozePrimer = useCallback(() => {
        if (!uid) return;
        const at = Date.now();
        setPrimerDismissedAt(at);
        void writeDismissedAt(primerDismissKey(uid), at);
    }, [uid]);

    const snoozeRemindersOff = useCallback(() => {
        if (!uid) return;
        const at = Date.now();
        setOffDismissedAt(at);
        void writeDismissedAt(remindersOffDismissKey(uid), at);
    }, [uid]);

    /** "not now" / scrim tap. */
    const onPrimerNotNow = useCallback(() => {
        if (primerBusy) return;
        setPrimerVisible(false);
        snoozePrimer();
    }, [primerBusy, snoozePrimer]);

    /** "turn on reminders": the ONE place Home shows the iOS system prompt. */
    const onPrimerEnable = useCallback(async () => {
        if (primerBusy) return;
        setPrimerBusy(true);
        let outcome: PushPermissionState = 'unknown';
        try {
            outcome = await enableIosPushFromUserTap(uid);
        } catch {
            /* never throws by contract — a stray rejection must not strand the card */
        }
        if (outcome !== 'granted') {
            snoozePrimer();
            // They just said "Don't Allow" — following up with "reminders are
            // off" right away would be pushy; it can resurface in a week.
            if (outcome === 'denied') snoozeRemindersOff();
        }
        setPrimerBusy(false);
        setPrimerVisible(false);
        void refreshPermission();
    }, [primerBusy, uid, snoozePrimer, snoozeRemindersOff, refreshPermission]);

    const onRemindersOffOpenSettings = useCallback(() => {
        // Coming back fires a foreground: the permission re-read hides this card
        // and AuthContext registers the token, no cold start needed.
        void Linking.openSettings().catch(() => undefined);
    }, []);

    return {
        primer: {
            visible: primerVisible,
            busy: primerBusy,
            title: copy.title,
            body: copy.body,
            onEnable: onPrimerEnable,
            onNotNow: onPrimerNotNow,
        },
        remindersOff: {
            visible: remindersOffEligible && !primerVisible,
            onOpenSettings: onRemindersOffOpenSettings,
            onDismiss: snoozeRemindersOff,
        },
    };
}
