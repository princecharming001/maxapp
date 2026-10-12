/**
 * Onboarding draft invariants (lib/onboardingDraft.ts).
 *
 * - The draft is scoped to a user id: a stranger's answers/step must never be
 *   restored into another account's wizard (device-wide blob leak).
 * - A funnel stage stamped by another screen (referral / paywall) survives the
 *   wizard's own re-saves, so a relaunch resumes THERE.
 * - Server seeding: intro answers saved server-side are never asked twice, and
 *   answers from the retired looks onboarding are ignored.
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

const lib = require('../lib/onboardingDraft') as typeof import('../lib/onboardingDraft');
const store: Map<string, string> = g.__maxAsyncStorage;
const KEY = 'max.resilience.onboardingDraft.v1';

export const tests: Record<string, () => void | Promise<void>> = {
    // ── storage scoping ──────────────────────────────────────────────────
    'a draft is only restored for the user who wrote it': async () => {
        store.clear();
        await lib.saveOnboardingDraft('A', 3, { level: 'medium', goals: ['sleep'] }, 'intro');
        const mine = await lib.loadOnboardingDraft('A');
        assert.ok(mine && mine.step === 3 && mine.answers.level === 'medium');
        // Account B (Google sign-in resolved to an existing account) must not
        // see A's answers — and the leak must be closed permanently.
        assert.strictEqual(await lib.loadOnboardingDraft('B'), null);
        assert.strictEqual(store.has(KEY), false, 'foreign draft is cleared, not just ignored');
        assert.strictEqual(await lib.loadOnboardingDraft('A'), null);
    },

    'a draft from the previous onboarding version is dropped': async () => {
        store.clear();
        store.set(KEY, JSON.stringify({ v: 4, userId: 'A', step: 4, phase: 'intro', answers: { gender: 'male' }, ts: 1 }));
        assert.strictEqual(await lib.loadOnboardingDraft('A'), null);
    },

    'a legacy (unscoped) draft is dropped': async () => {
        store.clear();
        store.set(KEY, JSON.stringify({ v: 3, step: 4, phase: 'intro', answers: { goals: ['skinmax'] }, ts: 1 }));
        assert.strictEqual(await lib.loadOnboardingDraft('A'), null);
    },

    'the wizard re-save keeps a stage stamped by another screen': async () => {
        store.clear();
        await lib.saveOnboardingDraft('A', 4, {}, 'intro');
        await lib.setOnboardingFunnelStage('A', 'referral');
        await lib.saveOnboardingDraft('A', 4, { level: 'high' }, 'intro'); // no stage arg
        const d = await lib.loadOnboardingDraft('A');
        assert.strictEqual(d?.stage, 'referral');
        assert.strictEqual(d?.answers.level, 'high');
        await lib.saveOnboardingDraft('A', 4, {}, 'intro', undefined);
        assert.strictEqual((await lib.loadOnboardingDraft('A'))?.stage, 'referral');
    },

    'setOnboardingFunnelStage works before the wizard ever saved': async () => {
        store.clear();
        await lib.setOnboardingFunnelStage('A', 'paywall');
        assert.strictEqual((await lib.loadOnboardingDraft('A'))?.stage, 'paywall');
    },

    // ── server seeding ───────────────────────────────────────────────────
    'seedAnswersFromServerOnboarding maps the intro save back to wizard fields': () => {
        const a = lib.seedAnswersFromServerOnboarding({
            goals: ['sleep', 'focus'], priority_order: [], biohack_level: 'high', daily_minutes: 45,
            intensity_preference: 'sweatmode', completed: false,
        });
        assert.deepStrictEqual(a, { goals: ['sleep', 'focus'], level: 'high', dailyMinutes: 45 });
        assert.deepStrictEqual(lib.seedAnswersFromServerOnboarding(null), {});
        assert.deepStrictEqual(lib.seedAnswersFromServerOnboarding({ goals: [1, null] }), {});
    },

    'answers from the retired looks onboarding are not seeded': () => {
        assert.deepStrictEqual(
            lib.seedAnswersFromServerOnboarding({ goals: ['skinmax', 'fitmax'], effort_level: 'all_in', gender: 'male' }),
            {},
        );
        assert.deepStrictEqual(lib.seedAnswersFromServerOnboarding({ goals: ['skinmax', 'energy'], biohack_level: 'max' }), { goals: ['energy'] });
    },

    'firstUnansweredIntroStep jumps past everything the server already knows': () => {
        assert.strictEqual(lib.firstUnansweredIntroStep({}), 0);
        assert.strictEqual(lib.firstUnansweredIntroStep({ goals: [] }), 0);
        assert.strictEqual(lib.firstUnansweredIntroStep({ goals: ['sleep'] }), 1);
        assert.strictEqual(lib.firstUnansweredIntroStep({ goals: ['sleep'], level: 'low' }), 2);
    },
};
