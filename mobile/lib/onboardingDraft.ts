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
 * Scoped to a user id: the draft used to be one device-wide blob, so anon A's
 * answers + step were restored into account B's wizard after a Google/Apple
 * sign-in on the account step. A draft whose owner isn't the current user is
 * ignored AND cleared.
 */
// v5: the biohacking onboarding (goals + level; no scan, age, gender or
// motivation). Version bumps deliberately discard older drafts — step indexes
// and fields moved, so a stale draft would resume into the wrong question.
const DRAFT_VERSION = 5;

export type OnboardingAnswers = {
    goals: string[];
    /** Coarse level derived from the minutes: 'low' | 'medium' | 'high'. */
    level: string | null;
    /** Minutes a day the user commits (time slider). */
    dailyMinutes: number | null;
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
    // hygiene routines; sent to the backend as `shower_time`.
    showerTime: string | null;
    workoutMin: number;
    weekendShift: boolean;
};

/**
 * Funnel checkpoint past the intro questions. The quiz draft alone only knows
 * step/phase, so a kill on the referral step or the paywall would relaunch
 * into the last intro screen. Those screens stamp their stage here and the
 * wizard forwards straight to it on relaunch.
 *   referral   — on the referral/promo step
 *   paywall    — on the paywall
 */
export type FunnelStage = 'referral' | 'paywall';

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
    // OTHER screens (referral/paywall) while the wizard sits buried beneath them,
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

export async function clearOnboardingDraft(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEYS.onboardingDraft);
    } catch {
        /* ignore */
    }
}

// ── Pure helpers (unit-tested, no storage) ──────────────────────────────────

const VALID_GOALS = new Set(['energy', 'sleep', 'focus', 'stress', 'training', 'skin_hair', 'longevity']);
const VALID_LEVELS = new Set(['low', 'medium', 'high']);

/**
 * Seed the wizard from the server's saved answers when there is no local
 * draft (new phone, reinstall, cleared storage). The intro save lands goals
 * and the level server-side, so a user is never asked those twice. Goals from
 * the retired looks onboarding (skinmax, …) are ignored.
 */
export function seedAnswersFromServerOnboarding(ob: unknown): Partial<OnboardingAnswers> {
    const o = (ob && typeof ob === 'object' ? ob : {}) as Record<string, unknown>;
    const out: Partial<OnboardingAnswers> = {};
    if (Array.isArray(o.goals)) {
        const goals = o.goals.filter((g): g is string => typeof g === 'string' && VALID_GOALS.has(g));
        if (goals.length) out.goals = goals.slice(0, 2);
    }
    if (typeof o.biohack_level === 'string' && VALID_LEVELS.has(o.biohack_level)) out.level = o.biohack_level;
    if (typeof o.daily_minutes === 'number' && o.daily_minutes >= 5 && o.daily_minutes <= 60) out.dailyMinutes = o.daily_minutes;
    return out;
}

/** Index of the first intro question (goals, level) without an answer; day shape after that. */
export function firstUnansweredIntroStep(a: Partial<OnboardingAnswers>): number {
    if (!a.goals || a.goals.length === 0) return 0;
    if (!a.level) return 1;
    return 2;
}
