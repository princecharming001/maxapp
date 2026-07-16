/**
 * Entitlement reconciler — the "owned but locked out" failsafe.
 *
 * If StoreKit says this Apple ID owns an active Max subscription but the
 * signed-in account is unpaid (classic case: new phone / reinstall / second
 * account), the user gets stranded at the paywall: Apple refuses to sell the
 * subscription again ("You're already subscribed") and nothing reconciles the
 * entitlement. This module heals that automatically: read the Apple ID's
 * current entitlements and re-verify each with the backend, which grants
 * `is_paid` server-side and lets the navigator remount into the paid app.
 *
 * Standalone on purpose — safe to call from App.tsx on launch/foreground
 * without the paywall's useIAP() hook being mounted. iOS only; every other
 * platform is a cheap no-op. NEVER finishes transactions and NEVER surfaces
 * alerts: it either silently fixes the account or silently does nothing.
 */
import { Platform } from 'react-native';
import api from '../services/api';

// Don't hammer StoreKit/backend: at most one sweep per interval unless forced.
const MIN_INTERVAL_MS = 4 * 60 * 1000;
let lastRunAt = 0;
let inFlight: Promise<boolean> | null = null;

async function sweep(): Promise<boolean> {
    // Lazy-require so non-iOS bundles and test environments never touch StoreKit.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iap = require('react-native-iap');
    try {
        await iap.initConnection();
    } catch {
        // Already connected (paywall's useIAP owns a connection) — fine.
    }
    const purchases: unknown[] = (await iap.getAvailablePurchases()) ?? [];
    if (purchases.length === 0) return false;

    let granted = false;
    for (const purchase of purchases) {
        const p = purchase as { transactionId?: string; id?: string; productId?: string };
        const tid = String(p.transactionId ?? p.id ?? '').trim();
        if (!tid) continue;
        try {
            const res = await api.verifyAppleIapTransaction(tid, p.productId || undefined);
            if (res?.status === 'ok') granted = true;
        } catch {
            // Expired/foreign/unverifiable transaction — skip silently. Do NOT
            // finish it: the paywall's own queue recovery handles finalization.
        }
    }
    return granted;
}

/**
 * Re-verify the Apple ID's owned subscriptions against the backend.
 * Resolves true when at least one ACTIVE subscription was granted — the
 * caller should refreshUser() so `isPaid` flips and the UI unlocks.
 */
export async function reconcileOwnedSubscriptions(opts?: { force?: boolean }): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    if (inFlight) return inFlight;
    const now = Date.now();
    if (!opts?.force && now - lastRunAt < MIN_INTERVAL_MS) return false;
    lastRunAt = now;
    inFlight = sweep()
        .catch((e) => {
            console.warn('[EntitlementReconciler] sweep failed:', e);
            return false;
        })
        .finally(() => {
            inFlight = null;
        });
    return inFlight;
}
