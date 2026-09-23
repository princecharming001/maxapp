/**
 * App-level StoreKit transaction service (iOS).
 *
 * One place owns every Apple transaction the app ever sees — launch replays,
 * background renewals, restores, and the purchase the user just made — and
 * turns each into a single server verify with ONE of five outcomes. Everything
 * above (the paywall hook, the launch reconciler, App.tsx) consumes those
 * outcomes; nothing else talks to `react-native-iap` listeners or
 * `/payments/apple/verify` directly.
 *
 * Why this exists (observed on the owner's device, build 341):
 *
 *  1. react-native-iap attaches its NATIVE purchase listener the first time
 *     any JS code registers one. Before that, every transaction OpenIAP emits
 *     (Transaction.updates at launch, unfinished replays) is recorded in the
 *     native dedupe set and then DROPPED — nobody in JS ever hears about it.
 *     The launch reconciler used to open the StoreKit connection with no
 *     listener registered, so a cancelled-but-active subscription's
 *     transaction was swallowed at boot. When the user then tapped Subscribe,
 *     OpenIAP "allowed the repurchase" and StoreKit returned the SAME
 *     transaction; the dedupe fired and the paywall showed the library's
 *     "Duplicate purchase update skipped…" string as a purchase error.
 *     → `ensureListeners()` registers the JS listeners BEFORE any
 *       `initConnection()`, so no emission can ever be lost.
 *
 *  2. Verification was duplicated across three code paths with three different
 *     dedupe rules. → `verifyTransaction()` memoises per (user, transaction)
 *     so concurrent callers share one request and one result.
 *
 *  3. Library / HTTP strings reached the user. → outcomes are typed; copy
 *     lives in `purchaseCopy` and is the only thing a screen ever shows.
 *
 * Testable without StoreKit: deps are lazily required and injectable
 * (`__setIapDepsForTests`). `__tests__/iapTransactions.test.ts` drives the
 * whole state machine with fakes.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type PurchaseLike = {
    id?: string;
    transactionId?: string;
    productId?: string;
    [k: string]: unknown;
};

export type PurchaseErrorLike = {
    code?: string;
    message?: string;
    productId?: string | null;
};

/** What the server said about one transaction. */
export type VerifyKind =
    | 'granted'        // active entitlement now on THIS account
    | 'expired'        // Apple says the transaction's period is over
    | 'other_account'  // held by a different, claimed Max account
    | 'rejected'       // server refused for another reason (unknown product…)
    | 'unreachable';   // network / 5xx / timeout — nothing decided

export type VerifyResult = {
    kind: VerifyKind;
    tid: string;
    productId?: string;
    tier?: string;
    /** Human copy from the server when it gave one (already user-safe). */
    detail?: string;
};

/** The result of a user-initiated purchase, as the paywall sees it. */
export type PurchaseResult =
    | { kind: 'purchased'; tier?: string }
    | { kind: 'cancelled' }
    | { kind: 'other_account'; detail?: string }
    | { kind: 'pending' }                     // Ask to Buy / deferred
    | { kind: 'not_purchased'; code: string; message: string };

export type ReconcileOutcome = {
    /** An active entitlement was granted to the signed-in account. */
    granted: boolean;
    /** The Apple ID's active subscription is held by another Max account. */
    otherAccount: boolean;
    /** Only expired transactions were found. */
    expiredOnly: boolean;
    /** At least one verify could not reach the server. */
    transient: boolean;
    /** The server refused an ACTIVE transaction for a reason other than
     *  ownership (unknown product, Stripe conflict…): the user may well have
     *  been charged — never tell them "nothing was charged". */
    rejected: boolean;
    /** How many transactions StoreKit reported. */
    checked: number;
    tier?: string;
    detail?: string;
};

type IapDeps = {
    initConnection: () => Promise<boolean>;
    getAvailablePurchases: (opts?: { onlyIncludeActiveItemsIOS?: boolean; alsoPublishToEventListenerIOS?: boolean }) => Promise<PurchaseLike[] | undefined | null>;
    finishTransaction: (args: { purchase: PurchaseLike }) => Promise<unknown>;
    purchaseUpdatedListener: (cb: (p: PurchaseLike) => void) => { remove: () => void };
    purchaseErrorListener: (cb: (e: PurchaseErrorLike) => void) => { remove: () => void };
    requestPurchase: (args: unknown) => Promise<unknown>;
};

