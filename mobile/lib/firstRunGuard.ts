import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './resilienceKeys';
import api from '../services/api';

// First-run-after-(re)install guard.
//
// iOS expo-secure-store (Keychain) SURVIVES an app uninstall; AsyncStorage does
// not. So a fresh download can inherit the previous install's tokens and restore
// that stale session (often an unclaimed anon account), dropping the user
// mid-funnel (e.g. CreateAccount) instead of the Landing page.
//
// If our AsyncStorage install-marker is absent this is the FIRST run of this
// install. A genuine (re)install has EMPTY AsyncStorage (uninstall wiped it),
// whereas an existing user first-running a new JS bundle via OTA still has app
// data (RQ cache, drafts, nav state). We clear the inherited secure tokens ONLY
// in the empty case — so a download starts logged-out at Landing WITHOUT logging
// out existing users on an OTA (which would re-strand unclaimed anon accounts).
//
// It is MEMOIZED and must run BEFORE query-cache persistence writes anything (so
// the "empty AsyncStorage" signal is reliable) AND before checkAuth reads the
// token. Both App.tsx boot and AuthContext.checkAuth await this same promise.
let guardPromise: Promise<void> | null = null;

export function ensureFirstRunClean(): Promise<void> {
    if (!guardPromise) {
        guardPromise = (async () => {
            try {
                // Default to a truthy marker on read error so we NEVER clear on a
                // transient AsyncStorage failure.
                const marker = await AsyncStorage.getItem(STORAGE_KEYS.installMarker).catch(() => '1');
                if (marker) return;
                // Default to NON-empty on error so a failure never logs anyone out.
                const keys = await AsyncStorage.getAllKeys().catch(() => ['__err__'] as readonly string[]);
                if (keys.length === 0) {
                    await api.clearTokens().catch(() => undefined);
                }
                await AsyncStorage.setItem(STORAGE_KEYS.installMarker, '1').catch(() => undefined);
            } catch {
                /* never block boot */
            }
        })();
    }
    return guardPromise;
}
