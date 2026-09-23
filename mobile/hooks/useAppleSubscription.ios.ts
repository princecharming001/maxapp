import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Alert } from '../components/InAppAlert';
import { useQueryClient } from '@tanstack/react-query';
import {
    // Use the STANDALONE fetchProducts — it RESOLVES to the array. (The
    // useIAP() wrapper of the same name returns Promise<void> and only pushes
    // results into the hook's internal state, so awaiting it is always
    // undefined → the paywall saw 0 products: "Plan not available yet".)
    fetchProducts as fetchProductsRaw,
    type Product,
} from 'react-native-iap';
import { APPLE_IAP_BASIC_SKU, APPLE_IAP_PREMIUM_SKU } from '../constants/appleIap';
import { useAuth } from '../context/AuthContext';
import { prefetchMainTabData } from '../lib/prefetchMainTabData';
import { queryKeys } from '../lib/queryClient';
import { markPostPayPending } from '../lib/postPayNav';
import { signOutToLogin } from '../lib/signOutToLogin';
import {
    claimOtherAccountPrompt,
    connect as iapConnect,
    purchase as iapPurchase,
    purchaseCopy,
    reconcileOwnedSubscriptions,
} from '../lib/iapTransactions';

/**
 * The paywall's view of Apple IAP.
 *
 * All StoreKit plumbing — listeners, verification, dedupe, the already-owned
 * / duplicate-event recovery — lives in lib/iapTransactions.ts, which is
 * registered at app launch so no transaction can ever be delivered while
 * nobody is listening. This hook only (1) loads products, (2) starts a
 * purchase and maps its typed outcome to UI, and (3) runs Restore. Every
 * string a user can see here is app copy; library and HTTP text never
 * passes through.
 */

type Tier = 'basic' | 'premium';

// react-native-iap v14 exposes the StoreKit product identifier as `id`
// (ProductCommon.id); older shapes used `productId`. Match on EITHER —
// matching only `productId` made every check fail on v14.
const productSku = (p: unknown): string | undefined => {
    const o = p as { id?: string; productId?: string } | null | undefined;
    return o?.id ?? o?.productId;
};