type ApiDeps = {
    verifyAppleIapTransaction: (tid: string, productId?: string) => Promise<{ status?: string; tier?: string } | undefined>;
};

type Deps = {
    iap: IapDeps;
    api: ApiDeps;
    isIos: boolean;
    now: () => number;
    /** The base-subscription SKUs this service owns. Anything else (creator
     *  subscriptions) has its own hook and its own verify endpoint. */
    managedSkus: string[];
    /** Emission coalescing window (ms). Tests pass 0. */
    emissionWindowMs: number;
};

// ── Deps (lazy; injectable for tests) ───────────────────────────────────────

let depsOverride: Partial<Deps> | null = null;

function loadDeps(): Deps {
    if (depsOverride && depsOverride.iap && depsOverride.api) {
        return {
            iap: depsOverride.iap,
            api: depsOverride.api,
            isIos: depsOverride.isIos ?? true,
            now: depsOverride.now ?? (() => Date.now()),
            managedSkus: depsOverride.managedSkus ?? [],
            emissionWindowMs: depsOverride.emissionWindowMs ?? 0,
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const iap = require('react-native-iap');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../services/api').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const skus = require('../constants/appleIap').APPLE_IAP_PRODUCT_IDS as readonly string[];
    return { iap, api, isIos: rn.Platform.OS === 'ios', now: () => Date.now(), managedSkus: [...skus], emissionWindowMs: EMISSION_WINDOW_MS };
}

/** Is this a base Max subscription (vs. a creator product owned elsewhere)?
 *  A transaction with no product id is treated as ours — StoreKit always
 *  sets it, so the only way to see none is a shape we don't recognise, and
 *  ignoring it would lose a real purchase. */
function isManagedSku(productId: string | undefined): boolean {
    if (!productId) return true;
    const { managedSkus } = loadDeps();
    if (managedSkus.length === 0) return true;
    return managedSkus.includes(productId);
}

/** Test seam. Resets all module state. */
export function __setIapDepsForTests(d: Partial<Deps> | null): void {
    depsOverride = d;
    __resetIapStateForTests();
}

export function __resetIapStateForTests(): void {
    listenersRegistered = false;
    connectPromise = null;
    currentUserId = null;
    results.clear();
    inflight.clear();
    armed = null;
    grantedSubs.clear();
    retryTimers.forEach((t) => clearTimeout(t));
    retryTimers.clear();
    lastReconcileAt = 0;
    reconcileInFlight = null;
    otherAccountPrompted.clear();
    emissionQueue.length = 0;
    if (emissionTimer) { clearTimeout(emissionTimer); emissionTimer = null; }
    newestGranted.clear();
}

// ── Module state ────────────────────────────────────────────────────────────

let listenersRegistered = false;
let connectPromise: Promise<boolean> | null = null;
let currentUserId: string | null = null;

/** Terminal verify outcomes for this session, keyed `${uid}:${tid}`. */
const results = new Map<string, VerifyResult>();
/** Verifies in flight, keyed the same way — concurrent callers share one. */
const inflight = new Map<string, Promise<VerifyResult>>();
/** Retry timers for transactions whose verify was unreachable. */
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** The purchase the paywall is currently waiting on (at most one). */
let armed: {
    sku: string;
    resolve: (r: PurchaseResult) => void;
    timer: ReturnType<typeof setTimeout>;
} | null = null;

type GrantedListener = (r: VerifyResult, ctx: { armed: boolean }) => void;
const grantedSubs = new Set<GrantedListener>();

let lastReconcileAt = 0;
let reconcileInFlight: Promise<ReconcileOutcome> | null = null;
/** Accounts already shown the "plan lives on another account" prompt this
 *  session — the launch sweep and the paywall's mount reconcile share one
 *  result and must not stack two identical alerts. */
const otherAccountPrompted = new Set<string>();

/** True the FIRST time per account per session; false afterwards. */
export function claimOtherAccountPrompt(): boolean {
    const uid = currentUserId ?? 'anon';
    if (otherAccountPrompted.has(uid)) return false;
    otherAccountPrompted.add(uid);
    return true;
}

// Backstop only: StoreKit reports cancel/failure through the error listener
// within seconds; this exists so a callback that never arrives can't leave the
// paywall's await hanging forever. Long enough to never fire during a real
// purchase (password prompts, 2FA, Ask-to-Buy can be slow).
const PURCHASE_TIMEOUT_MS = 5 * 60_000;
// Don't hammer StoreKit/backend from the foreground sweep.
const RECONCILE_MIN_INTERVAL_MS = 4 * 60 * 1000;
// Unreachable verifies are retried on a short back-off; the transaction stays
// unfinished in StoreKit as well, so the next launch replays it regardless.
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];

// ── Helpers ─────────────────────────────────────────────────────────────────

export const tidOf = (p: PurchaseLike): string => String(p.transactionId ?? p.id ?? '').trim();

const memoKey = (tid: string) => `${currentUserId ?? 'anon'}:${tid}`;

/** The signed-in account. Verifies are memoised per user, so switching
 *  accounts naturally re-verifies everything (the same transaction can be
 *  `other_account` for one user and `granted` for the next). */
export function setIapUser(userId: string | null): void {
    const next = userId ? String(userId) : null;
    if (next === currentUserId) return;
    currentUserId = next;
    lastReconcileAt = 0; // a new account deserves an immediate sweep
}

export function getIapUser(): string | null {
    return currentUserId;
}

/** True while a user-initiated purchase is awaiting its outcome. */
export function isPurchaseArmed(sku?: string): boolean {
    return !!armed && (sku === undefined || armed.sku === sku);
}

/** Fires for every transaction the server grants to the current account.
 *  `ctx.armed` is true when the grant belongs to the purchase the paywall is
 *  awaiting — the paywall then owns the refresh + post-pay routing, so
 *  subscribers should stay out of the way. */
export function subscribeEntitlementGranted(cb: GrantedListener): () => void {
    grantedSubs.add(cb);
    return () => { grantedSubs.delete(cb); };
}

function emitGranted(r: VerifyResult, armedMatch: boolean): void {
    grantedSubs.forEach((cb) => {
        try { cb(r, { armed: armedMatch }); } catch { /* listener bug must not break IAP */ }
    });
}

/** Map the server's answer (or failure) to a typed outcome. Exported for tests. */
export function classifyVerify(
    tid: string,
    productId: string | undefined,
    res: { status?: string; tier?: string } | undefined,
    err: unknown,
): VerifyResult {
    if (!err) {
        if (res?.status === 'ok') return { kind: 'granted', tid, productId, tier: res.tier };
        if (res?.status === 'expired') return { kind: 'expired', tid, productId, tier: res.tier };
        // Any other 2xx shape is a server we don't understand — treat as
        // undecided rather than granting or refusing on a guess.
        return { kind: 'unreachable', tid, productId };
    }
    const e = err as { response?: { status?: number; data?: { detail?: unknown } }; code?: string; message?: string };
    const status = e?.response?.status;
    const d = e?.response?.data?.detail;
    const detail =
        typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x?.msg).filter(Boolean).join('\n')
              : undefined;
    if (status && status >= 400 && status < 500) {
        if (status === 401 || status === 403 || status === 408 || status === 429) {
            return { kind: 'unreachable', tid, productId, detail };
        }
        if (/different max account|another max account|account_token_mismatch/i.test(detail || '')) {
            return { kind: 'other_account', tid, productId, detail };
        }
        return { kind: 'rejected', tid, productId, detail };
    }
    return { kind: 'unreachable', tid, productId, detail };
}

