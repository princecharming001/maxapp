/**
 * personalization — pure, deterministic derivations of the *safe* things Max
 * knows about a user, for tasteful on-screen personalization.
 *
 * GUARDRAILS (see RALPH_PERSONALIZE.md):
 *  - Known, not watched: only data the user gave us or earned (name, goals,
 *    chosen coach persona, streak, scan archetype, experience level).
 *  - Positive framing only: NEVER read or surface constraints (conditions,
 *    injuries, medications) or inferred negatives (personality.to_improve).
 *  - Degrade gracefully: every field is optional; absent → undefined → the
 *    caller renders exactly today's generic copy.
 *
 * No React, no I/O, no randomness here so it can be unit-tested directly.
 */

import { getMaxxDisplayLabel } from '../utils/maxxDisplay';
import { normalizePersonaId, type PersonaId } from './toneCopy';

/** Presentable labels for the canonical maxxes; fall back to the shared helper. */
const GOAL_LABELS: Record<string, string> = {
    skinmax: 'Skinmax',
    fitmax: 'Fitmax',
    hairmax: 'Hairmax',
    heightmax: 'Heightmax',
    bonemax: 'Bonemax',
    coloringmax: 'Coloring Max',
};

function goalLabel(id: string): string {
    return GOAL_LABELS[id] ?? getMaxxDisplayLabel({ id });
}

/** Minimal structural slice of the AuthContext user we read from. */
export interface PersonalizationUserLike {
    first_name?: string | null;
    coaching_tone?: string | null;
    onboarding?: {
        goals?: unknown;
        experience_level?: string | null;
        values?: unknown;
        motivations?: unknown;
        facial_scan_summary?: { archetype?: string | null } | null;
        [key: string]: unknown;
    } | null;
    profile?: { streak_days?: number | null } | null;
}

export interface Personalization {
    /** First name if present; undefined → greeting/copy omit the name cleanly. */
    firstName?: string;
    /** Time-of-day greeting, e.g. "Good morning". Always present (generic-safe). */
    greeting: string;
    /** Chosen coach persona, normalized. 'default' when unset. */
    personaId: PersonaId;
    /** Display label of the top-priority goal, e.g. "Skinmax". */
    primaryGoalLabel?: string;
    /** All chosen goals as display labels, in priority order. */
    goalLabels: string[];
    /** Raw goal ids (lowercase), in priority order — for matching/sorting. */
    goalIds: string[];
    /** Only when the user explicitly stated it; never inferred. */
    topValue?: string;
    /** Only when the user explicitly stated it; never inferred. */
    topMotivation?: string;
    /** Face-scan archetype, only when a scan produced one. */
    archetype?: string;
    /** Earned streak in days (0 when unknown). */
    streakDays: number;
    /** beginner | intermediate | advanced | … when known. */
    experienceLevel?: string;
}

/**
 * Stable goal-ranked reorder: items whose id matches one of `goalIds` come
 * first, in goal-priority order; everything else keeps its original relative
 * order. NEVER drops, hides, or duplicates an item — pure reorder. Returns a
 * new array; with no goals the order is unchanged. Deterministic.
 */
export function rankByGoals<T>(
    items: T[],
    goalIds: string[],
    idOf: (item: T) => string,
): T[] {
    if (!Array.isArray(items) || items.length === 0) return [];
    if (!goalIds || goalIds.length === 0) return items.slice();
    const rankOf = new Map<string, number>();
    goalIds.forEach((g, i) => {
        const k = String(g || '').toLowerCase();
        if (k && !rankOf.has(k)) rankOf.set(k, i);
    });
    const FAR = Number.MAX_SAFE_INTEGER;
    return items
        .map((it, i) => {
            const key = String(idOf(it) || '').toLowerCase();
            return { it, i, r: rankOf.has(key) ? (rankOf.get(key) as number) : FAR };
        })
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.it);
}

