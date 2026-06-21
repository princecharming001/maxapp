/**
 * Feature flags — all permanently enabled. No runtime toggles, no AsyncStorage.
 * Each call-site keeps its `useFlag` / `getFlag` call so the gates stay in place
 * and can be individually disabled later by changing the value here.
 */
export type FlagName = 'newNav' | 'todayV2' | 'onboardingV2' | 'revealV2' | 'streakV2' | 'faceScan';

const FLAGS: Record<FlagName, boolean> = {
    newNav: false,
    todayV2: false,
    onboardingV2: true,
    revealV2: true,
    streakV2: true,
    faceScan: true,
};

export function getFlag(name: FlagName): boolean {
    return FLAGS[name];
}

/** Drop-in replacement for the old hook — returns the static value synchronously. */
export function useFlag(name: FlagName): boolean {
    return FLAGS[name];
}

/** No-op kept for compatibility — flags are no longer runtime-mutable. */
export function setFlag(_name: FlagName, _value: boolean) {}

export function allFlags(): Record<FlagName, boolean> {
    return { ...FLAGS };
}
