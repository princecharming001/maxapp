import { Platform } from 'react-native';

let SecureStore: typeof import('expo-secure-store') | null = null;

if (Platform.OS !== 'web') {
    SecureStore = require('expo-secure-store');
}

// expo-secure-store (iOS Keychain / Android keystore) can TRANSIENTLY throw
// (keychain busy, device just unlocked, etc.). A single retry almost always
// succeeds — and it matters: a failed token READ makes getToken() throw in the
// request interceptor → EVERY request fails; a failed token WRITE means the
// session isn't persisted → quit/reopen lands on Landing.
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
    return withRetry(() => SecureStore!.getItemAsync(key));
}

export async function setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
        return;
    }
    await withRetry(() => SecureStore!.setItemAsync(key, value));
}

export async function deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') {
        localStorage.removeItem(key);
        return;
    }
    return SecureStore!.deleteItemAsync(key);
}
