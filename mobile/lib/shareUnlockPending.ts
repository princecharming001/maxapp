/**
 * Texts the Messages composer reported as sent that the server hasn't counted
 * yet (the request failed after the message went out). Replayed the next time
 * the ShareUnlock screen opens, with the same send id, so the server answers a
 * replay with its original outcome instead of counting it again.
 *
 * Kept in the keychain (services/storage, SecureStore with an AsyncStorage
 * fallback), scoped to the user so an account switch never replays someone
 * else's sends, and expired after two weeks: a number is held only as long
 * as it takes to count that friend once.
 */
import { deleteItemAsync, getItemAsync, setItemAsync } from '../services/storage';

const KEY = 'max_share_unlock_pending_v1';   // SecureStore keys: letters, digits, '.', '-', '_'
const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CAP = 20;                              // SecureStore values are small; a real backlog never gets near this

export type PendingShareSend = { phone: string; id: string; at: number };
type Blob = { userId: string; sends: PendingShareSend[] };

/** A new per-send id (no uuid dependency; uniqueness per device is all we need). */
export function newShareSendId(): string {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function read(): Promise<Blob | null> {
    try {
        const raw = await getItemAsync(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Blob> | null;
        if (!parsed || typeof parsed.userId !== 'string' || !Array.isArray(parsed.sends)) return null;
        const cutoff = Date.now() - TTL_MS;
        const sends = parsed.sends.filter(
            (s): s is PendingShareSend =>
                !!s && typeof s.phone === 'string' && !!s.phone && typeof s.id === 'string' && typeof s.at === 'number' && s.at > cutoff,
        );
        return { userId: parsed.userId, sends };
    } catch {
        return null;
    }
}

export async function setPendingShareSends(userId: string, sends: PendingShareSend[]): Promise<void> {
    try {
        if (!sends.length) await deleteItemAsync(KEY);
        else await setItemAsync(KEY, JSON.stringify({ userId, sends: sends.slice(-CAP) } satisfies Blob));
    } catch {
        /* best-effort */
    }
}

/** This user's uncounted sends. Another user's blob is dropped, not replayed. */
export async function loadPendingShareSends(userId: string): Promise<PendingShareSend[]> {
    const blob = await read();
    if (!blob) return [];
    if (blob.userId !== userId) {
        await setPendingShareSends(userId, []);
        return [];
    }
    return blob.sends;
}

export async function addPendingShareSend(userId: string, send: PendingShareSend): Promise<void> {
    const current = await loadPendingShareSends(userId);
    if (!current.some((s) => s.id === send.id)) await setPendingShareSends(userId, [...current, send]);
}
