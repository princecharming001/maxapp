/**
 * iOS push: permission, the APNs device token, and registering it with the
 * server (POST users/push-token).
 *
 * Two entry points, deliberately separate:
 *
 *   getIosPushTokenIfGranted()          NEVER prompts. Used on launch, account
 *                                       switch and every foreground.
 *   requestIosPushPermissionAndToken()  Shows the iOS system prompt. Call it
 *                                       ONLY from an explicit user tap (the Home
 *                                       reminders primer, Settings → Notifications).
 *
 * iOS shows its system prompt once per install. The old single function did
 * both — and ran the moment the anonymous funnel account was minted, so most
 * users spent that one prompt before seeing any value, and a "Don't Allow"
 * there was permanent.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import api from './api';
import {
    pushTokenKey,
    shouldRegisterPushToken,
    toPushPermissionState,
    type PushPermissionState,
    type TokenRegistration,
} from '../lib/notificationPermission';

/** Expo Go / permission dialogs can leave getDevicePushTokenAsync() pending forever without rejecting. */
const IOS_PUSH_TOKEN_FLOW_MS = 22_000;
/** The system prompt waits on the user; cap it so a wedged dialog can't spin a caller's button forever. */
const IOS_PERMISSION_PROMPT_MS = 120_000;

/** Resolve `fallback` on timeout or rejection — these flows must never throw or hang. */
function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const timer = setTimeout(() => resolve(fallback), ms);
        work.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            () => {
                clearTimeout(timer);
                resolve(fallback);
            },
        );
    });
}

async function fetchApnsDeviceToken(): Promise<string | null> {
    try {
        const res = await Notifications.getDevicePushTokenAsync();
        const data = typeof res?.data === 'string' ? res.data.trim() : '';
        return data || null;
    } catch {
        return null;
    }
}

/** Current notification permission, mapped for the UI. Never prompts. 'unknown' on web / read failure. */
export async function readPushPermission(): Promise<PushPermissionState> {
    if (Platform.OS === 'web') return 'unknown';
    try {
        return toPushPermissionState(await Notifications.getPermissionsAsync());
    } catch {
        return 'unknown';
    }
}

/**
 * NO PROMPT. The native APNs device token (hex) when notifications are
 * ALREADY allowed (authorized, provisional or ephemeral); otherwise null.
 * iOS only.
 */
export async function getIosPushTokenIfGranted(): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;
    return withTimeout(
        (async () => ((await readPushPermission()) === 'granted' ? fetchApnsDeviceToken() : null))(),
        IOS_PUSH_TOKEN_FLOW_MS,
        null,
    );
}

/**
 * EXPLICIT. Shows the iOS system prompt when the status is still undetermined
 * (once decided, iOS answers immediately with no UI), then fetches the token
 * if granted. Call ONLY from a user tap.
 */
export async function requestIosPushPermissionAndToken(): Promise<{ state: PushPermissionState; token: string | null }> {
    if (Platform.OS !== 'ios') return { state: 'unknown', token: null };
    const res = await withTimeout(
        Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }),
        IOS_PERMISSION_PROMPT_MS,
        null,
    );
    const state = res ? toPushPermissionState(res) : await readPushPermission();
    if (state !== 'granted') return { state, token: null };
    return { state, token: await withTimeout(fetchApnsDeviceToken(), IOS_PUSH_TOKEN_FLOW_MS, null) };
}

/* ── Server registration ─────────────────────────────────────────────── */

let lastRegistration: TokenRegistration = null;
const registrationsInFlight = new Map<string, Promise<boolean>>();

/**
 * POST the token for this account — any signed-in user: paid or not, anonymous
 * included (the backend accepts tokens from every authenticated account).
 * Skips a (user, token) pair that succeeded recently unless `force`; shares an
 * in-flight POST for the same pair (the primer's grant and the foreground
 * re-sync land in the same second). Resolves true once the server has it.
 * Never throws.
 */
export function registerPushTokenForUser(
    userId: string,
    token: string,
    opts?: { force?: boolean },
): Promise<boolean> {
    if (!userId || !token) return Promise.resolve(false);
    const key = pushTokenKey(userId, token);
    const pending = registrationsInFlight.get(key);
    if (pending) return pending;
    if (!opts?.force && !shouldRegisterPushToken(lastRegistration, key, Date.now())) return Promise.resolve(true);
    const run = api
        .registerPushToken(token)
        .then(
            () => {
                lastRegistration = { key, at: Date.now() };
                return true;
            },
            // Offline / 5xx (or a 403 from a backend that still gates on
            // payment): nothing recorded, so the next foreground retries.
            () => false,
        )
        .finally(() => {
            registrationsInFlight.delete(key);
        });
    registrationsInFlight.set(key, run);
    return run;
}

const syncsInFlight = new Map<string, Promise<void>>();

/**
 * Launch / account-switch / foreground sync: when notifications are already
 * allowed, make sure the server has this device's token for `userId`.
 * NEVER prompts, never throws, single-flight per user.
 */
export function syncIosPushTokenIfGranted(userId: string): Promise<void> {
    if (Platform.OS !== 'ios' || !userId) return Promise.resolve();
    const pending = syncsInFlight.get(userId);
    if (pending) return pending;
    const run = getIosPushTokenIfGranted()
        .then(async (token) => {
            if (token) await registerPushTokenForUser(userId, token);
        })
        .catch(() => {
            /* best-effort — the next foreground retries */
        })
        .finally(() => {
            syncsInFlight.delete(userId);
        });
    syncsInFlight.set(userId, run);
    return run;
}

/**
 * The explicit opt-in behind "turn on reminders" (Home primer) and Settings →
 * Notifications: prompt (only if undetermined) → token → register right away.
 * Returns the resulting permission state.
 */
export async function enableIosPushFromUserTap(userId: string | null | undefined): Promise<PushPermissionState> {
    const { state, token } = await requestIosPushPermissionAndToken();
    if (state === 'granted' && token && userId) {
        await registerPushTokenForUser(userId, token, { force: true });
    }
    return state;
}
