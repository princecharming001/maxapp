/**
 * XP a badge pays, for the achievement celebration.
 *
 * The server sends it on each earned badge (`xp`, tiered since 2026-09-24 —
 * backend services/gamification.achievement_xp). This fallback mirrors that
 * table for an older server that doesn't. The celebration used to show +50
 * for every badge; setup badges now pay 10.
 */
const SETUP_BADGES = new Set(['first_routine', 'first_scan', 'two_maxxes', 'knows_me']);
const TIER_XP: Record<string, number> = { bronze: 25, silver: 75, gold: 200 };

export function achievementXp(a: { code: string; tier?: string | null; xp?: number | null }): number {
    if (typeof a.xp === 'number' && Number.isFinite(a.xp) && a.xp > 0) return Math.round(a.xp);
    if (a.code === 'streak_100') return 500;
    if (SETUP_BADGES.has(a.code)) return 10;
    return TIER_XP[String(a.tier ?? '').toLowerCase()] ?? 25;
}
