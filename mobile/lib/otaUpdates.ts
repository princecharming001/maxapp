import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

// Background-download a pending EAS Update (OTA) so it's staged for the NEXT
// natural cold start.
//
// It deliberately does NOT call Updates.reloadAsync(). An earlier version hot-
// swapped the bundle mid-session, which tore users out of in-flight flows: a
// reload firing during the ~1–2s "Get started" → anon-signup → navigator swap
// (or on any iOS inactive→active bounce — keyboard, permission alert, auth
// sheet) cold-restarted the JS runtime back to the Landing screen, so the tap
// appeared to do nothing. Restarting a running app out from under the user is
// never worth it. Letting the fetched bundle apply on the next launch is the
// safe expo default (app.json fallbackToCacheTimeout: 0 already background-
// fetches; this just adds an on-foreground re-check).
//
// Guarded so it never runs in dev / on web / in a build without EAS Update, and
// throttled to at most once a minute. No reload ⇒ no reload loop.

let checking = false;
let lastCheck = 0;

export async function checkAndApplyUpdate(force = false): Promise<void> {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    if (checking) return;
    const now = Date.now();
    if (!force && now - lastCheck < 60_000) return; // throttle: at most once/min
    lastCheck = now;
    checking = true;
    try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
            // Download only — applies on the next cold start. Never reloadAsync().
            await Updates.fetchUpdateAsync();
        }
    } catch {
        // offline / no update / transient network — ignore and retry next time
    } finally {
        checking = false;
    }
}
