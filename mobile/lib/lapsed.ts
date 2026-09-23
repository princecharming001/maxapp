/**
 * "Lapsed subscriber": finished onboarding, not entitled now, but the server
 * remembers a plan (an expired / cancelled / refunded status, or any past end
 * date). ONE predicate for RootNavigator (boot route → Payment) and
 * PaymentScreen (welcome-back copy, no trial box) so the two can never
 * disagree about the same account.
 */
const LAPSED_STATUSES = new Set(['expired', 'canceled', 'cancelled', 'past_due', 'refunded', 'revoked', 'transferred']);

export function isLapsedUser(user: {
    is_paid?: boolean;
    subscription_status?: string | null;
    subscription_end_date?: string | null;
    onboarding?: { completed?: boolean } | null;
} | null | undefined): boolean {
    if (!user) return false;
    if (user.is_paid) return false;
    if (user.onboarding?.completed !== true) return false;
    const status = String(user.subscription_status ?? '').toLowerCase();
    return LAPSED_STATUSES.has(status) || !!user.subscription_end_date;
}
