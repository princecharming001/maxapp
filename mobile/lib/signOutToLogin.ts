import { markPostLogoutRoute } from './postLogoutNav';

/**
 * Drop the current session and land on the Login form.
 *
 * The single implementation behind every "Already have an account? Sign in"
 * control inside the authenticated funnel (Payment, ScanOffer, CreateAccount,
 * the "subscription belongs to another account" alerts). The funnel stack has
 * no Login route, so this logs out (→ guest stack) and lets App.tsx forward
 * to Login once that stack is mounted (see lib/postLogoutNav.ts).
 *
 * `logout` is the AuthContext function — passed in so this stays a plain
 * module usable from hooks and screens alike.
 */
export async function signOutToLogin(logout: () => Promise<void>): Promise<void> {
    markPostLogoutRoute('Login');
    try {
        await logout();
    } catch {
        // Tokens may already be gone; the guest stack still mounts and the
        // pending route still fires.
    }
}