// ── Connection + listeners ──────────────────────────────────────────────────

/** Register the JS purchase listeners exactly once — and BEFORE the first
 *  `initConnection()`, so a transaction OpenIAP emits at connect time
 *  (launch replay, background renewal) is never recorded-and-dropped. */
export function ensureListeners(): void {
    if (listenersRegistered) return;
    const { iap, isIos } = loadDeps();
    if (!isIos) return;
    listenersRegistered = true;
    try {
        iap.purchaseUpdatedListener((p) => { void onPurchaseUpdated(p); });
        iap.purchaseErrorListener((e) => { onPurchaseError(e); });
    } catch (e) {
        // Nitro not ready is benign (listeners become live at initConnection);
        // anything else must not take the paywall down with it.
        console.warn('[IAP] listener registration:', e);
    }
}

/** Open (or reuse) the StoreKit connection. Idempotent; never throws. */
export function connect(): Promise<boolean> {
    const { iap, isIos } = loadDeps();
    if (!isIos) return Promise.resolve(false);
    ensureListeners();
    if (!connectPromise) {
        connectPromise = iap.initConnection()
            .then((ok) => {
                // `false` = AppStore.canMakePayments is off (Screen Time / MDM).
                // Never cache it: the user can lift the restriction and come
                // back, and the next Subscribe/Restore must re-ask StoreKit.
                if (ok === false) connectPromise = null;
                return ok !== false;
            })
            .catch((e) => {
                console.warn('[IAP] initConnection failed:', e);
                connectPromise = null; // allow a later retry
                return false;
            });
    }
    return connectPromise;
}

