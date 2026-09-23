/**
 * The in-flight chat message that survives a kill / offline blip.
 *
 * Scoped to a user id: the previous blob was device-wide, so a message user A
 * typed and never got to send was replayed as user B after an account switch.
 * A blob whose owner isn't the current user is ignored AND cleared. Cleared
 * on logout / auth-lost / account deletion by AuthContext.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@max_pending_chat_v2';
const LEGACY_KEY = '@max_pending_chat_v1';

export type PendingChat = {
    userId: string;
    msg: string;
    initContext?: string;
    chatIntent?: string;
    /** Stable per-turn id: a replay re-sends it so the server can dedupe. */
    clientTurnId?: string;
    at: number;
};

/** A new client turn id (no uuid dependency; uniqueness per device is all we need). */
export function newClientTurnId(): string {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function savePendingChat(entry: PendingChat): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, JSON.stringify(entry));
    } catch {
        /* best-effort */
    }
}

/** The pending message for THIS user, or null. A stale/foreign blob is dropped. */
export async function loadPendingChat(userId: string): Promise<PendingChat | null> {
    try {
        // Retire the un-scoped v1 blob unconditionally: we cannot know whose it was.
        await AsyncStorage.removeItem(LEGACY_KEY).catch(() => undefined);
        const raw = await AsyncStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PendingChat> | null;
        if (!parsed || typeof parsed.msg !== 'string' || !parsed.msg) {
            await clearPendingChat();
            return null;
        }
        if (String(parsed.userId ?? '') !== String(userId)) {
            await clearPendingChat();
            return null;
        }
        return parsed as PendingChat;
    } catch {
        return null;
    }
}

export async function clearPendingChat(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([KEY, LEGACY_KEY]);
    } catch {
        /* ignore */
    }
}
