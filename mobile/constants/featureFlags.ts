/**
 * Feature flags for the pivot build-out. Everything new ships behind one of
 * these, default OFF, with the existing screens as fallback - the app keeps
 * working for existing users at every commit.
 *
 * Flags are toggleable at runtime from the DevDrawer (persisted in dev via
 * AsyncStorage) so each slice can be exercised on web before it's enabled.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FlagName = 'newNav' | 'todayV2' | 'onboardingV2' | 'revealV2' | 'streakV2' | 'faceScan';

const DEFAULTS: Record<FlagName, boolean> = {
    newNav: false,
    todayV2: false,
    onboardingV2: true,
    revealV2: false,
    streakV2: false,
    // Kill switch for the AI face-scan feature. `false` removes it everywhere:
    // the onboarding funnel skips it, the paywall no longer gates purchase on
    // it, and every scan CTA (Profile face-score card, You "New scan"/archive,
    // RevealV2 prompt, Home post-pay redirect) is hidden. The scan SCREENS stay
    // registered but unreachable, so flipping this back to `true` fully restores
    // the feature in one line — every gate reads this flag. Scan-only accounts
    // (isScanUser) are a separate product and intentionally NOT gated by this.
    faceScan: false,
};

const STORAGE_KEY = 'max.featureFlags.v1';

let current: Record<FlagName, boolean> = { ...DEFAULTS };
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((l) => l());
}

// Hydrate dev overrides once at module load (no-op in production builds).
if (__DEV__) {
    AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
            if (!raw) return;
            const saved = JSON.parse(raw) as Partial<Record<FlagName, boolean>>;
            current = { ...current, ...saved };
            emit();
        })
        .catch(() => {});
}

export function getFlag(name: FlagName): boolean {
    return current[name];
}

export function setFlag(name: FlagName, value: boolean) {
    current = { ...current, [name]: value };
    emit();
    if (__DEV__) {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
    }
}

export function allFlags(): Record<FlagName, boolean> {
    return { ...current };
}

export function useFlag(name: FlagName): boolean {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => current[name],
        () => current[name],
    );
}
