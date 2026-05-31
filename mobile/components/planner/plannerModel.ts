/**
 * Pure model + time helpers for the week planner.
 *
 * The UI works in terms of WINDOWS — wake, sleep and the workout are each a
 * [start, end] range. A wake/sleep range collapsed to a single point
 * (start === end) means "an exact time". Everything is persisted into the
 * user's onboarding so the schedule generator and coach see it:
 *   - wake_time / sleep_time  → single anchors the backend already understands
 *                               (we send the window MIDPOINT so the scheduler
 *                               builds around the expected time)
 *   - wake_window / sleep_window → the [start,end] arrays, so the planner can
 *                               redraw the exact range the user chose
 *   - preferred_workout_window → [start,end] the scheduler slots the workout in
 *                               (with preferred_workout_time kept as its midpoint
 *                               for back-compat with the single-anchor scheduler)
 *
 * Obligations are a SINGLE GLOBAL list — there is no separate "work schedule";
 * work/school is just an obligation. Each obligation carries a `days`
 * recurrence ("all" | "weekdays" | "weekends" | a list of weekdays) so a
 * commitment can land on only the days it actually happens.
 *
 * Per-weekday timing overrides live in onboarding.weekly_timings (presence-based:
 * a day only stores the wake/sleep/get-ready fields it changes; everything else
 * inherits the defaults). The workout window and obligations are default/global
 * level only — they are not per-weekday overrides.
 */

import { eventInk } from './plannerTheme';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type Scope = 'all' | Weekday;

/**
 * An obligation's recurrence. Canonical forms mirror the backend `_norm_days`:
 *   'all'       → every day
 *   'weekdays'  → Mon–Fri
 *   'weekends'  → Sat–Sun
 *   Weekday[]   → a specific, chronologically-sorted set (e.g. Mon/Wed/Fri)
 */
export type DayRecurrence = 'all' | 'weekdays' | 'weekends' | Weekday[];

export type Obligation = {
  label: string;
  start: string;
  end: string;
  days: DayRecurrence;
};

export type DayShape = {
  wakeWindow: [string, string];
  sleepWindow: [string, string];
  getReadyTime: string | null;
  /** Default-level only — the scheduler slots the workout into this window. */
  workoutWindow: [string, string] | null;
};

export const WEEKDAYS: { key: Weekday; short: string; letter: string; long: string }[] = [
  { key: 'monday', short: 'Mon', letter: 'M', long: 'Monday' },
  { key: 'tuesday', short: 'Tue', letter: 'T', long: 'Tuesday' },
  { key: 'wednesday', short: 'Wed', letter: 'W', long: 'Wednesday' },
  { key: 'thursday', short: 'Thu', letter: 'T', long: 'Thursday' },
  { key: 'friday', short: 'Fri', letter: 'F', long: 'Friday' },
  { key: 'saturday', short: 'Sat', letter: 'S', long: 'Saturday' },
  { key: 'sunday', short: 'Sun', letter: 'S', long: 'Sunday' },
];

export const WEEKDAY_KEYS: Weekday[] = WEEKDAYS.map((w) => w.key);

const MF: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const SS: Weekday[] = ['saturday', 'sunday'];

// --------------------------------------------------------------------------- //
//  Time helpers                                                               //
// --------------------------------------------------------------------------- //

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isHHMM(s: any): s is string {
  return typeof s === 'string' && HHMM.test(s.trim());
}

