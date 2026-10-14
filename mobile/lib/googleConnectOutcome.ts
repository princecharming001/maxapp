// Pure helpers for the Google Calendar connect flow (no React Native imports,
// so they run under scripts/run-unit-tests.js). lib/googleConnect.ts re-exports.

// How a connect attempt ended, read from the URL the backend redirected to
// (cannon://google-connected?connected=1 or ?error=<reason>).
//   unknown = we fell back to a plain browser sheet and can't see the redirect;
//             the caller's status poll decides.
export type GoogleConnectOutcome =
    | 'connected'
    | 'cancelled'      // closed the sheet before finishing
    | 'denied'         // tapped Cancel on Google's screen
    | 'no_calendar'    // unticked the calendar permission
    | 'failed'
    | 'unknown';

export function parseConnectRedirect(url: string | null | undefined): GoogleConnectOutcome {
    if (!url) return 'unknown';
    const m = /[?&]error=([^&#]+)/.exec(url);
    if (m) {
        const code = decodeURIComponent(m[1]);
        if (code === 'denied' || code === 'no_calendar') return code;
        return 'failed';
    }
    return /[?&]connected=1/.test(url) ? 'connected' : 'unknown';
}

/**
 * One plain sentence for a connect that didn't work, or null when there's
 * nothing to say (it worked, or the user just closed the sheet on purpose).
 */
export function connectOutcomeMessage(outcome: GoogleConnectOutcome): { title: string; body: string } | null {
    switch (outcome) {
        case 'denied':
            return {
                title: 'Calendar not connected',
                body: "You didn't give permission on Google's screen. Nothing was changed.",
            };
        case 'no_calendar':
            return {
                title: 'Calendar not connected',
                body: 'Superpower needs to see your calendar to plan around it. Try again and leave the calendar box ticked.',
            };
        case 'failed':
            return {
                title: 'Calendar not connected',
                body: 'Something went wrong with Google. Please try again.',
            };
        default:
            return null;
    }
}

/** "today 9:14 AM" / "Oct 12, 9:14 AM" — a bare time hides a sync that's days old. */
export function formatLastSynced(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? `today ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