/** Streak day-counts that earn a one-time micro-celebration. */
export const STREAK_MILESTONES: readonly number[] = [3, 7, 30, 100] as const;

/**
 * Return the milestone threshold if `days` is exactly one of them, else null.
 * Only fires ON the milestone day — never on the days around it. Pure.
 */
export function streakMilestone(days: unknown): number | null {
    const d = typeof days === 'number' && Number.isInteger(days) ? days : NaN;
    return STREAK_MILESTONES.includes(d) ? d : null;
}

/**
 * A short, factual one-liner tying a face-scan score to the user's archetype.
 * Returns undefined when no archetype is present (caller renders nothing).
 * Makes NO new claims — "read closest to" mirrors the existing archetype
 * definition. Pure.
 */
export function archetypeLine(
    archetype: string | null | undefined,
    rating?: number | null,
): string | undefined {
    const a = typeof archetype === 'string' ? archetype.trim() : '';
    if (!a) return undefined;
    if (typeof rating === 'number' && Number.isFinite(rating)) {
        return `Your features read closest to ${a} — that's the look your ${rating.toFixed(1)}/10 is built on.`;
    }
    return `Your features read closest to ${a}.`;
}

export type ExperienceTier = 'beginner' | 'intermediate' | 'advanced' | 'unknown';

/**
 * Normalize a free-ish experience level to a coarse tier. Anything we don't
 * recognize → 'unknown' so callers fall back to today's generic content. Pure.
 */
export function experienceTier(level: unknown): ExperienceTier {
    const s = String(level ?? '').trim().toLowerCase();
    if (!s) return 'unknown';
    if (/(advanced|expert|veteran|pro\b|experienced)/.test(s)) return 'advanced';
    if (/(intermediate|some|moderate)/.test(s)) return 'intermediate';
    if (/(beginner|begin|novice|new\b|none|starter|just)/.test(s)) return 'beginner';
    return 'unknown';
}

/** Time-of-day greeting from a 0–23 hour. Pure. */
export function greetingForHour(hour: number): string {
    const h = Number.isFinite(hour) ? hour : 0;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function cleanString(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    return s.length > 0 ? s : undefined;
}

/** First non-empty string from a string or array of strings; else undefined. */
function firstExplicit(v: unknown): string | undefined {
    if (typeof v === 'string') return cleanString(v);
    if (Array.isArray(v)) {
        for (const item of v) {
            const s = cleanString(item);
            if (s) return s;
        }
    }
    return undefined;
}

function asGoalIds(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of v) {
        const s = cleanString(item)?.toLowerCase();
        if (s && !seen.has(s)) {
            seen.add(s);
            out.push(s);
        }
    }
    return out;
}

/**
 * Derive the safe personalization view-model from a user + the current hour.
 * Cold start (null user / empty fields) → only `greeting`, `personaId`
 * ('default'), `goalLabels` ([]), `goalIds` ([]), `streakDays` (0) are set;
 * every optional field is undefined so callers render today's generic copy.
 */
export function derivePersonalization(
    user: PersonalizationUserLike | null | undefined,
    hour: number,
): Personalization {
    const ob = user?.onboarding ?? undefined;
    const goalIds = asGoalIds(ob?.goals);
    const goalLabels = goalIds.map(goalLabel);
    const streak = user?.profile?.streak_days;

    return {
        firstName: cleanString(user?.first_name),
        greeting: greetingForHour(hour),
        personaId: normalizePersonaId(user?.coaching_tone),
        primaryGoalLabel: goalLabels[0],
        goalLabels,
        goalIds,
        topValue: firstExplicit(ob?.values),
        topMotivation: firstExplicit(ob?.motivations),
        archetype: cleanString(ob?.facial_scan_summary?.archetype),
        streakDays: typeof streak === 'number' && Number.isFinite(streak) ? streak : 0,
        experienceLevel: cleanString(ob?.experience_level),
    };
}
