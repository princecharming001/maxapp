/**
 * Connectivity for chat sends, without a native module.
 *
 * `@react-native-community/netinfo` is in package.json but the app has no
 * checked-in iOS project to prove every shipped binary (six OTA runtimes)
 * links it, and its JS throws at import when the native side is missing. So
 * connectivity here is a lightweight probe of our own API's GET /health (4 s
 * timeout), used only AFTER a send fails, plus a slow poll while a message is
 * waiting to go out. The probe answers the question the chat actually has:
 * "can I reach Superpower right now?".
 */
import { AppState, type AppStateStatus } from 'react-native';
import api from '../services/api';

export const PROBE_TIMEOUT_MS = 4_000;
/** While a message waits for the network, re-probe this often. */
export const RECONNECT_POLL_MS = 8_000;

/** Why a chat send failed, in terms the user can act on. */
export type SendFailure = 'offline' | 'server';

export const SEND_FAILURE_COPY: Record<SendFailure, string> = {
    offline: "You're offline. I'll send it when you're back.",
    server: 'That took too long on our side. Tap to retry.',
};

/** True when our API answers /health within the timeout. */
export async function probeOnline(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
    try {
        return await api.checkBackendHealth({ timeoutMs });
    } catch {
        return false;
    }
}

/**
 * Classify a failed send. `null` means the server answered with a 4xx the
 * user should read (402, 401, a plain `detail`), which is not retryable.
 * 5xx / 408 / 504 are ours ('server'). No response at all → probe: an
 * unreachable API is 'offline', a reachable one means the request itself
 * timed out on our side ('server').
 */
export async function classifySendFailure(
    e: unknown,
    probe: () => Promise<boolean> = probeOnline,
): Promise<SendFailure | null> {
    const status = (e as { response?: { status?: number } } | null)?.response?.status;
    if (typeof status === 'number') {
        if (status >= 500 || status === 408 || status === 504) return 'server';
        return null;
    }
    return (await probe()) ? 'server' : 'offline';
}

/**
 * Watch for the API to come back. Calls `onOnline` once per offline→online
 * transition (never on a mere foreground: coming back to the app only
 * triggers a probe, and only a successful probe after a failed one counts).
 * Returns a stop function.
 */
export function watchReconnect(
    onOnline: () => void,
    opts: { pollMs?: number; probe?: () => Promise<boolean> } = {},
): () => void {
    const pollMs = opts.pollMs ?? RECONNECT_POLL_MS;
    const probe = opts.probe ?? probeOnline;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        let up = false;
        try {
            up = await probe();
        } finally {
            inFlight = false;
        }
        if (stopped) return;
        if (up) {
            stop();
            onOnline();
            return;
        }
        schedule();
    };
    const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void check(), pollMs);
    };
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (next === 'active') void check();
    });
    function stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
        sub.remove();
    }
    schedule();
    return stop;
}