/** 'HH:MM' → minutes since midnight (0–1439). Invalid → 0. */
export function toMin(s: string): number {
  const m = HHMM.exec((s || '').trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

/** minutes (may exceed 1440) → 'HH:MM', wrapping past midnight. */
export function minToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Canonicalise a loose 'H:MM' to zero-padded 'HH:MM'. */
export function canonHHMM(s: string): string {
  return minToHHMM(toMin(s));
}

/** Shift an 'HH:MM' clock by `delta` minutes (wraps within a day). */
export function addMinutes(s: string, delta: number): string {
  return minToHHMM(toMin(s) + delta);
}

/** 24h 'HH:MM' → friendly 12h, e.g. '7:30 AM'. */
export function fmt12(s: string): string {
  const h = Math.floor(toMin(s) / 60);
  const mm = toMin(s) % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

/** Compact 12h with no minutes when round, e.g. '7 AM', '10:30 PM'. */
export function fmt12Compact(s: string): string {
  const h = Math.floor(toMin(s) / 60);
  const mm = toMin(s) % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

/** Evening-normalised minutes: times before 04:00 count as next-day (+1440). */
export function eveMin(s: string): number {
  const m = toMin(s);
  return m < 240 ? m + 1440 : m;
}

/** Midpoint of a window as 'HH:MM'. `night` handles wrap (e.g. 22:30–01:00). */
export function windowMid(win: [string, string], night = false): string {
  if (night) {
    const a = eveMin(win[0]);
    const b = eveMin(win[1]);
    return minToHHMM((a + b) / 2);
  }
  return minToHHMM((toMin(win[0]) + toMin(win[1])) / 2);
}

// --------------------------------------------------------------------------- //
//  Canvas normalisation — map a clock time onto a 0–1 position across the day //
//  axis (04:00 today → 04:00 tomorrow), so late bedtimes sit on the right.    //
// --------------------------------------------------------------------------- //

export const CANVAS_DAY_START = 240; // 04:00
export const CANVAS_SPAN = 1440; // 24h

export function normCanvas(s: string): number {
  let m = toMin(s);
  if (m < CANVAS_DAY_START) m += 1440;
  return Math.max(0, Math.min(1, (m - CANVAS_DAY_START) / CANVAS_SPAN));
}

// --------------------------------------------------------------------------- //
//  Day-recurrence helpers (mirror backend api.users._norm_days)               //
// --------------------------------------------------------------------------- //

const DAY_ALIASES: Record<string, Weekday> = {
  mon: 'monday', monday: 'monday',
  tue: 'tuesday', tues: 'tuesday', tuesday: 'tuesday',
  wed: 'wednesday', weds: 'wednesday', wednesday: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', thursday: 'thursday',
  fri: 'friday', friday: 'friday',
  sat: 'saturday', saturday: 'saturday',
  sun: 'sunday', sunday: 'sunday',
};

function sameSet(set: Set<Weekday>, arr: Weekday[]): boolean {
  return set.size === arr.length && arr.every((d) => set.has(d));
}

/**
 * Normalise an obligation's `days` recurrence to a canonical form, mirroring the
 * backend. Accepts fuzzy tokens ("everyday", "wknd"), day abbreviations ("mon"),
 * and lists mixing names + tokens. A full Mon–Fri / Sat–Sun / 7-day set collapses
 * back to its token. Anything unrecognised falls back to "all" so a commitment is
 * never silently dropped from every day.
 */
export function normDays(v: any): DayRecurrence {
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (['', 'all', 'everyday', 'every day', 'daily', 'any', 'every'].includes(t)) return 'all';
    if (['weekday', 'weekdays', 'wkday', 'wkdays'].includes(t)) return 'weekdays';
    if (['weekend', 'weekends', 'wknd', 'wknds'].includes(t)) return 'weekends';
    const d = DAY_ALIASES[t];
    return d ? [d] : 'all';
  }
  if (Array.isArray(v)) {
    const acc = new Set<Weekday>();
    for (const it of v) {
      if (typeof it !== 'string') continue;
      const t = it.trim().toLowerCase();
      if (t === 'weekday' || t === 'weekdays') MF.forEach((d) => acc.add(d));
      else if (t === 'weekend' || t === 'weekends') SS.forEach((d) => acc.add(d));
      else if (t === 'all' || t === 'everyday' || t === 'daily') WEEKDAY_KEYS.forEach((d) => acc.add(d));
      else {
        const d = DAY_ALIASES[t];
        if (d) acc.add(d);
      }
    }
    if (acc.size === 0 || acc.size === 7) return 'all';
    if (sameSet(acc, MF)) return 'weekdays';
    if (sameSet(acc, SS)) return 'weekends';
    return WEEKDAY_KEYS.filter((k) => acc.has(k)); // chronological order
  }
  return 'all';
}

/** Does an obligation with this recurrence apply on the given weekday? */
export function obligationAppliesTo(days: DayRecurrence, day: Weekday): boolean {
  if (days === 'all') return true;
  if (days === 'weekdays') return MF.includes(day);
  if (days === 'weekends') return SS.includes(day);
  if (Array.isArray(days)) return days.includes(day);
  return true;
}

/** The obligations that land on `day`, sorted chronologically by start time. */
export function obligationsForDay(obs: Obligation[], day: Weekday): Obligation[] {
  return obs
    .filter((o) => obligationAppliesTo(o.days, day))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}

/** A stable string key for a recurrence (for dedupe / equality). */
export function daysKey(days: DayRecurrence): string {
  return Array.isArray(days) ? days.join(',') : days;
}

/**
 * A muted, earthy ink inferred from an obligation's label, so a "Work" block,
 * its legend swatch and its obligations-list row all read the same. The palette
 * is deliberately quiet (eucalyptus / umber / ochre / graphite) to sit with the
 * planner's warm-paper aesthetic — moss stays reserved for the workout. Used by
 * both the obligations list and the week canvas.
 */
export function obligationColor(label: string): string {
  const l = (label || '').trim().toLowerCase();
  if (/(work|job|office|shift|meeting)/.test(l)) return eventInk.work;
  if (/(school|class|lecture|lab|study|seminar|course|college)/.test(l)) return eventInk.school;
  if (/(commute|drive|bus|travel|transit|carpool)/.test(l)) return eventInk.commute;
  return eventInk.other;
}

/** Human-readable label for a recurrence, e.g. 'Weekdays', 'Mon, Wed, Fri'. */
export function daysLabel(days: DayRecurrence): string {
  if (days === 'all') return 'Every day';
  if (days === 'weekdays') return 'Weekdays';
  if (days === 'weekends') return 'Weekends';
  if (Array.isArray(days)) {
    if (days.length === 0) return 'Every day';
    if (days.length === 7) return 'Every day';
    return days.map((d) => WEEKDAYS.find((w) => w.key === d)?.short ?? d).join(', ');
  }
  return 'Every day';
}

/** Normalise a [start, end] HH:MM window. null if invalid or non-positive. */
export function normWindow(v: any): [string, string] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  if (!isHHMM(v[0]) || !isHHMM(v[1])) return null;
  const a = canonHHMM(v[0]);
  const b = canonHHMM(v[1]);
  if (toMin(b) <= toMin(a)) return null;
  return [a, b];
}

// --------------------------------------------------------------------------- //
//  Obligations                                                                //
// --------------------------------------------------------------------------- //

export function normObligations(raw: any): Obligation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o: any) => o && typeof o === 'object' && isHHMM(o.start) && isHHMM(o.end))
    .filter((o: any) => toMin(o.end) > toMin(o.start))
    .map((o: any) => ({
      label: (String(o.label || 'Busy').trim() || 'Busy').slice(0, 40),
      start: canonHHMM(o.start),
      end: canonHHMM(o.end),
      days: normDays(o.days),
    }));
}

