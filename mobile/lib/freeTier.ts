/**
 * Free-tier choice — "Continue with the free plan" on the paywall.
 *
 * A free user gets INTO the main app (Today / Explore / Chat UI) but every
 * real action (start a plan, send a chat message, …) bounces to Payment via
 * usePaywallGate. The choice is a client-side, per-user flag: it grants no
 * entitlement — the backend still treats the user as unpaid, and all paid
 * content stays server-gated.
 *
 * Keyed by user id so a different account on the same device never inherits
 * the choice. Cleared on logout / account deletion / auth-lost teardown.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'max_free_tier_chosen_v1';

export async function loadFreeTierChoice(userId: string): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        return !!raw && raw === userId;
    } catch {
        return false;
    }
}

export async function saveFreeTierChoice(userId: string): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, userId);
    } catch {
        /* non-fatal — worst case the user re-taps "continue free" next boot */
    }
}

export async function clearFreeTierChoice(): Promise<void> {
    try {
        await AsyncStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