// ── Verification ────────────────────────────────────────────────────────────

/**
 * Verify one StoreKit transaction with the server, exactly once per
 * (account, transaction) for terminal outcomes. Finishes the transaction when
 * the server has decided (granted / expired / other_account / rejected) so
 * StoreKit stops replaying it; leaves it unfinished when the server was
 * unreachable, so the next launch replays it and we try again.
 */
export function verifyTransaction(purchase: PurchaseLike, opts?: { armedMatch?: boolean }): Promise<VerifyResult> {
    const { iap, api } = loadDeps();
    const tid = tidOf(purchase);
    const productId = purchase.productId || undefined;
    if (!tid) {
        console.error('[IAP] transaction without id:', JSON.stringify(purchase));
        void finishQuietly(iap, purchase);
        return Promise.resolve({ kind: 'rejected', tid: '', productId, detail: 'missing transaction id' });
    }
    const key = memoKey(tid);
    const cached = results.get(key);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(key);
    if (running) return running;

    const task = (async (): Promise<VerifyResult> => {
        let res: { status?: string; tier?: string } | undefined;
        let err: unknown = null;
        try {
            res = await api.verifyAppleIapTransaction(tid, productId);
        } catch (e) {
            err = e;
        }
        const r = classifyVerify(tid, productId, res, err);
        console.log('[IAP] verify', tid, productId, '→', r.kind, r.detail ?? '');
        if (r.kind !== 'unreachable') {
            results.set(key, r);
            await finishQuietly(iap, purchase);
            const t = retryTimers.get(key);
            if (t) { clearTimeout(t); retryTimers.delete(key); }
        }
        if (r.kind === 'granted') emitGranted(r, !!opts?.armedMatch);
        return r;
    })().finally(() => { inflight.delete(key); });

    inflight.set(key, task);
    return task;
}

async function finishQuietly(iap: IapDeps, purchase: PurchaseLike): Promise<void> {
    try { await iap.finishTransaction({ purchase }); } catch (e) {
        console.warn('[IAP] finishTransaction (non-fatal):', e);
    }
}

/** Retry an unreachable verify on a short back-off (per transaction). */
function scheduleRetry(purchase: PurchaseLike, attempt: number): void {
    const tid = tidOf(purchase);
    const key = memoKey(tid);
    if (!tid || results.has(key) || attempt >= RETRY_DELAYS_MS.length) return;
    if (retryTimers.has(key)) return;
    const timer = setTimeout(() => {
        retryTimers.delete(key);
        void verifyTransaction(purchase).then((r) => {
            if (r.kind === 'unreachable') scheduleRetry(purchase, attempt + 1);
        });
    }, RETRY_DELAYS_MS[attempt]);
    retryTimers.set(key, timer);
}

// ── Listeners ───────────────────────────────────────────────────────────────

// ── Emission coalescing ─────────────────────────────────────────────────────
// StoreKit replays every unfinished transaction at connect time. Before this
// service existed nobody listened for paid users, so a long-tenured weekly
// subscriber can have dozens queued: verifying each one is dozens of Apple
// round-trips server-side and can exhaust the per-user verify budget right
// when a real purchase needs it. Buffer emissions briefly, verify NEWEST
// first per product, and finish the older ones locally once a newer one
// was granted (they cannot add entitlement).
const EMISSION_WINDOW_MS = 300;
const emissionQueue: { purchase: PurchaseLike; armedMatch: boolean }[] = [];
let emissionTimer: ReturnType<typeof setTimeout> | null = null;
let emissionFlushing: Promise<void> | null = null;
/** Newest granted transactionDate per product this session. */
const newestGranted = new Map<string, number>();