export function useAppleSubscription() {
    const { user, refreshUser, logout } = useAuth();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState<Tier | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [connected, setConnected] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        let mounted = true;
        void iapConnect().then((ok) => { if (mounted) setConnected(ok); });
        return () => { mounted = false; };
    }, []);

    // Fetch products with retry — Apple sandbox occasionally returns an empty
    // list on the first request even when products are fully configured.
    const loadProducts = useCallback(
        async (attempt = 0): Promise<Product[]> => {
            const skus = [APPLE_IAP_BASIC_SKU, APPLE_IAP_PREMIUM_SKU];
            console.log(`[AppleIAP] Fetching products (attempt ${attempt + 1}):`, skus);
            try {
                let list = ((await fetchProductsRaw({ skus, type: 'subs' })) ?? []) as Product[];
                // Fallback: some react-native-iap v14 setups return [] for
                // type:'subs' on TestFlight even when the subscriptions are
                // approved. Re-query type:'all' and filter to our skus.
                if (list.length === 0) {
                    console.warn('[AppleIAP] subs fetch empty; retrying as type:all');
                    const all = ((await fetchProductsRaw({ skus, type: 'all' })) ?? []) as Product[];
                    list = all.filter((p) => skus.includes(productSku(p) ?? ''));
                }
                if (list.length > 0) {
                    console.log('[AppleIAP] Products loaded:', list.map((p) => productSku(p)));
                    setProducts(list);
                    return list;
                }
                if (attempt < 3) {
                    const delay = 1000 * Math.pow(2, attempt);
                    console.warn(`[AppleIAP] Empty product list, retrying in ${delay}ms`);
                    await new Promise((r) => setTimeout(r, delay));
                    return loadProducts(attempt + 1);
                }
                console.error('[AppleIAP] No subscription products found in App Store. Check App Store Connect product IDs and agreements.');
                setProducts([]);
                return [];
            } catch (err) {
                if (attempt < 3) {
                    const delay = 1000 * Math.pow(2, attempt);
                    console.warn(`[AppleIAP] fetchProducts threw, retrying in ${delay}ms:`, err);
                    await new Promise((r) => setTimeout(r, delay));
                    return loadProducts(attempt + 1);
                }
                console.error('[AppleIAP] Failed to load products:', (err as Error)?.message || err);
                return [];
            }
        },
        [],
    );

    useEffect(() => {
        if (Platform.OS !== 'ios' || !connected) return;
        void loadProducts();
    }, [connected, loadProducts]);

    /** The account now holds an entitlement: refresh + warm the paid app. */
    const onEntitled = useCallback(async (userInitiated: boolean) => {
        // Mark BEFORE refreshUser: refreshUser flips isPaid, which remounts the
        // navigator and runs App.tsx's post-pay effect — the flag must already
        // be set when that effect reads it. Only for a purchase the user just
        // made INSIDE the funnel (onboarding not finished): that reveal is the
        // payoff for paying. A lapsed subscriber restarting their plan, or an
        // onboarded user paying at an in-app gate, goes straight back to the
        // app — not to a "reveal" of a months-old scan.
        if (userInitiated && user?.onboarding?.completed !== true) markPostPayPending();
        // The entitlement is server-confirmed at this point. A refresh blip
        // must not turn into "purchase failed" for someone Apple just charged:
        // retry once, then let the paywall's isPaid exit / the launch sweep
        // converge on the next tick.
        try {
            await refreshUser();
        } catch (e) {
            console.warn('[AppleIAP] refreshUser after entitlement failed, retrying:', e);
            await new Promise((r) => setTimeout(r, 1500));
            try { await refreshUser(); } catch (e2) { console.warn('[AppleIAP] refreshUser retry failed:', e2); }
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.maxes });
        prefetchMainTabData(queryClient);
    }, [refreshUser, queryClient, user?.onboarding?.completed]);

    /** "Your Apple ID's subscription belongs to another Max account" — with
     *  the way out, not just the news. Sign in drops this session (the
     *  funnel stack has no Login route; App.tsx forwards after logout). */
    const showOtherAccount = useCallback((detail?: string) => {
        Alert.alert(
            purchaseCopy.otherAccountTitle,
            detail || purchaseCopy.otherAccount,
            [
                { text: 'Not now', style: 'cancel' },
                { text: 'Sign in', onPress: () => { void signOutToLogin(logout); } },
            ],
        );
    }, [logout]);

    const subscribeTier = useCallback(
        async (tier: Tier): Promise<boolean> => {
            if (Platform.OS !== 'ios') return false;
            if (!user?.id) {
                Alert.alert('Sign in', 'Log in to subscribe.');
                return false;
            }
            if (loading) {
                console.log('[AppleIAP] Purchase request ignored; one is already in flight.');
                return false;
            }
            if (!connected) {
                const ok = await iapConnect();
                if (!ok) {
                    // canMakePayments=false (Screen Time / MDM) lands here too —
                    // never blame the network for a device restriction.
                    Alert.alert('App Store unavailable', purchaseCopy.forCode('init-connection'));
                    return false;
                }
                setConnected(true);
            }

            const sku = tier === 'premium' ? APPLE_IAP_PREMIUM_SKU : APPLE_IAP_BASIC_SKU;

            // If the product is cached, fire immediately so StoreKit's sheet opens
            // with no perceptible delay. Otherwise do ONE bounded fetch and confirm
            // THIS sku exists before requesting: a purchase for a sku StoreKit
            // doesn't know silently does nothing — no sheet, no error — which
            // reads as a dead button.
            let productCached = products.some((p) => productSku(p) === sku);
            if (!productCached) {
                console.log('[AppleIAP] Cache miss at subscribe time; fetching before purchase:', sku);
                try {
                    const list = await loadProducts();
                    productCached = list.some((p) => productSku(p) === sku);
                } catch (err) {
                    console.warn('[AppleIAP] product fetch before purchase failed:', err);
                }
                if (!productCached) {
                    console.error('[AppleIAP] Product not available from StoreKit, aborting purchase:', sku);
                    Alert.alert('Plan not available yet', purchaseCopy.forCode('item-unavailable'));
                    return false;
                }
            }

            setLoading(tier);
            console.log('[AppleIAP] Requesting purchase:', sku);
            try {
                const result = await iapPurchase(sku, user.id);
                console.log('[AppleIAP] Purchase outcome:', result.kind);
                switch (result.kind) {
                    case 'purchased':
                        await onEntitled(true);
                        return true;
                    case 'cancelled':
                        // The user backed out of Apple's sheet: NOT a purchase, not
                        // an error. Stay on the paywall quietly.
                        return false;
                    case 'pending':
                        Alert.alert(purchaseCopy.pendingTitle, purchaseCopy.pending);
                        return false;
                    case 'other_account':
                        showOtherAccount(result.detail);
                        return false;
                    case 'not_purchased':
                    default: {
                        if (result.kind === 'not_purchased' && result.code === 'unreachable') {
                            // The verify call failed client-side but the backend may
                            // have finished (it tries Apple's production host, then
                            // sandbox — legitimately up to ~60s). A charged user must
                            // NEVER see an error: re-check the account first.
                            try {
                                const fresh = await refreshUser();
                                if (fresh?.is_paid) {
                                    console.log('[AppleIAP] Verify unreachable but entitlement is active — treating as purchased.');
                                    await onEntitled(true);
                                    return true;
                                }
                            } catch (e) {
                                console.warn('[AppleIAP] refreshUser after unreachable verify failed:', e);
                            }
                        }
                        Alert.alert('Purchase not completed', result.kind === 'not_purchased' ? result.message : purchaseCopy.forCode('unknown'));
                        return false;
                    }
                }
            } finally {
                setLoading(null);
            }
        },
        [user?.id, loading, connected, products, loadProducts, onEntitled, showOtherAccount, refreshUser],
    );

    const subscribeBasic = useCallback(() => subscribeTier('basic'), [subscribeTier]);
    const subscribePremium = useCallback(() => subscribeTier('premium'), [subscribeTier]);

    // User-initiated "Restore Purchases" (App Review Guideline 3.1.1): read the
    // Apple ID's current entitlements, re-verify each with the backend, and
    // tell the user exactly which of the four things happened.
    const restorePurchases = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== 'ios') return false;
        if (restoring) return false;
        if (!user?.id) {
            Alert.alert('Sign in', 'Log in to restore purchases.');
            return false;
        }
        setRestoring(true);
        try {
            const ok = await iapConnect();
            if (!ok) {
                Alert.alert('App Store unavailable', purchaseCopy.forCode('init-connection'));
                return false;
            }
            const o = await reconcileOwnedSubscriptions({ force: true });
            console.log('[AppleIAP] restore outcome:', JSON.stringify(o));
            if (o.granted) {
                await onEntitled(false);
                Alert.alert('Purchases restored', 'Your subscription is active on this account.');
                return true;
            }
            // Keep the screen honest even when nothing was granted.
            try { await refreshUser(); } catch { /* non-fatal */ }
            if (o.otherAccount) {
                showOtherAccount(o.detail);
            } else if (o.rejected) {
                Alert.alert('Subscription found', o.detail || purchaseCopy.rejected);
            } else if (o.transient) {
                Alert.alert('Try again in a moment', "Max couldn't be reached to check your subscription. Your purchase is safe — please try again shortly.");
            } else if (o.checked === 0) {
                Alert.alert(
                    'Nothing to restore',
                    'No active Max subscription was found for the Apple ID signed in to the App Store on this device. If that seems wrong, check Settings › Apple ID › Subscriptions.',
                );
            } else {
                Alert.alert(
                    'No active subscription',
                    "This Apple ID's Max subscription has ended. Subscribe again to pick up where you left off.",
                );
            }
            return false;
        } catch (e) {
            console.error('[AppleIAP] restorePurchases failed:', e);
            Alert.alert('Restore failed', purchaseCopy.forCode('unknown'));
            return false;
        } finally {
            setRestoring(false);
        }
    }, [restoring, user?.id, onEntitled, refreshUser, showOtherAccount]);

    /** Silent, server-verified check used by the paywall on mount: if the
     *  Apple ID already owns an active subscription this account can adopt,
     *  activate it now instead of asking the user to buy it again. */
    const reconcileSilently = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== 'ios' || !user?.id) return false;
        const o = await reconcileOwnedSubscriptions({ force: true });
        if (o.granted) {
            await onEntitled(false);
            return true;
        }
        // Once per account per session, shared with App.tsx's launch sweep —
        // both consume the same in-flight reconcile and would otherwise stack
        // two identical alerts.
        if (o.otherAccount && claimOtherAccountPrompt()) showOtherAccount(o.detail);
        return false;
    }, [user?.id, onEntitled, showOtherAccount]);

    return {
        loading,
        restoring,
        subscribeBasic,
        subscribePremium,
        subscribeTier,
        restorePurchases,
        reconcileSilently,
        storeConnected: connected,
        products,
    };
}
