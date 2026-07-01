import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

// Promptly apply EAS Update (OTA) JS bundles.
//
// app.json sets `updates.fallbackToCacheTimeout: 0`, so on a cold start the app
// launches with the *cached* bundle and only downloads the new one in the
// background — the update then applies on the NEXT cold start. In practice that
// means a user has to force-quit and reopen twice before a shipped OTA shows up.
//
// This helper closes that gap: on mount and on every foreground it checks for a
// pending update, downloads it, and hot-swaps it in via reloadAsync(). Guarded
// so it never runs in dev / on web / in a build without EAS Update, is throttled
// to at most once a minute, and can't re-enter (no reload loop).

let checking = false;
let reloading = false;
let lastCheck = 0;

export async function checkAndApplyUpdate(force = false): Promise<void> {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    if (checking || reloading) return;
    const now = Date.now();
    if (!force && now - lastCheck < 60_000) return; // throttle: at most once/min
    lastCheck = now;
    checking = true;
    try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
            await Updates.fetchUpdateAsync();
            reloading = true;
            await Updates.reloadAsync(); // swap to the freshly-downloaded JS bundle now
        }
    } catch {
        // offline / no update / transient network — ignore and retry next foreground
    } finally {
        checking = false;
    }
}
