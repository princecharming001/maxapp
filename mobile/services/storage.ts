import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore: typeof import('expo-secure-store') | null = null;

if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

// expo-secure-store (iOS Keychain / Android keystore) can throw — transiently
// (keychain busy / just-unlocked) OR persistently on a misbehaving device. Since
// getItemAsync() runs in the request interceptor, a throw there fails EVERY
// request; and a failed write means the session never persists (quit → Landing).
//
// So we (1) retry once, and (2) fall back to AsyncStorage. AsyncStorage isn't
// encrypted, so it's a mild security trade-off used ONLY when the secure store
// is unavailable — the difference between the app working and not. Writes MIRROR
// to AsyncStorage so a later read can recover even if SecureStore silently
// dropped the write. The mirror key is namespaced to avoid collisions.
const FALLBACK_PREFIX = 'max.securefallback.';

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch {
        await new Promise((r) => setTimeout(r, 150));
        return await fn();
    }
}

export async function getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
        return localStorage.getItem(key);
    }
    // Prefer the secure value; only consult the fallback if secure store threw
    // or has nothing (e.g. a prior write failed and only the mirror has it).
    try {
        const v = await withRetry(() => SecureStore!.getItemAsync(key));
        if (v != null) return v;
    } catch {
        /* secure store unavailable — fall through to the mirror */
    }
    try {
        return await AsyncStorage.getItem(FALLBACK_PREFIX + key);
    } catch {
        return null;
    }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
        return;
    }
    // Mirror to AsyncStorage (best-effort) so the value survives even if the
    // secure write silently fails; then attempt the secure write.
    await AsyncStorage.setItem(FALLBACK_PREFIX + key, value).catch(() => undefined);
    try {
        await withRetry(() => SecureStore!.setItemAsync(key, value));
    } catch {
        /* secure store unavailable — the AsyncStorage mirror carries the value */
    }
}

export async function deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') {
        localStorage.removeItem(key);
        return;
    }
    // Clear BOTH so a logout can't leave a token behind in either store.
    await AsyncStorage.removeItem(FALLBACK_PREFIX + key).catch(() => undefined);
    try {
        await SecureStore!.deleteItemAsync(key);
    } catch {
        /* best-effort */
    }
}
