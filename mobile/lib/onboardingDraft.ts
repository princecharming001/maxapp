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
 */
const DRAFT_VERSION = 1;

export type OnboardingAnswers = {
    goals: string[];
    motivation: string | null;
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
    chronotype: string;
    breakfastMin: number;
    lunchMin: number;
    dinnerMin: number;
    skipBreakfast: boolean;
    skipLunch: boolean;
    skipDinner: boolean;
    anchors: string[];
    workoutChoice: string;
    weekendShift: boolean;
};

export type OnboardingDraft = {
    v: number;
    step: number;
    answers: Partial<OnboardingAnswers>;
    ts: number;
};

export async function saveOnboardingDraft(
    step: number,
    answers: Partial<OnboardingAnswers>,
): Promise<void> {
    try {
        const draft: OnboardingDraft = { v: DRAFT_VERSION, step, answers, ts: Date.now() };
        await AsyncStorage.setItem(STORAGE_KEYS.onboardingDraft, JSON.stringify(draft));
    } catch {
        /* best-effort — a failed draft write must never break the wizard */
    }
}

export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.onboardingDraft);
        if (!raw) return null;
        const d = JSON.parse(raw) as OnboardingDraft;
        if (!d || d.v !== DRAFT_VERSION || typeof d.step !== 'number' || !d.answers) return null;
        return d;
    } catch {
        return null;
    }
}

export async function clearOnboardingDraft(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEYS.onboardingDraft);
    } catch {
        /* ignore */
    }
}
