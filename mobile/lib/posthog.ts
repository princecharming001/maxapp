/**
 * PostHog: product analytics, session replay and error tracking.
 *
 * Off until a key is set: with no EXPO_PUBLIC_POSTHOG_KEY every helper here is
 * a no-op, so the app behaves exactly as before. The key is public (PostHog
 * project API keys are meant to ship in clients) and arrives in the bundle, so
 * setting it later only needs an OTA, not a new build. The native plugin
 * (@posthog/react-native-plugin, for replay and native crashes) ships in the
 * binary.
 *
 * Health data stays out (the Consumer Health Data policy, and the same rule as
 * the outbound_privacy gate for push/SMS/calendar):
 *   - replay masks every text input and every image;
 *   - recording pauses on screens that show health details in plain text
 *     (the coach chat, task guides, chat threads) — see UNRECORDED_SCREENS;
 *   - nobody with an active Peptidemax program is ever recorded;
 *   - users are identified by id only (no email, no name);
 *   - API errors report the endpoint pattern and status, never bodies.
 */
import type { PostHog } from 'posthog-react-native';

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY || '').trim();
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').trim();

/**
 * Only on installs built with PostHog's native companions (expo-device and
 * expo-application arrived with build 348 / 3.1.5). Older runtimes never load
 * the library at all: an OTA must boot on every live binary, and nothing
 * PostHog-related may run at module scope there. Never throws.
 */
function loadPostHogLib(): typeof import('posthog-react-native') | null {
    if (!KEY) return null;
    try {
        const { requireOptionalNativeModule } = require('expo-modules-core');
        if (!requireOptionalNativeModule('ExpoDevice') || !requireOptionalNativeModule('ExpoApplication')) return null;
        return require('posthog-react-native');
    } catch {
        return null;
    }
}
const lib = loadPostHogLib();

/** The provider component, or null when PostHog is off on this install. */
export const PostHogProviderComponent = lib ? lib.PostHogProvider : null;

function create(): PostHog | null {
    if (!lib) return null;
    try {
        return new lib.PostHog(KEY, {
            host: HOST,
            personProfiles: 'identified_only',
            captureAppLifecycleEvents: true,
            enableSessionReplay: true,
            sessionReplayConfig: {
                maskAllTextInputs: true,
                maskAllImages: true,
                maskAllSandboxedViews: true,   // the contacts picker in share-to-unlock
                captureLog: false,             // console lines can carry plan text
            },
            errorTracking: {
                autocapture: {
                    uncaughtExceptions: true,
                    unhandledRejections: true,
                    console: ['error'],
                    nativeCrashes: true,
                },
            },
        });
    } catch {
        return null;
    }
}

export const posthog: PostHog | null = create();

export const posthogEnabled = posthog !== null;

/** Screens whose plain text is health detail: never in a replay. */
export const UNRECORDED_SCREENS = new Set(['Chat', 'TaskGuide', 'ChannelChat', 'AdminUserChat']);

export function phScreen(name: string, props?: Record<string, unknown>): void {
    try { posthog?.screen(name, props as any); } catch { /* never break navigation */ }
}

export function phCapture(event: string, props?: Record<string, unknown>): void {
    try { posthog?.capture(event, props as any); } catch { /* ignore */ }
}

export function phException(error: unknown, props?: Record<string, unknown>): void {
    try { posthog?.captureException(error, props as any); } catch { /* ignore */ }
}

/** Identify by id only; traits are coarse flags, never health data. */
export function phIdentify(userId: string, traits?: { is_paid?: boolean; is_admin?: boolean }): void {
    try { posthog?.identify(userId, traits as any); } catch { /* ignore */ }
}

export function phReset(): void {
    try { posthog?.reset(); } catch { /* ignore */ }
}

let recordingPaused = false;
let peptideUser = false;
let sensitiveScreen = false;

function applyRecording(): void {
    if (!posthog) return;
    const allowed = !peptideUser && !sensitiveScreen;
    try {
        if (!allowed && !recordingPaused) {
            recordingPaused = true;
            void posthog.stopSessionRecording();
        } else if (allowed && recordingPaused) {
            recordingPaused = false;
            void posthog.startSessionRecording();
        }
    } catch { /* ignore */ }
}

/** Peptide protocols are never recorded. */
export function phSetPeptideUser(active: boolean): void {
    peptideUser = active;
    applyRecording();
}

/** Called on every navigation: the screen view, plus pausing replay on sensitive screens. */
export function phRouteChanged(routeName: string | undefined): void {
    if (!routeName) return;
    sensitiveScreen = UNRECORDED_SCREENS.has(routeName);
    applyRecording();
    phScreen(routeName);
}

/** "/schedules/6b1f…/tasks/9c2…/guide" -> "/schedules/:id/tasks/:id/guide". */
export function endpointPattern(url: string): string {
    const path = String(url || '').split('?')[0].replace(/^https?:\/\/[^/]+/, '');
    return path
        .split('/')
        .map((seg) => (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg) ? ':id' : seg))
        .join('/');
}

/** Touch autocapture: which element was tapped, by component name and testID only.
 *  Its text and accessibility label are left out (they can carry plan or peptide text). */
export const PH_AUTOCAPTURE = {
    captureScreens: false,          // react-navigation v7: screens come from phRouteChanged
    captureTouches: true,
    propsToCapture: ['testID', 'ph-label'],
} as const;
