/**
 * One-shot "where to land after the next logout" signal.
 *
 * The authenticated funnel stack (ScanOffer → … → Payment) registers no Login
 * route, so every "Already have an account? Sign in" affordance inside it has
 * to log out first and THEN navigate — but logging out remounts the whole
 * NavigationContainer (App.tsx keys it on auth state), so a navigate() fired
 * from the same handler races the remount and is dropped. The handler sets
 * this flag instead; App.tsx consumes it in an effect that runs once the
 * guest stack is mounted and ready.
 */
let pending: string | null = null;

export const markPostLogoutRoute = (route: string): void => {
    pending = route;
};

/** Returns the requested route exactly once, then resets. */
export const consumePostLogoutRoute = (): string | null => {
    const r = pending;
    pending = null;
    return r;
};
