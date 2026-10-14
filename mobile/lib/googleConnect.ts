import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api from '../services/api';
import { Alert } from '../components/InAppAlert';
import {
    connectOutcomeMessage,
    parseConnectRedirect,
    type GoogleConnectOutcome,
} from './googleConnectOutcome';

export { connectOutcomeMessage, formatLastSynced, parseConnectRedirect } from './googleConnectOutcome';
export type { GoogleConnectOutcome } from './googleConnectOutcome';

// Open the Google Calendar OAuth consent flow.
//
// Primary: openAuthSessionAsync — the native "<App> Wants to Use google.com to
// Sign In" sheet (ASWebAuthenticationSession on iOS / Chrome Custom Tab on
// Android) that AUTO-CLOSES the moment the backend callback redirects to our app
// scheme (cannon://google-connected, per app.json).
//
// Fallback: on some builds / OS states openAuthSessionAsync can throw or fail to
// present (returns 'locked'). In that case we open a plain in-app browser sheet
// (SFSafariViewController), which reliably opens; the caller's status poll then
// detects the connection. Either way the button always DOES something rather
// than silently no-op-ing.
// `includeWrite` additionally requests permission to create a "Superpower" calendar
// and put the routine in it. Existing users linked before routine-sync existed
// and hold a read-only grant, so enabling it re-runs consent — Google always
// re-prompts here (the backend sends prompt=consent), and the extra scope is
// calendar.app.created: write access to calendars WE make, never the user's own.
export async function openGoogleCalendarAuth(
    includeGmail = false,
    includeWrite = false,
): Promise<GoogleConnectOutcome> {
    const returnUrl = Linking.createURL('google-connected');
    const { auth_url } = await api.getGoogleAuthUrl(includeGmail, returnUrl, includeWrite);
    if (!auth_url) {
        throw new Error('The server did not return a Google sign-in URL.');
    }

    try {
        const res = await WebBrowser.openAuthSessionAsync(auth_url, returnUrl);
        if (res.type === 'success') return parseConnectRedirect(res.url);
        if (res.type === 'cancel' || res.type === 'dismiss') return 'cancelled';
        // 'locked' = another auth session is already in progress and this one
        // never presented — fall back so the user isn't stuck on nothing.
        if (res.type === 'locked') {
            await WebBrowser.openBrowserAsync(auth_url);
        }
    } catch {
        // openAuthSessionAsync threw (couldn't present the native sheet). Open a
        // regular browser sheet instead — it always opens; the poll finishes it.
        await WebBrowser.openBrowserAsync(auth_url);
    }
    return 'unknown';
}

/** Show the outcome message, if any. Returns true when the attempt failed. */
export function alertConnectOutcome(outcome: GoogleConnectOutcome): boolean {
    const msg = connectOutcomeMessage(outcome);
    if (msg) Alert.alert(msg.title, msg.body);
    return !!msg;
}

/** Ask before disconnecting, spelling out what happens to their calendar. */
export function confirmGoogleDisconnect(routineSyncOn: boolean): Promise<boolean> {
    const body = routineSyncOn
        ? 'Superpower will stop reading your calendar and delete the "Superpower" calendar it made, including past tasks. Your own events stay as they are. Your plan will re-fit without your meetings.'
        : 'Superpower will stop reading your calendar. Your own events stay as they are. Your plan will re-fit without your meetings.';
    return new Promise((resolve) => {
        Alert.alert('Disconnect Google Calendar?', body, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Disconnect', style: 'destructive', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
    });
}

/** Ask before turning routine sync off — it deletes the "Superpower" calendar. */
export function confirmRoutineSyncOff(): Promise<boolean> {
    return new Promise((resolve) => {
        Alert.alert(
            'Remove your routine from Google?',
            'This deletes the "Superpower" calendar from your Google account. Your own events stay as they are.',
            [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
        );
    });
}

/** Shown after a disconnect when Google had already cut our access. */
export function alertDisconnectResult(res: { routine_calendar_left?: boolean } | null | undefined): void {
    if (res?.routine_calendar_left) {
        Alert.alert(
            'Calendar disconnected',
            'We couldn\'t remove the "Superpower" calendar from your Google account. You can delete it in Google Calendar.',
        );
    }
}
