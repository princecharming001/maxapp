/**
 * Feature flags — all permanently enabled. No runtime toggles, no AsyncStorage.
 * Each call-site keeps its `useFlag` / `getFlag` call so the gates stay in place
 * and can be individually disabled later by changing the value here.
 */
export type FlagName =
    | 'newNav'
    | 'todayV2'
    | 'onboardingV2'
    | 'revealV2'
    | 'streakV2'
    | 'faceScan'
    | 'personalizedUI'
    | 'referrals'
    | 'mainAppTour';

const FLAGS: Record<FlagName, boolean> = {
    newNav: false,
    todayV2: false,
    onboardingV2: true,
    revealV2: true,
    streakV2: true,
    faceScan: true,
    // Referral / promo codes (RALPH_REFERRAL). Default OFF → the code field is
    // hidden and the app is byte-identical to today. Must match the backend
    // `referrals_enabled` flag before flipping on.
    referrals: false,
    // Tasteful, additive on-screen personalization (greeting, goal-ranked
    // Explore, experience-aware planner chips, streak callouts, scan archetype
    // line, goal-aware empty states). Each surface degrades to today's copy when
    // its signal is absent, so ON is cold-start-identical. See RALPH_PERSONALIZE.md.
    personalizedUI: true,
    // Post-onboarding main-app SpotlightTour. Default OFF: react-native-spotlight-tour
    // can land a zero-measured "spot", leaving a full-screen backdrop that swallows
    // every touch with no visible tooltip/Skip — the "frozen Home after Get Started"
    // bug. The measure-gated starter + watchdog reduce the risk but can't fully
    // guarantee it on this RN version, so the auto-tour stays disabled until it's
    // proven safe (or replaced). Flip ON only after verifying it can't trap touches.
    mainAppTour: false,
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