const txDate = (p: PurchaseLike): number => {
    const raw = (p as { transactionDate?: number | string }).transactionDate;
    const n = typeof raw === 'string' ? Date.parse(raw) : Number(raw);
    return Number.isFinite(n) ? n : 0;
};

function onPurchaseUpdated(purchase: PurchaseLike): Promise<void> {
    const sku = purchase.productId || undefined;
    if (!isManagedSku(sku)) return Promise.resolve(); // creator products: their own hook owns them
    // Snapshot the armed request NOW: a replayed transaction for another
    // product must never settle the purchase the paywall is waiting on.
    const armedMatch = !!armed && (!sku || armed.sku === sku);
    emissionQueue.push({ purchase, armedMatch });
    if (!emissionTimer) {
        emissionTimer = setTimeout(() => {
            emissionTimer = null;
            emissionFlushing = (emissionFlushing ?? Promise.resolve()).then(flushEmissions);
        }, loadDeps().emissionWindowMs);
    }
    return Promise.resolve();
}

async function flushEmissions(): Promise<void> {
    const batch = emissionQueue.splice(0, emissionQueue.length);
    // Newest first, so a granted renewal short-circuits its predecessors.
    batch.sort((a, b) => txDate(b.purchase) - txDate(a.purchase));
    for (const { purchase, armedMatch } of batch) {
        const sku = purchase.productId || '';
        const { iap } = loadDeps();
        const newer = newestGranted.get(sku);
        if (!armedMatch && newer !== undefined && txDate(purchase) > 0 && txDate(purchase) < newer && !results.has(memoKey(tidOf(purchase)))) {
            // An older period of a subscription we already know is active:
            // nothing to learn from the server — just stop StoreKit replaying it.
            console.log('[IAP] finishing superseded transaction without verify:', tidOf(purchase), sku);
            await finishQuietly(iap, purchase);
            continue;
        }
        const r = await verifyTransaction(purchase, { armedMatch });
        if (r.kind === 'granted' && sku) {
            newestGranted.set(sku, Math.max(newestGranted.get(sku) ?? 0, txDate(purchase)));
        }
        if (r.kind === 'unreachable') scheduleRetry(purchase, 0);
        if (armedMatch && armed) settleArmed(purchaseResultFromVerify(r));
    }
}

function purchaseResultFromVerify(r: VerifyResult): PurchaseResult {
    switch (r.kind) {
        case 'granted':
            return { kind: 'purchased', tier: r.tier };
        case 'other_account':
            return { kind: 'other_account', detail: r.detail };
        case 'expired':
            // StoreKit handed back an old transaction instead of selling a new
            // one — nothing was bought. Say so; the paywall stays.
            return { kind: 'not_purchased', code: 'stale-transaction', message: purchaseCopy.staleTransaction };
        case 'rejected':
            return { kind: 'not_purchased', code: 'rejected', message: r.detail || purchaseCopy.rejected };
        case 'unreachable':
        default:
            return { kind: 'not_purchased', code: 'unreachable', message: purchaseCopy.unreachableAfterPurchase };
    }
}

