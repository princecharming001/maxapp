/**
 * Central registry for resilience-related persistence keys + a global cache
 * "buster". Keeping these in one tiny module (no imports of app code) lets the
 * error boundary, the global crash handler, the query-cache persister and the
 * navigation-state persister all agree on the exact keys to write / clear
 * without creating import cycles.
 *
 * BUMP `RESILIENCE_BUSTER` on any release that changes the SHAPE of persisted
 * data (the React Query cache shape, the navigation state shape, a draft
 * schema). A changed buster makes every persisted blob from older builds get
 * discarded on read instead of hydrating into incompatible new components and
 * crashing.
 */
export const RESILIENCE_BUSTER = '1';

export const STORAGE_KEYS = {
    /** Dehydrated React Query cache (AsyncStorage). */
    queryCache: 'max.resilience.rqcache.v1',
    /** Persisted navigation position within the paid app (AsyncStorage). */
    navState: 'max.resilience.navstate.v1',
    /** Onboarding wizard draft: { step, answers } (AsyncStorage). */
    onboardingDraft: 'max.resilience.onboardingDraft.v1',
} as const;

/** The two blobs that are RESTORED at boot and could therefore crash-loop the
 *  app if poisoned. The crash handler / error boundary clears exactly these so
 *  the next launch starts clean. Drafts are intentionally NOT included — losing
 *  an onboarding draft on a crash is worse than retrying it, and a draft never
 *  drives the initial render. */
export const BOOT_RESTORED_KEYS: string[] = [STORAGE_KEYS.queryCache, STORAGE_KEYS.navState];
