/**
 * Per-creator IAP purchase (production path).
 *
 * Each creator has its OWN auto-renewable SKU in its own subscription group
 * (Apple subs within a group are mutually exclusive, and a user must be able to
 * hold several creator subs). This buys one such SKU and returns the Apple
 * transaction id for the backend to verify.
 *
 * iOS-only, react-native-iap v14: uses the STANDALONE fetch/requestPurchase
 * (the useIAP() versions return void), product id is `p.id`, and the purchase
 * carries `appAccountToken = user.id` so the backend resolves the account.
 * In dev builds the caller uses the dev-activate endpoint instead of this.
 */
import { Platform } from 'react-native';

export async function subscribeToCreatorProduct(productId: string, appAccountToken: string): Promise<string> {
    if (Platform.OS !== 'ios') {
        throw new Error('Creator subscriptions are only available on iOS right now.');
    }
    const iap: any = await import('react-native-iap');

    // Ensure the product is loaded so the sheet has price/terms.
    try {
        await iap.fetchProducts({ skus: [productId], type: 'subs' });
    } catch {
        /* the request below still surfaces a real error if the SKU is bad */
    }

    const result: any = await iap.requestPurchase({
        type: 'subs',
        request: { apple: { sku: productId, appAccountToken } },
    });
    const purchase = Array.isArray(result) ? result[0] : result;
    const tid: string | undefined = purchase?.transactionId || purchase?.id;
    if (!tid) throw new Error('Purchase did not return a transaction id.');
    try { await iap.finishTransaction({ purchase }); } catch { /* non-fatal */ }
    return tid;
}
