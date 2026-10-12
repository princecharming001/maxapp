/**
 * Per-tier feature limits.
 *
 * Active programs: there is no slot cap any more — paid users (basic or
 * premium) can stack as many programs as they like, and there is no 7-day swap
 * lock. The day planner's time budget keeps a stacked day sane, not a count.
 * Unpaid users are gated by the paywall (usePaywallGate), not by a slot count.
 *
 * Keep mobile limits in sync with backend enforcement (the source of truth):
 *   - backend/services/schedule_service.py MAX_ACTIVE_SCHEDULES_BASIC / PREMIUM (99)
 *   - PaymentScreen.tsx for the user-facing feature copy
 */

/** Effectively unlimited — mirrors backend MAX_ACTIVE_SCHEDULES_* = 99. */
export const UNLIMITED_ACTIVE_SCHEDULES = 99;

export type TierUser = {
    is_paid?: boolean;
    subscription_tier?: string | null;
} | null;

export function isPremium(user: TierUser): boolean {
    if (!user?.is_paid) return false;
    return (user.subscription_tier || '').toLowerCase() === 'premium';
}

/** Active-schedule cap — must match backend MAX_ACTIVE_SCHEDULES_* (99 for
 *  every tier; the backend applies the same value to unpaid users, who are
 *  stopped by the paywall before they can start a plan). */
export function maxActiveSchedulesForUser(_user: TierUser): number {
    return UNLIMITED_ACTIVE_SCHEDULES;
}

/** "My Maxxes" home tile / goal count — same as the active-schedule cap. */
export function maxHomeMaxxesForUser(user: TierUser): number {
    return maxActiveSchedulesForUser(user);
}

