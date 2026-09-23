/**
 * Onboarding draft + funnel resume invariants (lib/onboardingDraft.ts).
 *
 * - The draft is scoped to a user id: a stranger's answers/step must never be
 *   restored into another account's wizard (device-wide blob leak).
 * - funnelResumeTarget: a failed/reaped scan must NOT redirect into the quiz
 *   (that trapped users in a quiz↔dead-gate loop with no rescan or skip), a
 *   skipper is never re-offered the scan, and a kill on the gate / referral /
 *   paywall resumes THERE instead of at the last quiz question.
 * - Server seeding: intro answers saved server-side are never asked twice.
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

const gate = { stage: 'gate' as const, answers: {} };
const skippedAtGate = { stage: 'gate' as const, answers: { scanSkipped: true } };
const QUIZ_SCANNED = { name: 'Onboarding', params: { phase: 'intro', scanSkipped: false } };
const QUIZ_SKIPPED = { name: 'Onboarding', params: { phase: 'intro', scanSkipped: true } };
const GATE = { name: 'FaceScanResults', params: { gateV4: true } };
const processing = { processing_status: 'processing' };
const completed = { processing_status: 'completed' };
const failed = { processing_status: 'failed' };

export const tests: Record<string, () => void | Promise<void>> = {
    // ── storage scoping ──────────────────────────────────────────────────
    'a draft is only restored for the user who wrote it': async () => {
        store.clear();
        await lib.saveOnboardingDraft('A', 3, { ageBand: '18-24', scanSkipped: false }, 'intro');
        const mine = await lib.loadOnboardingDraft('A');
        assert.ok(mine && mine.step === 3 && mine.answers.ageBand === '18-24');
        // Account B (Google sign-in resolved to an existing account) must not
        // see A's answers — and the leak must be closed permanently.
        assert.strictEqual(await lib.loadOnboardingDraft('B'), null);
        assert.strictEqual(store.has(KEY), false, 'foreign draft is cleared, not just ignored');
        assert.strictEqual(await lib.loadOnboardingDraft('A'), null);
    },

    'a legacy (unscoped) draft is dropped': async () => {
        store.clear();
        store.set(KEY, JSON.stringify({ v: 3, step: 4, phase: 'intro', answers: { scanSkipped: true }, ts: 1 }));
        assert.strictEqual(await lib.loadOnboardingDraft('A'), null);
    },

    'the wizard re-save keeps a stage stamped by another screen': async () => {
        store.clear();
        await lib.saveOnboardingDraft('A', 4, {}, 'intro');
        await lib.setOnboardingFunnelStage('A', 'referral');
        await lib.saveOnboardingDraft('A', 4, { effort: 'hard' }, 'intro'); // no stage arg
        const d = await lib.loadOnboardingDraft('A');
        assert.strictEqual(d?.stage, 'referral');
        assert.strictEqual(d?.answers.effort, 'hard');
        await lib.saveOnboardingDraft('A', 4, {}, 'intro', undefined);
        assert.strictEqual((await lib.loadOnboardingDraft('A'))?.stage, 'referral');
    },

    'markOnboardingScanSkipped patches the answer without losing the rest': async () => {
        store.clear();
        await lib.saveOnboardingDraft('A', 2, { goals: ['skinmax'] }, 'intro', 'gate');
        await lib.markOnboardingScanSkipped('A', true);
        const d = await lib.loadOnboardingDraft('A');
        assert.deepStrictEqual(d?.answers, { goals: ['skinmax'], scanSkipped: true });
        assert.strictEqual(d?.stage, 'gate');
        assert.strictEqual(d?.step, 2);
    },

    'setOnboardingFunnelStage works before the wizard ever saved': async () => {
        store.clear();
        await lib.setOnboardingFunnelStage('A', 'paywall');
        assert.strictEqual((await lib.loadOnboardingDraft('A'))?.stage, 'paywall');
    },

    // ── resume decision ──────────────────────────────────────────────────
    'no draft, no scan ⇒ show the offer': () => {
        assert.strictEqual(lib.funnelResumeTarget({ draft: null, scan: null }), null);
    },

    'a FAILED scan shows the offer again (rescan or skip), never the dead gate': () => {
        assert.strictEqual(lib.funnelResumeTarget({ draft: null, scan: failed }), null);
        assert.strictEqual(lib.funnelResumeTarget({ draft: gate, scan: failed }), null);
    },

    'a processing/completed scan mid-quiz resumes the quiz with scanSkipped:false': () => {
        for (const scan of [processing, completed]) {
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: null, scan }), [QUIZ_SCANNED]);
            // A stale scanSkipped:true from an earlier session must not skip the
            // gate once a real scan exists.
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { answers: { scanSkipped: true } }, scan }), [QUIZ_SCANNED]);
        }
    },

    'killed on the gate ⇒ straight back to the gate, quiz beneath it': () => {
        assert.deepStrictEqual(lib.funnelResumeTarget({ draft: gate, scan: processing }), [QUIZ_SCANNED, GATE]);
        assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { stage: 'intro_done', answers: {} }, scan: completed }), [QUIZ_SCANNED, GATE]);
    },

    'killed on referral / paywall ⇒ resume there regardless of the scan (history rebuilt)': () => {
        for (const scan of [processing, completed]) {
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { stage: 'referral', answers: {} }, scan }), [QUIZ_SCANNED, GATE, { name: 'ReferralCode' }]);
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { stage: 'paywall', answers: {} }, scan }), [QUIZ_SCANNED, GATE, { name: 'Payment' }]);
        }
        // No usable scan: no gate in the history.
        for (const scan of [null, failed]) {
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { stage: 'referral', answers: {} }, scan }), [QUIZ_SCANNED, { name: 'ReferralCode' }]);
            assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { stage: 'paywall', answers: { scanSkipped: true } }, scan }), [QUIZ_SKIPPED, { name: 'Payment' }]);
        }
    },

    'a skipper is never re-offered the scan': () => {
        assert.deepStrictEqual(lib.funnelResumeTarget({ draft: { answers: { scanSkipped: true } }, scan: null }), [QUIZ_SKIPPED]);
        assert.deepStrictEqual(lib.funnelResumeTarget({ draft: skippedAtGate, scan: null }), [QUIZ_SKIPPED, { name: 'ReferralCode' }]);
    },

    'the last route is always the screen to show': () => {
        const r = lib.funnelResumeTarget({ draft: { stage: 'paywall', answers: {} }, scan: completed })!;
        assert.strictEqual(r[r.length - 1].name, 'Payment');
        assert.strictEqual(r[0].name, 'Onboarding');
    },

    // ── server seeding ───────────────────────────────────────────────────
    'seedAnswersFromServerOnboarding maps the intro save back to wizard fields': () => {
        const a = lib.seedAnswersFromServerOnboarding({
            goals: ['skinmax', 'fitmax'], priority_order: ['SKIN', 'FIT'], age_band: '25-34',
            gender: 'male', motivation: 'other', motivation_other: 'wedding', effort_level: 'hard',
            completed: false,
        });
        assert.deepStrictEqual(a, {
            goals: ['skinmax', 'fitmax'], ageBand: '25-34', gender: 'male',
            motivation: 'other', motivationOther: 'wedding', effort: 'hard',
        });
        assert.deepStrictEqual(lib.seedAnswersFromServerOnboarding(null), {});
        assert.deepStrictEqual(lib.seedAnswersFromServerOnboarding({ goals: [1, null] }), {});
    },

    'firstUnansweredIntroStep jumps past everything the server already knows': () => {
        assert.strictEqual(lib.firstUnansweredIntroStep({}), 0);
        assert.strictEqual(lib.firstUnansweredIntroStep({ ageBand: '18-24' }), 1);
        assert.strictEqual(lib.firstUnansweredIntroStep({ ageBand: '18-24', gender: 'male' }), 2);
        assert.strictEqual(lib.firstUnansweredIntroStep({ ageBand: '18-24', gender: 'male', goals: ['skinmax'] }), 3);
        assert.strictEqual(lib.firstUnansweredIntroStep({ ageBand: '18-24', gender: 'male', goals: ['skinmax'], motivation: 'dating' }), 4);
        assert.strictEqual(lib.firstUnansweredIntroStep({ ageBand: '18-24', gender: 'male', goals: ['skinmax'], motivation: 'dating', effort: 'hard' }), 4);
    },
};