function onPurchaseError(error: PurchaseErrorLike): void {
    const code = String(error.code || '').toLowerCase();
    const message = error.message || '';
    const sku = error.productId || undefined;
    if (!isManagedSku(sku)) return;
    const armedMatch = !!armed && (!sku || armed.sku === sku);
    if (!armedMatch) {
        // A stray/replayed error (or nothing in flight): never surface it.
        if (code !== 'init-connection') console.warn('[IAP] ignoring non-matching purchase error:', code, sku);
        return;
    }

    if (code === 'user-cancelled') {
        settleArmed({ kind: 'cancelled' });
        return;
    }

    // "The Apple ID already has this" in every dialect the stack speaks:
    //  - OpenIAP's already-owned pre-check (auto-renew ON),
    //  - react-native-iap's duplicate-event dedupe (auto-renew OFF: StoreKit
    //    returned the SAME existing transaction and the native layer had
    //    already emitted it earlier in the session),
    //  - any message that says so.
    const alreadyOwned =
        code === 'already-owned' ||
        code === 'duplicate-purchase' ||
        /already\s+(own|subscrib|purchas)|duplicate purchase/i.test(message);
    if (alreadyOwned) {
        console.log('[IAP] already owned (', code, ') — reconciling instead of erroring');
        void reconcileOwnedSubscriptions({ force: true }).then((o) => {
            if (o.granted) { settleArmed({ kind: 'purchased', tier: o.tier }); return; }
            if (o.otherAccount) { settleArmed({ kind: 'other_account', detail: o.detail }); return; }
            if (o.transient) { settleArmed({ kind: 'not_purchased', code: 'unreachable', message: purchaseCopy.unreachableAfterPurchase }); return; }
            if (o.rejected) { settleArmed({ kind: 'not_purchased', code: 'rejected', message: o.detail || purchaseCopy.rejected }); return; }
            // Nothing active on the Apple ID after all (expired, or the event
            // was a sandbox artefact): the user has NOT bought anything.
            settleArmed({ kind: 'not_purchased', code: 'no-active-entitlement', message: purchaseCopy.noActiveEntitlement });
        });
        return;
    }

    if (code === 'deferred-payment' || code === 'pending') {
        settleArmed({ kind: 'pending' });
        return;
    }

    console.error('[IAP] purchase error:', code, message);
    settleArmed({ kind: 'not_purchased', code: code || 'unknown', message: purchaseCopy.forCode(code) });
}

function settleArmed(r: PurchaseResult): void {
    const a = armed;
    if (!a) return;
    armed = null;
    clearTimeout(a.timer);
    a.resolve(r);
}

// ── Purchase ────────────────────────────────────────────────────────────────

/**
 * Buy `sku` for the signed-in account and wait for the REAL outcome.
 * `requestPurchase()` resolves when the request is handed to StoreKit, not
 * when the user finishes paying, so the promise returned here is settled by
 * the listeners above (or the backstop timeout). Never throws.
 */
export async function purchase(sku: string, appAccountToken: string): Promise<PurchaseResult> {
    const { iap, isIos } = loadDeps();
    if (!isIos) return { kind: 'not_purchased', code: 'not-ios', message: purchaseCopy.forCode('iap-not-available') };
    if (armed) return { kind: 'not_purchased', code: 'in-flight', message: purchaseCopy.inFlight };
    const ok = await connect();
    if (!ok) return { kind: 'not_purchased', code: 'init-connection', message: purchaseCopy.forCode('init-connection') };

    const outcome = new Promise<PurchaseResult>((resolve) => {
        const timer = setTimeout(() => {
            if (armed && armed.resolve === resolve) {
                console.warn('[IAP] no purchase outcome within timeout — treating as not purchased');
                armed = null;
                resolve({ kind: 'not_purchased', code: 'timeout', message: purchaseCopy.timeout });
            }
        }, PURCHASE_TIMEOUT_MS);
        armed = { sku, resolve, timer };
    });

    try {
        await iap.requestPurchase({
            type: 'subs',
            request: { apple: { sku, appAccountToken } },
        });
    } catch (e) {
        // OpenIAP re-throws already-owned after ALSO emitting it as an error
        // event, which the listener handles. Only a throw with no event needs
        // handling here — give the listener a beat to win the race.
        const msg = (e as Error)?.message || '';
        setTimeout(() => {
            if (!armed) return;
            const lower = msg.toLowerCase();
            if (lower.includes('cancel')) { settleArmed({ kind: 'cancelled' }); return; }
            if (/already\s+(own|subscrib|purchas)|duplicate purchase/i.test(msg)) {
                onPurchaseError({ code: 'already-owned', message: msg, productId: sku });
                return;
            }
            console.error('[IAP] requestPurchase threw:', msg);
            settleArmed({ kind: 'not_purchased', code: 'request-failed', message: purchaseCopy.forCode('purchase-error') });
        }, 800);
    }
    return outcome;
}

// ── Reconcile (owned-but-locked-out failsafe) ───────────────────────────────

/**
 * Re-verify the Apple ID's ACTIVE subscriptions against the server. Heals the
 * classic "new phone / reinstall / second account" strand, and is the answer
 * to every already-owned signal. Silent: never alerts, returns facts.
 */
