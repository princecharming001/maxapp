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
    referrals: true,
    // Tasteful, additive on-screen personalization (greeting, goal-ranked
    // Explore, experience-aware planner chips, streak callouts, scan archetype
    // line, goal-aware empty states). Each surface degrades to today's copy when
    // its signal is absent, so ON is cold-start-identical. See RALPH_PERSONALIZE.md.
    personalizedUI: true,
    // Post-onboarding main-app SpotlightTour. Now ON: the "frozen Home" bug was the
    // tour starting against a zero-measured "spot" (full-screen backdrop, no
    // tooltip/Skip). useMainAppTour only calls start() AFTER measureInWindow reports
    // a NON-ZERO rect, and now retries that measure a bounded number of frames
    // instead of bailing forever — so start() can never land a zero spot and the
    // backdrop can never trap touches. That was the documented precondition for
    // flipping this on; with it met, the walkthrough presents reliably.
    mainAppTour: true,
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
