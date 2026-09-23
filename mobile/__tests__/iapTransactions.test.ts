/**
 * StoreKit transaction service invariants — the REVENUE path.
 *
 * Drives lib/iapTransactions.ts with fakes for react-native-iap and the API
 * client. Every case here is a failure mode seen (or one step away) in
 * production: the lost-emission "Duplicate purchase update skipped" alert,
 * a purchase settled by a stray replay, a charged user shown an error, a
 * library string reaching the screen, a creator transaction hijacked by the
 * base-subscription verifier.
 */
import assert from 'assert';
import {
    __setIapDepsForTests,
    classifyVerify,
    connect,
    ensureListeners,
    isPurchaseArmed,
    purchase,
    purchaseCopy,
    reconcileOwnedSubscriptions,
    setIapUser,
    subscribeEntitlementGranted,
    verifyTransaction,
    type PurchaseLike,
    type PurchaseErrorLike,
} from '../lib/iapTransactions';

const SKU = 'com.cannon.mobile.subscribe.premium.weekly';
const CREATOR_SKU = 'com.cannon.creator.abc.monthly';

type Fake = {
    log: string[];
    updated: ((p: PurchaseLike) => void)[];
    errored: ((e: PurchaseErrorLike) => void)[];
    available: PurchaseLike[];
    verify: (tid: string, productId?: string) => Promise<{ status?: string; tier?: string } | undefined>;
    verifyCalls: string[];
    finished: string[];
    onRequest?: () => void;
    emit(p: PurchaseLike): void;
    emitError(e: PurchaseErrorLike): void;
};

function httpError(status: number, detail?: string) {
    return { response: { status, data: detail ? { detail } : {} }, message: `Request failed with status code ${status}` };
}

function setup(opts?: { verify?: Fake['verify']; available?: PurchaseLike[]; now?: () => number }): Fake {
    const fake: Fake = {
        log: [],
        updated: [],
        errored: [],
        available: opts?.available ?? [],
        verify: opts?.verify ?? (async () => ({ status: 'ok', tier: 'premium' })),
        verifyCalls: [],
        finished: [],
        emit(p) { fake.updated.forEach((cb) => cb(p)); },
        emitError(e) { fake.errored.forEach((cb) => cb(e)); },
    };
    let t = 1_000_000;
    __setIapDepsForTests({
        isIos: true,
        now: opts?.now ?? (() => t),
        managedSkus: [SKU, 'com.cannon.mobile.subscribe.basic.weekly'],
        iap: {
            initConnection: async () => { fake.log.push('initConnection'); return true; },
            getAvailablePurchases: async () => { fake.log.push('getAvailablePurchases'); return fake.available; },
            finishTransaction: async ({ purchase: p }) => { fake.finished.push(String(p.id ?? p.transactionId)); },
            purchaseUpdatedListener: (cb) => { fake.log.push('purchaseUpdatedListener'); fake.updated.push(cb); return { remove: () => undefined }; },
            purchaseErrorListener: (cb) => { fake.log.push('purchaseErrorListener'); fake.errored.push(cb); return { remove: () => undefined }; },
            requestPurchase: async () => { fake.log.push('requestPurchase'); fake.onRequest?.(); },
        },
        api: {
            verifyAppleIapTransaction: async (tid, productId) => {
                fake.verifyCalls.push(`${tid}:${productId ?? ''}`);
                return fake.verify(tid, productId);
            },
        },
    });
    // Advance the fake clock a little on every call so throttles can be tested.
    (fake as unknown as { tick: () => void }).tick = () => { t += 1000; };
    setIapUser('user-a');
    return fake;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };

