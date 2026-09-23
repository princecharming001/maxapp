import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './resilienceKeys';

/**
 * Durable draft for the onboarding wizard. The wizard holds ~25 answer fields
 * in React state only, so a reload / force-kill / phone-death mid-flow loses
 * everything and dumps the user back at step 0. This persists {step, answers}
 * after every change so an interruption resumes exactly where they left off.
 *
 * Answers are stored loosely (all optional) so a future shape change never
 * crashes a restore — missing fields just fall back to the screen's defaults.
 * Cleared on successful submit and on logout (AuthContext).
 *
 * Scoped to a user id (mirrors faceScanDraft): the draft used to be one
 * device-wide blob, so anon A's answers + step were restored into account B's
 * wizard after a Google/Apple sign-in on the account step, and a stale
 * `scanSkipped:true` from an earlier session silently skipped the results
 * gate after a real scan. A draft whose owner isn't the current user is
 * ignored AND cleared.
 */
// v4: adds `userId` (required — an unowned draft cannot be attributed and is
// dropped) and `stage`, the funnel checkpoint past the last quiz question.
// Version bumps deliberately discard older drafts — step indexes and phase
// names moved, so a stale draft would resume into the wrong question.
const DRAFT_VERSION = 4;

export type OnboardingAnswers = {
    /** User declined the scan at the funnel's scan offer (results gate skipped). */
    scanSkipped: boolean;
    ageBand: string | null;
    gender: string | null;
    effort: string | null;
    goals: string[];
    motivation: string | null;
    // Free-text "other reason" the user types when motivation === 'other'.
    // Persisted in the draft and sent to the backend as `motivation_other`.
    motivationOther: string;
    wakeMin: number;
    grStart: number;
    grEnd: number;
    wdStart: number;
    wdEnd: number;
    works: boolean;
    workStartMin: number;
    workEndMin: number;
    workLocation: string;
    commuteMin: number;
    breakfastMin: number;
    lunchMin: number;
    dinnerMin: number;
    skipBreakfast: boolean;
    skipLunch: boolean;
    skipDinner: boolean;
    // When the user usually showers — 'morning' | 'night' | 'both'. Anchors
    // skin/hygiene routines; sent to the backend as `shower_time`.
    showerTime: string | null;
    workoutMin: number;
    weekendShift: boolean;
};

/**
 * Funnel checkpoint past the intro questions. The quiz draft alone only knows
 * step/phase, so a kill on the results gate, the referral step or the paywall
 * relaunched into ScanOffer → the LAST intro question → gate → … again. The
 * screens stamp their stage here and ScanOffer forwards straight to it.
 *   intro_done — intro answers saved, about to show the gate / referral
 *   gate       — on the results gate
 *   referral   — on the referral/promo step
 *   paywall    — on the paywall
 */
export type FunnelStage = 'intro_done' | 'gate' | 'referral' | 'paywall';

export type OnboardingDraft = {
    v: number;
    userId: string;
    step: number;
    /** Which funnel phase the wizard was in (intro | schedule). */
    phase?: string;
    stage?: FunnelStage;
    answers: Partial<OnboardingAnswers>;
    ts: number;
};

async function readRaw(): Promise<OnboardingDraft | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.onboardingDraft);
        if (!raw) return null;
        const d = JSON.parse(raw) as OnboardingDraft;
        if (!d || d.v !== DRAFT_VERSION || typeof d.step !== 'number' || !d.answers) return null;
        if (typeof d.userId !== 'string' || !d.userId) return null;
        return d;
    } catch {
        return null;
    }
}

async function writeRaw(d: OnboardingDraft): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEYS.onboardingDraft, JSON.stringify(d));
    } catch {
        /* best-effort — a failed draft write must never break the wizard */
    }
}

export async function saveOnboardingDraft(
    userId: string,
    step: number,
    answers: Partial<OnboardingAnswers>,
    phase?: string,
    stage?: FunnelStage,
): Promise<void> {
    // The wizard re-saves on every answer change; the stage is stamped by
    // OTHER screens (gate/referral) while the wizard sits buried beneath them,
    // so an unspecified stage keeps whatever this user's draft already holds.
    let keptStage: FunnelStage | undefined = stage;
    if (keptStage === undefined) {
        const prev = await readRaw();
        if (prev && prev.userId === userId) keptStage = prev.stage;
    }
    await writeRaw({ v: DRAFT_VERSION, userId, step, phase, stage: keptStage, answers, ts: Date.now() });
}

/** The draft for THIS user, or null. A foreign / legacy blob is dropped. */
export async function loadOnboardingDraft(userId: string): Promise<OnboardingDraft | null> {
    const d = await readRaw();
    if (!d) {
        // A legacy (unscoped) or corrupt blob can't be attributed — clear it so
        // it can never leak into another account later.
        void clearOnboardingDraft();
        return null;
    }
    if (String(d.userId) !== String(userId)) {
        await clearOnboardingDraft();
        return null;
    }
    return d;
}