/** Structural equality for two obligation lists (order-sensitive). */
export function sameObligations(a: Obligation[], b: Obligation[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (o, i) =>
      o.label === b[i].label &&
      o.start === b[i].start &&
      o.end === b[i].end &&
      daysKey(o.days) === daysKey(b[i].days),
  );
}

// --------------------------------------------------------------------------- //
//  Window reconciliation                                                      //
// --------------------------------------------------------------------------- //

/**
 * Resolve a window from stored data. Trust an explicit [start,end] window only
 * if it's well-formed AND still contains the single anchor — otherwise the
 * anchor was changed elsewhere (e.g. via the chatbot) and the window is stale,
 * so we collapse to an exact time at the anchor.
 */
function reconcileWindow(
  rawWindow: any,
  anchor: string | undefined,
  fallback: string,
  night: boolean,
): [string, string] {
  const a = isHHMM(anchor) ? (anchor as string) : fallback;
  if (Array.isArray(rawWindow) && rawWindow.length === 2 && isHHMM(rawWindow[0]) && isHHMM(rawWindow[1])) {
    const s = rawWindow[0] as string;
    const e = rawWindow[1] as string;
    const lo = night ? eveMin(s) : toMin(s);
    const hi = night ? eveMin(e) : toMin(e);
    const an = night ? eveMin(a) : toMin(a);
    if (lo <= hi && an >= lo - 1 && an <= hi + 1) return [s, e];
  }
  return [a, a];
}