export const tests: Record<string, () => void | Promise<void>> = {
    'listeners are registered BEFORE the first initConnection (no lost emissions)': async () => {
        const f = setup();
        await connect();
        assert.deepStrictEqual(f.log, ['purchaseUpdatedListener', 'purchaseErrorListener', 'initConnection']);
        // idempotent
        await connect();
        ensureListeners();
        assert.strictEqual(f.log.filter((x) => x === 'purchaseUpdatedListener').length, 1);
        assert.strictEqual(f.log.filter((x) => x === 'initConnection').length, 1);
    },

    'a transaction delivered while nothing is armed is verified once, finished, and announced (armed=false)': async () => {
        const f = setup();
        const seen: { kind: string; armed: boolean }[] = [];
        const off = subscribeEntitlementGranted((r, ctx) => seen.push({ kind: r.kind, armed: ctx.armed }));
        await connect();
        f.emit({ id: 't1', productId: SKU });
        await settle();
        assert.deepStrictEqual(f.verifyCalls, [`t1:${SKU}`]);
        assert.deepStrictEqual(f.finished, ['t1']);
        assert.deepStrictEqual(seen, [{ kind: 'granted', armed: false }]);
        off();
    },

    'concurrent verifies of the same transaction share ONE server call': async () => {
        const f = setup();
        const p = { id: 't2', productId: SKU };
        const [a, b] = await Promise.all([verifyTransaction(p), verifyTransaction(p)]);
        assert.strictEqual(a.kind, 'granted');
        assert.strictEqual(b.kind, 'granted');
        assert.strictEqual(f.verifyCalls.length, 1);
        // and the memo holds for the session
        await verifyTransaction(p);
        assert.strictEqual(f.verifyCalls.length, 1);
    },

    'the verify memo is scoped to the signed-in account': async () => {
        const f = setup({ verify: async () => { throw httpError(400, 'This subscription belongs to a different Max account. Sign in with the account you originally subscribed on to keep using it.'); } });
        const p = { id: 't3', productId: SKU };
        const r1 = await verifyTransaction(p);
        assert.strictEqual(r1.kind, 'other_account');
        assert.ok(r1.detail && /different Max account/.test(r1.detail));
        f.verify = async () => ({ status: 'ok', tier: 'premium' });
        setIapUser('user-b');
        const r2 = await verifyTransaction(p);
        assert.strictEqual(r2.kind, 'granted');
        assert.strictEqual(f.verifyCalls.length, 2);
    },

    'an unreachable verify is neither cached nor finished (retryable)': async () => {
        const f = setup({ verify: async () => { throw httpError(503); } });
        const p = { id: 't4', productId: SKU };
        const r1 = await verifyTransaction(p);
        assert.strictEqual(r1.kind, 'unreachable');
        assert.deepStrictEqual(f.finished, []);
        f.verify = async () => ({ status: 'ok' });
        const r2 = await verifyTransaction(p);
        assert.strictEqual(r2.kind, 'granted');
        assert.strictEqual(f.verifyCalls.length, 2);
        assert.deepStrictEqual(f.finished, ['t4']);
    },

    'classifyVerify maps every server answer to exactly one outcome': () => {
        assert.strictEqual(classifyVerify('t', SKU, { status: 'ok' }, null).kind, 'granted');
        assert.strictEqual(classifyVerify('t', SKU, { status: 'expired' }, null).kind, 'expired');
        assert.strictEqual(classifyVerify('t', SKU, { status: 'weird' }, null).kind, 'unreachable');
        assert.strictEqual(classifyVerify('t', SKU, undefined, httpError(400, 'account_token_mismatch')).kind, 'other_account');
        assert.strictEqual(classifyVerify('t', SKU, undefined, httpError(400, "That purchase isn't recognized.")).kind, 'rejected');
        assert.strictEqual(classifyVerify('t', SKU, undefined, httpError(401)).kind, 'unreachable');
        assert.strictEqual(classifyVerify('t', SKU, undefined, httpError(429)).kind, 'unreachable');
        assert.strictEqual(classifyVerify('t', SKU, undefined, httpError(500)).kind, 'unreachable');
        assert.strictEqual(classifyVerify('t', SKU, undefined, { message: 'Network Error' }).kind, 'unreachable');
    },

    'purchase(): a verified transaction for the armed sku resolves purchased': async () => {
        const f = setup();
        f.onRequest = () => { setTimeout(() => f.emit({ id: 't5', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'purchased');
        assert.strictEqual(isPurchaseArmed(), false);
        assert.deepStrictEqual(f.finished, ['t5']);
    },

    'purchase(): a replayed transaction for ANOTHER product never settles the armed purchase': async () => {
        const f = setup();
        f.onRequest = () => {
            setTimeout(() => f.emit({ id: 'old', productId: 'com.cannon.mobile.subscribe.basic.weekly' }), 0);
            setTimeout(() => f.emitError({ code: 'user-cancelled', message: 'cancelled', productId: SKU }), 5);
        };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'cancelled');
        // the stray replay was still verified + finished on its own
        assert.ok(f.finished.includes('old'));
    },

    'purchase(): user-cancelled resolves cancelled, silently': async () => {
        const f = setup();
        f.onRequest = () => { setTimeout(() => f.emitError({ code: 'user-cancelled', message: 'The user cancelled', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'cancelled');
    },

    "purchase(): react-native-iap's duplicate-purchase error → reconcile → purchased when the Apple ID owns it": async () => {
        const f = setup({ available: [{ id: 'existing', productId: SKU }] });
        f.onRequest = () => {
            setTimeout(() => f.emitError({
                code: 'duplicate-purchase',
                message: `Duplicate purchase update skipped for ${SKU}. Use restorePurchases or getAvailablePurchases to recover.`,
                productId: SKU,
            }), 0);
        };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'purchased');
        assert.deepStrictEqual(f.verifyCalls, [`existing:${SKU}`]);
        assert.ok(f.log.includes('getAvailablePurchases'));
    },

    'purchase(): duplicate-purchase held by another Max account → other_account with the server copy': async () => {
        const f = setup({
            available: [{ id: 'existing', productId: SKU }],
            verify: async () => { throw httpError(400, 'This subscription belongs to a different Max account. Sign in with the account you originally subscribed on to keep using it.'); },
        });
        f.onRequest = () => { setTimeout(() => f.emitError({ code: 'duplicate-purchase', message: 'Duplicate purchase update skipped', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'other_account');
        assert.ok(r.kind === 'other_account' && /different Max account/.test(r.detail || ''));
    },

    'purchase(): duplicate-purchase with nothing active on the Apple ID → owned copy, never the library string': async () => {
        const f = setup({ available: [] });
        f.onRequest = () => { setTimeout(() => f.emitError({ code: 'duplicate-purchase', message: 'Duplicate purchase update skipped for x. Use restorePurchases or getAvailablePurchases to recover.', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'not_purchased');
        assert.ok(r.kind === 'not_purchased' && r.code === 'no-active-entitlement');
        assert.ok(r.kind === 'not_purchased' && !/Duplicate purchase update|getAvailablePurchases/i.test(r.message));
        assert.strictEqual(r.kind === 'not_purchased' ? r.message : '', purchaseCopy.noActiveEntitlement);
    },

    'purchase(): already-owned (auto-renew ON) takes the same reconcile path': async () => {
        const f = setup({ available: [{ id: 'existing', productId: SKU }] });
        f.onRequest = () => { setTimeout(() => f.emitError({ code: 'already-owned', message: 'Subscription already owned', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'purchased');
    },

    'purchase(): every other StoreKit error maps to app copy (no library text)': async () => {
        const f = setup();
        f.onRequest = () => { setTimeout(() => f.emitError({ code: 'network-error', message: 'NSURLErrorDomain -1009 The Internet connection appears to be offline.', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'not_purchased');
        assert.ok(r.kind === 'not_purchased' && !/NSURLErrorDomain/.test(r.message));
        assert.ok(r.kind === 'not_purchased' && /App Store/.test(r.message));
    },

    'purchase(): an expired transaction handed back instead of a sale is NOT a purchase': async () => {
        const f = setup({ verify: async () => ({ status: 'expired' }) });
        f.onRequest = () => { setTimeout(() => f.emit({ id: 'stale', productId: SKU }), 0); };
        const r = await purchase(SKU, 'user-a');
        assert.strictEqual(r.kind, 'not_purchased');
        assert.ok(r.kind === 'not_purchased' && r.code === 'stale-transaction');
        assert.deepStrictEqual(f.finished, ['stale']);
    },

    'purchase(): a second purchase while one is armed is refused without touching StoreKit': async () => {
        const f = setup();
        const holder: { resolveFirst?: () => void } = {};
        f.onRequest = () => { holder.resolveFirst = () => f.emitError({ code: 'user-cancelled', message: 'x', productId: SKU }); };
        const first = purchase(SKU, 'user-a');
        await settle();
        const second = await purchase(SKU, 'user-a');
        assert.strictEqual(second.kind, 'not_purchased');
        assert.ok(second.kind === 'not_purchased' && second.code === 'in-flight');
        assert.strictEqual(f.log.filter((x) => x === 'requestPurchase').length, 1);
        holder.resolveFirst?.();
        assert.strictEqual((await first).kind, 'cancelled');
    },

    'reconcile: throttled unless forced; a new account resets the throttle': async () => {
        const f = setup({ available: [] });
        const a = await reconcileOwnedSubscriptions();
        assert.strictEqual(a.checked, 0);
        const before = f.log.filter((x) => x === 'getAvailablePurchases').length;
        await reconcileOwnedSubscriptions();
        assert.strictEqual(f.log.filter((x) => x === 'getAvailablePurchases').length, before, 'second sweep within the interval must not hit StoreKit');
        await reconcileOwnedSubscriptions({ force: true });
        assert.strictEqual(f.log.filter((x) => x === 'getAvailablePurchases').length, before + 1);
        setIapUser('user-c');
        await reconcileOwnedSubscriptions();
        assert.strictEqual(f.log.filter((x) => x === 'getAvailablePurchases').length, before + 2);
    },

    'reconcile: reports granted / otherAccount / expiredOnly / transient faithfully': async () => {
        const f = setup({ available: [{ id: 'x1', productId: SKU }] });
        f.verify = async () => ({ status: 'ok', tier: 'premium' });
        let o = await reconcileOwnedSubscriptions({ force: true });
        assert.deepStrictEqual([o.granted, o.otherAccount, o.expiredOnly, o.transient, o.checked], [true, false, false, false, 1]);

        setIapUser('u2');
        f.verify = async () => { throw httpError(400, 'account_token_mismatch'); };
        o = await reconcileOwnedSubscriptions({ force: true });
        assert.deepStrictEqual([o.granted, o.otherAccount, o.expiredOnly, o.transient], [false, true, false, false]);

        setIapUser('u3');
        f.verify = async () => ({ status: 'expired' });
        o = await reconcileOwnedSubscriptions({ force: true });
        assert.deepStrictEqual([o.granted, o.otherAccount, o.expiredOnly, o.transient], [false, false, true, false]);

        setIapUser('u4');
        f.verify = async () => { throw httpError(503); };
        o = await reconcileOwnedSubscriptions({ force: true });
        assert.deepStrictEqual([o.granted, o.otherAccount, o.expiredOnly, o.transient], [false, false, false, true]);
    },

    'creator-product transactions are left to their own hook (never verified here)': async () => {
        const f = setup({ available: [{ id: 'c1', productId: CREATOR_SKU }] });
        await connect();
        f.emit({ id: 'c2', productId: CREATOR_SKU });
        await settle();
        const o = await reconcileOwnedSubscriptions({ force: true });
        assert.deepStrictEqual(f.verifyCalls, []);
        assert.deepStrictEqual(f.finished, []);
        assert.strictEqual(o.granted, false);
    },

    'purchaseCopy never leaks a code: unknown codes get the generic line': () => {
        assert.ok(/didn't go through/.test(purchaseCopy.forCode('some-new-code')));
        assert.ok(/App Store/.test(purchaseCopy.forCode('service-error')));
        assert.ok(/restrict/.test(purchaseCopy.forCode('iap-not-available')));
    },
};