/** Stamp the funnel checkpoint (creates a minimal draft if the wizard hasn't saved one yet). */
export async function setOnboardingFunnelStage(userId: string, stage: FunnelStage | undefined): Promise<void> {
    const prev = await loadOnboardingDraft(userId);
    await writeRaw({
        v: DRAFT_VERSION,
        userId,
        step: prev?.step ?? 0,
        phase: prev?.phase ?? 'intro',
        stage,
        answers: prev?.answers ?? {},
        ts: Date.now(),
    });
}

/** Record the user's scan choice outside the wizard (the gate's "Skip scan"). */
export async function markOnboardingScanSkipped(userId: string, skipped: boolean): Promise<void> {
    const prev = await loadOnboardingDraft(userId);
    await writeRaw({
        v: DRAFT_VERSION,
        userId,
        step: prev?.step ?? 0,
        phase: prev?.phase ?? 'intro',
        stage: prev?.stage,
        answers: { ...(prev?.answers ?? {}), scanSkipped: skipped },
        ts: Date.now(),
    });
}

export async function clearOnboardingDraft(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEYS.onboardingDraft);
    } catch {
        /* ignore */
    }
}

// ── Pure helpers (unit-tested, no storage) ──────────────────────────────────

export type FunnelResumeRoute = { name: string; params?: Record<string, unknown> };

/**
 * The funnel stack ScanOffer should rebuild for a returning user (last entry
 * = the screen to show), or `null` to show the offer. Rebuilding the history
 * — quiz beneath the gate beneath the referral step — keeps Back meaningful
 * after a resume. Decides from the draft's stage + the latest scan row's
 * status: the old guard redirected into the quiz for a scan row of ANY
 * status, so a failed/reaped analysis trapped the user in a quiz↔gate loop
 * with no way to rescan or skip, and a skipper was re-offered the scan on
 * every relaunch.
 */
export function funnelResumeTarget(args: {
    draft: Pick<OnboardingDraft, 'stage' | 'answers'> | null;
    scan: { processing_status?: string } | null;
}): FunnelResumeRoute[] | null {
    const { draft, scan } = args;
    const status = scan?.processing_status;
    const scanUsable = status === 'processing' || status === 'completed';
    const skipped = draft?.answers?.scanSkipped === true;
    const stage = draft?.stage;
    // A scan row exists ⇒ the user scanned: a stale scanSkipped:true from an
    // earlier session must not route the intro past the results gate.
    const quiz: FunnelResumeRoute = {
        name: 'Onboarding',
        params: { phase: 'intro', scanSkipped: scanUsable ? false : skipped },
    };
    const gate: FunnelResumeRoute = { name: 'FaceScanResults', params: { gateV4: true } };
    const withGate = scanUsable && !skipped ? [quiz, gate] : [quiz];
    // Past the gate: the scan (or its absence) no longer matters.
    if (stage === 'paywall') return [...withGate, { name: 'Payment' }];
    if (stage === 'referral') return [...withGate, { name: 'ReferralCode' }];
    if (scanUsable) {
        if (stage === 'gate' || stage === 'intro_done') return [quiz, gate];
        return [quiz];
    }
    // No usable scan (none, or failed). A skipper made their choice — don't
    // re-offer; everyone else gets the offer back (rescan or skip).
    if (skipped) {
        if (stage === 'gate' || stage === 'intro_done') return [quiz, { name: 'ReferralCode' }];
        return [quiz];
    }
    return null;
}

/**
 * Seed the wizard from the server's saved answers when there is no local
 * draft (new phone, reinstall, cleared storage). The intro save lands
 * goals/priority_order/age_band/gender/motivation/effort_level server-side,
 * so a user should never be asked those five questions twice.
 */
export function seedAnswersFromServerOnboarding(ob: unknown): Partial<OnboardingAnswers> {
    const o = (ob && typeof ob === 'object' ? ob : {}) as Record<string, unknown>;
    const out: Partial<OnboardingAnswers> = {};
    if (Array.isArray(o.goals)) {
        const goals = o.goals.filter((g): g is string => typeof g === 'string' && !!g);
        if (goals.length) out.goals = goals.slice(0, 3);
    }
    if (typeof o.age_band === 'string' && o.age_band) out.ageBand = o.age_band;
    if (typeof o.gender === 'string' && o.gender) out.gender = o.gender;
    if (typeof o.motivation === 'string' && o.motivation) out.motivation = o.motivation;
    if (typeof o.motivation_other === 'string') out.motivationOther = o.motivation_other;
    if (typeof o.effort_level === 'string' && o.effort_level) out.effort = o.effort_level;
    return out;
}

/** Index of the first intro question (age, gender, goals, motivation, effort) without an answer. */
export function firstUnansweredIntroStep(a: Partial<OnboardingAnswers>): number {
    if (!a.ageBand) return 0;
    if (!a.gender) return 1;
    if (!a.goals || a.goals.length === 0) return 2;
    if (!a.motivation) return 3;
    if (!a.effort) return 4;
    return 4;
}