/**
 * Resolve the default workout window: an explicit [start,end] wins; otherwise a
 * legacy single `preferred_workout_time` presents as a 90-minute window; else
 * null (no workout preference).
 */
function hydrateWorkoutWindow(ob: Record<string, any>): [string, string] | null {
  const win = normWindow(ob.preferred_workout_window);
  if (win) return win;
  if (isHHMM(ob.preferred_workout_time)) {
    const t = canonHHMM(ob.preferred_workout_time);
    return [t, addMinutes(t, 90)];
  }
  return null;
}

// --------------------------------------------------------------------------- //
//  Hydrate onboarding (snake_case) → DayShape / obligations / weekly overrides //
// --------------------------------------------------------------------------- //

export function hydrateDayShape(ob: Record<string, any>): DayShape {
  return {
    wakeWindow: reconcileWindow(ob.wake_window, ob.wake_time, '07:00', false),
    sleepWindow: reconcileWindow(ob.sleep_window, ob.sleep_time, '23:00', true),
    getReadyTime: isHHMM(ob.get_ready_time) ? ob.get_ready_time : null,
    workoutWindow: hydrateWorkoutWindow(ob),
  };
}

/**
 * The single GLOBAL obligations list. Reads the top-level `obligations`, folds
 * in any legacy per-weekday obligations (scoped to that weekday so nothing the
 * user set is lost), and migrates a legacy fixed work block
 * (work_schedule/work_start/work_end) into a weekday "Work" obligation.
 */
