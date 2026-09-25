/**
 * Day counter + day-close rule, shared by Home (header, day strip) and the
 * planner. Pure and unit-tested (__tests__/dayProgress.test.ts).
 *
 * Why the counter is computed HERE and not only read off the server payload:
 * the payload is cached (React Query persistence) and a cached `day_number` /
 * `today_date` from a previous open would hold the header on that day until
 * the refetch lands — the "stuck on day N" feel. The journey anchor never
 * moves, so anchor + the device's own date is always current, online or not.
 */

/** Mirrors backend services/schedule_master_merge.py — keep the two in step. */
export const DAY_CLOSE_COMPLETED_FRACTION = 0.6;
export const DAY_CLOSE_RESOLVED_FRACTION = 0.8;

const EPS = 1e-9;

/** A day closes with at least one real completion and either >= 60% of its
 *  tasks completed or >= 80% resolved (completed or skipped). */
export function dayCloses(total: number, done: number, skipped = 0): boolean {
    if (!(total > 0) || !(done > 0)) return false;
    if (done / total >= DAY_CLOSE_COMPLETED_FRACTION - EPS) return true;
    return (done + skipped) / total >= DAY_CLOSE_RESOLVED_FRACTION - EPS;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The device's local calendar date as YYYY-MM-DD (never the UTC date). */
export function localDateISO(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Whole calendar days between two YYYY-MM-DD dates (UTC-anchored so DST never shifts the count). */
export function diffDaysISO(fromISO: string, toISO: string): number {
    return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

/** Day 1 = the journey anchor date; null when there is no usable anchor. */
export function journeyDayNumber(
    journeyStartISO: string | null | undefined,
    todayISO: string,
): number | null {
    if (!journeyStartISO || !ISO_DATE.test(journeyStartISO) || !ISO_DATE.test(todayISO)) return null;
    const n = diffDaysISO(journeyStartISO, todayISO) + 1;
    return Number.isFinite(n) ? Math.max(1, n) : null;
}

/**
 * The date the app treats as "today": the later of the server's local date
 * (user's timezone) and the device's. A payload cached yesterday can't hold
 * the counter or the strip highlight on yesterday; a device a day ahead of
 * the profile timezone (travel) shows the day the person is actually living.
 */
export function resolveTodayISO(
    payloadTodayISO: string | null | undefined,
    deviceTodayISO: string,
): string {
    const p = payloadTodayISO && ISO_DATE.test(payloadTodayISO) ? payloadTodayISO : null;
    const d = ISO_DATE.test(deviceTodayISO) ? deviceTodayISO : null;
    if (p && d) return p > d ? p : d;
    return p ?? d ?? deviceTodayISO;
}

/** What a completion earned, for the one-line toast. Null → show nothing. */
export function xpToastLine(
    xp: { awarded?: number; on_time?: boolean } | null | undefined,
): string | null {
    const n = Number(xp?.awarded ?? 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    return xp?.on_time === false ? `+${n} XP · late` : `+${n} XP`;
}