export function reconcileOwnedSubscriptions(opts?: { force?: boolean }): Promise<ReconcileOutcome> {
    const { isIos, now } = loadDeps();
    const none: ReconcileOutcome = { granted: false, otherAccount: false, expiredOnly: false, transient: false, rejected: false, checked: 0 };
    if (!isIos) return Promise.resolve(none);
    if (reconcileInFlight) return reconcileInFlight;
    const t = now();
    if (!opts?.force && t - lastReconcileAt < RECONCILE_MIN_INTERVAL_MS) return Promise.resolve(none);
    reconcileInFlight = sweep()
        .then((o) => { lastReconcileAt = now(); return o; })
        .catch((e) => {
            console.warn('[IAP] reconcile failed:', e);
            return { ...none, transient: true };
        })
        .finally(() => { reconcileInFlight = null; });
    return reconcileInFlight;
}

async function sweep(): Promise<ReconcileOutcome> {
    const { iap } = loadDeps();
    const out: ReconcileOutcome = { granted: false, otherAccount: false, expiredOnly: false, transient: false, rejected: false, checked: 0 };
    const ok = await connect();
    if (!ok) return { ...out, transient: true };
    const purchases = (await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true, alsoPublishToEventListenerIOS: false })) ?? [];
    out.checked = purchases.length;
    if (purchases.length === 0) return out;

    let sawExpired = false;
    let sawOther = false;
    for (const p of purchases) {
        if (!tidOf(p)) continue;
        if (!isManagedSku(p.productId || undefined)) continue;
        const r = await verifyTransaction(p, { armedMatch: isPurchaseArmed(p.productId || undefined) });
        if (r.kind === 'granted') { out.granted = true; out.tier = r.tier; }
        else if (r.kind === 'other_account') { sawOther = true; out.detail = r.detail; }
        else if (r.kind === 'expired') { sawExpired = true; }
        else if (r.kind === 'unreachable') { out.transient = true; }
        else if (r.kind === 'rejected') { out.rejected = true; out.detail = out.detail || r.detail; }
    }
    if (!out.granted) {
        out.otherAccount = sawOther;
        out.expiredOnly = !sawOther && sawExpired && !out.transient && !out.rejected;
    }
    return out;
}

// ── Copy ────────────────────────────────────────────────────────────────────

/** The only purchase-related strings a user ever reads. No library or HTTP
 *  text passes through here. */
export const purchaseCopy = {
    inFlight: 'A purchase is already in progress. Give it a moment.',
    timeout: "The App Store didn't confirm a purchase. If you were charged, tap Restore purchases and it will activate.",
    staleTransaction: "The App Store didn't start a new subscription. Please try again, or tap Restore purchases if you already subscribed.",
    noActiveEntitlement: "We couldn't find an active Max subscription on this Apple ID. Nothing was charged — please try again.",
    unreachableAfterPurchase: "You're subscribed, but Max couldn't be reached to activate it. It will activate automatically in a moment — tap Restore purchases if it doesn't.",
    rejected: "That purchase couldn't be activated. If you were charged, contact support and we'll sort it out.",
    otherAccountTitle: 'Subscription on another account',
    otherAccount: 'Your Apple ID already has an active Max subscription, but it belongs to a different Max account. Sign in with that account to keep using it.',
    pendingTitle: 'Waiting for approval',
    pending: 'Your purchase needs approval (Ask to Buy). Max will unlock as soon as it goes through.',
    forCode(code: string): string {
        switch (code) {
            case 'network-error':
            case 'service-error':
            case 'remote-error':
            case 'service-disconnected':
            case 'connection-closed':
                return "Couldn't reach the App Store. Check your connection and try again.";
            case 'init-connection':
            case 'iap-not-available':
            case 'billing-unavailable':
                return 'In-app purchases are unavailable on this device right now. Check Screen Time or App Store restrictions and try again.';
            case 'item-unavailable':
            case 'sku-not-found':
            case 'query-product':
            case 'empty-sku-list':
                return "This plan isn't available from the App Store right now. Please try again shortly.";
            case 'transaction-validation-failed':
            case 'receipt-failed':
            case 'purchase-verification-failed':
                return "The App Store couldn't verify that purchase. Please try again.";
            case 'interrupted':
                return 'The purchase was interrupted. Please try again.';
            default:
                return "The purchase didn't go through. Nothing was charged — please try again.";
        }
    },
};