export function hydrateObligations(ob: Record<string, any>): Obligation[] {
  if (!ob || typeof ob !== 'object') return [];
  const out: Obligation[] = normObligations(ob.obligations);
  const seen = new Set(out.map((o) => `${o.label}|${o.start}|${o.end}|${daysKey(o.days)}`));

  // Fold legacy per-day obligations (old wholesale-per-day model) into the
  // global list, scoped to their specific weekday.
  const weekly = ob.weekly_timings;
  if (weekly && typeof weekly === 'object') {
    for (const { key } of WEEKDAYS) {
      const dr = weekly[key];
      if (!dr || typeof dr !== 'object') continue;
      for (const o of normObligations(dr.obligations)) {
        const scoped: Obligation = { ...o, days: [key] };
        const sig = `${scoped.label}|${scoped.start}|${scoped.end}|${daysKey(scoped.days)}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          out.push(scoped);
        }
      }
    }
  }

  // Migrate a legacy fixed work block → weekday "Work" obligation (unless a
  // work/school obligation already exists).
  const hasWork = out.some((o) => ['work', 'school'].includes(o.label.trim().toLowerCase()));
  if (ob.work_schedule === 'fixed' && isHHMM(ob.work_start) && isHHMM(ob.work_end) && !hasWork) {
    out.push({
      label: 'Work',
      start: canonHHMM(ob.work_start),
      end: canonHHMM(ob.work_end),
      days: 'weekdays',
    });
  }
  return out;
}

/** One weekday override (snake_case, only-changed-fields) → Partial<DayShape>.
 *  Weekly overrides only carry wake/sleep/get-ready; workout + obligations are
 *  global, so they are intentionally not read here. */
export function dayPartialFromServer(raw: Record<string, any>): Partial<DayShape> {
  const p: Partial<DayShape> = {};
  if (!raw || typeof raw !== 'object') return p;
  if ('wake_window' in raw || 'wake_time' in raw) {
    p.wakeWindow = reconcileWindow(raw.wake_window, raw.wake_time, raw.wake_time || '07:00', false);
  }
  if ('sleep_window' in raw || 'sleep_time' in raw) {
    p.sleepWindow = reconcileWindow(raw.sleep_window, raw.sleep_time, raw.sleep_time || '23:00', true);
  }
  if ('get_ready_time' in raw) p.getReadyTime = isHHMM(raw.get_ready_time) ? raw.get_ready_time : null;
  return p;
}

export function hydrateWeekly(
  raw: Record<string, any> | null | undefined,
): Partial<Record<Weekday, Partial<DayShape>>> {
  const out: Partial<Record<Weekday, Partial<DayShape>>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const { key } of WEEKDAYS) {
    const dr = raw[key];
    if (dr && typeof dr === 'object') {
      const p = dayPartialFromServer(dr);
      if (Object.keys(p).length) out[key] = p;
    }
  }
  return out;
}

// --------------------------------------------------------------------------- //
//  Serialise DayShape / obligations / overrides → onboarding (snake_case)     //
// --------------------------------------------------------------------------- //

/** The global obligations list → the snake_case array the backend stores. */
export function obligationsToServer(obs: Obligation[]): Record<string, any>[] {
  return obs.map((o) => ({ label: o.label, start: o.start, end: o.end, days: o.days }));
}

/** Full default day → all the snake_case fields onboarding expects. Obligations
 *  are global and serialised separately (see obligationsToServer). */
export function dayShapeToServer(d: DayShape): Record<string, any> {
  return {
    wake_time: windowMid(d.wakeWindow, false),
    sleep_time: windowMid(d.sleepWindow, true),
    wake_window: [d.wakeWindow[0], d.wakeWindow[1]],
    sleep_window: [d.sleepWindow[0], d.sleepWindow[1]],
    get_ready_time: d.getReadyTime || null,
    preferred_workout_window: d.workoutWindow ? [d.workoutWindow[0], d.workoutWindow[1]] : null,
    // Keep the single scalar in sync (midpoint) for the single-anchor scheduler.
    preferred_workout_time: d.workoutWindow ? windowMid(d.workoutWindow, false) : null,
  };
}

/** Presence-based: only the fields this day actually overrides (wake/sleep/get-ready). */
export function dayPartialToServer(p: Partial<DayShape>): Record<string, any> {
  const o: Record<string, any> = {};
  if ('wakeWindow' in p && p.wakeWindow) {
    o.wake_time = windowMid(p.wakeWindow, false);
    o.wake_window = [p.wakeWindow[0], p.wakeWindow[1]];
  }
  if ('sleepWindow' in p && p.sleepWindow) {
    o.sleep_time = windowMid(p.sleepWindow, true);
    o.sleep_window = [p.sleepWindow[0], p.sleepWindow[1]];
  }
  if ('getReadyTime' in p) o.get_ready_time = p.getReadyTime || null;
  return o;
}

export function serializeWeekly(
  weekly: Partial<Record<Weekday, Partial<DayShape>>>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const { key } of WEEKDAYS) {
    const p = weekly[key];
    if (!p || Object.keys(p).length === 0) continue;
    const day = dayPartialToServer(p);
    if (Object.keys(day).length) out[key] = day;
  }
  return out;
}

/** Effective day = defaults with a weekday's overrides layered on top. */
export function effectiveDay(
  defaults: DayShape,
  weekly: Partial<Record<Weekday, Partial<DayShape>>>,
  scope: Scope,
): DayShape {
  if (scope === 'all') return defaults;
  return { ...defaults, ...(weekly[scope] || {}) };
}

export function hasOverride(
  weekly: Partial<Record<Weekday, Partial<DayShape>>>,
  day: Weekday,
): boolean {
  const p = weekly[day];
  return !!p && Object.keys(p).length > 0;
}

export function isExact(win: [string, string]): boolean {
  return win[0] === win[1];
}

// --------------------------------------------------------------------------- //
//  Diff an edited day against the base, to build a minimal weekday override.   //
//  Only fields that genuinely differ are kept, so a day that's edited back to  //
//  match the base transparently re-inherits it (no stale pin left behind).     //
//  Workout + obligations are global, so they are never part of a day override. //
// --------------------------------------------------------------------------- //

function winEq(a: [string, string], b: [string, string]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function diffDayShape(base: DayShape, day: DayShape): Partial<DayShape> {
  const p: Partial<DayShape> = {};
  if (!winEq(day.wakeWindow, base.wakeWindow)) p.wakeWindow = day.wakeWindow;
  if (!winEq(day.sleepWindow, base.sleepWindow)) p.sleepWindow = day.sleepWindow;
  if (day.getReadyTime !== base.getReadyTime) p.getReadyTime = day.getReadyTime;
  return p;
}
