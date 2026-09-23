/**
 * Face-scan recovery invariants (lib/faceScanDraft.ts).
 *
 * These guard the "which scan is MINE" question: recovery after a kill used
 * to trust `first_scan_completed`, which is true for every repeat scan, so a
 * killed repeat upload was declared a success, the photos deleted and an OLD
 * scan shown as new. Recovery now matches the server row's created_at against
 * the submit timestamp.
 *
 * The lib imports React Native / AsyncStorage / expo-file-system, which don't
 * exist under node — they are stubbed through the module resolver below
 * (same trick for any test that touches a storage-backed lib).
 */
import assert from 'assert';

const Module = require('module');
const g = globalThis as any;
if (!g.__maxNativeStubsInstalled) {
    g.__maxNativeStubsInstalled = true;
    const store = new Map<string, string>();
    g.__maxAsyncStorage = store;
    const stubs: Record<string, unknown> = {
        'react-native': { Platform: { OS: 'ios' } },
        '@react-native-async-storage/async-storage': {
            __esModule: true,
            default: {
                getItem: async (k: string) => (store.has(k) ? store.get(k)! : null),
                setItem: async (k: string, v: string) => { store.set(k, v); },
                removeItem: async (k: string) => { store.delete(k); },
                multiRemove: async (ks: string[]) => { ks.forEach((k) => store.delete(k)); },
            },
        },
        // documentDirectory null ⇒ the photo-file paths short-circuit; only the
        // AsyncStorage-backed flags are exercised here.
        'expo-file-system/legacy': { documentDirectory: null },
    };
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request: string, ...rest: unknown[]) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) return `stub:${request}`;
        return origResolve.call(this, request, ...rest);
    };
    for (const [id, exports] of Object.entries(stubs)) {
        const m = new Module(`stub:${id}`);
        m.filename = `stub:${id}`;
        m.loaded = true;
        m.exports = exports;
        Module._cache[`stub:${id}`] = m;
    }
}

const lib = require('../lib/faceScanDraft') as typeof import('../lib/faceScanDraft');
const store: Map<string, string> = g.__maxAsyncStorage;

export const tests: Record<string, () => void | Promise<void>> = {
    'parseServerDate treats a zone-less ISO string as UTC': () => {
        assert.strictEqual(lib.parseServerDate('2026-09-23T03:00:00'), Date.parse('2026-09-23T03:00:00Z'));
        assert.strictEqual(lib.parseServerDate('2026-09-23T03:00:00+00:00'), Date.parse('2026-09-23T03:00:00Z'));
        assert.strictEqual(lib.parseServerDate('2026-09-23T03:00:00.123456+00:00'), Date.parse('2026-09-23T03:00:00.123Z'));
        assert.ok(Number.isNaN(lib.parseServerDate(null)));
        assert.ok(Number.isNaN(lib.parseServerDate('garbage')));
    },

    'a row created after the submit belongs to it': () => {
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-23T03:01:00Z', '2026-09-23T03:00:00.000Z'), true);
    },

    "yesterday's scan does NOT satisfy a submit from today (the H4 bug)": () => {
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-22T03:00:00Z', '2026-09-23T03:00:00.000Z'), false);
    },

    'clock slack: a row stamped up to 60s BEFORE the submit still counts': () => {
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-23T02:59:30Z', '2026-09-23T03:00:00.000Z'), true);
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-23T02:58:00Z', '2026-09-23T03:00:00.000Z'), false);
    },

    'a legacy flag without a timestamp cannot be matched ⇒ treated as landed (never traps)': () => {
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-22T03:00:00Z', null), true);
        assert.strictEqual(lib.scanLandedAfterSubmit('2026-09-22T03:00:00Z', 'not-a-date'), true);
    },

    'an unparseable row date never counts as landed': () => {
        assert.strictEqual(lib.scanLandedAfterSubmit(undefined, '2026-09-23T03:00:00.000Z'), false);
    },

    'the pending flag carries the submit timestamp': async () => {
        store.clear();
        await lib.setPendingFaceScanSubmit('u1');
        const p = await lib.getPendingFaceScanSubmit();
        assert.ok(p);
        assert.strictEqual(p!.userId, 'u1');
        assert.ok(typeof p!.at === 'string' && Number.isFinite(Date.parse(p!.at!)));
        await lib.clearPendingFaceScanSubmit();
        assert.strictEqual(await lib.getPendingFaceScanSubmit(), null);
    },

    'an expired pending flag is dropped and cleared': async () => {
        store.clear();
        const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
        store.set('@max_face_scan_pending_submit_v1', JSON.stringify({ userId: 'u1', at: old }));
        assert.strictEqual(await lib.getPendingFaceScanSubmit(), null);
        assert.strictEqual(store.has('@max_face_scan_pending_submit_v1'), false);
    },

    'upload-failed flag is user-scoped and cleared on a foreign read': async () => {
        store.clear();
        await lib.setFaceScanUploadFailed('u1', 'Could not reach Max.');
        const mine = await lib.getFaceScanUploadFailed('u1');
        assert.ok(mine && mine.message === 'Could not reach Max.');
        // Another account must never see (or keep) it.
        assert.strictEqual(await lib.getFaceScanUploadFailed('u2'), null);
        assert.strictEqual(await lib.getFaceScanUploadFailed('u1'), null, 'foreign read clears the flag');
    },

    'upload-failed flag expires like the pending flag': async () => {
        store.clear();
        const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
        store.set('@max_face_scan_upload_failed_v1', JSON.stringify({ userId: 'u1', message: 'x', at: old }));
        assert.strictEqual(await lib.getFaceScanUploadFailed('u1'), null);
    },
};
