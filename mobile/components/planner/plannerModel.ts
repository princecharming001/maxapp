/**
 * Pure model + time helpers for the week planner.
 *
 * The UI works in terms of WINDOWS — wake and sleep are each a [start, end]
 * range. A range collapsed to a single point (start === end) means "an exact
 * time". Everything is persisted into the user's onboarding so the schedule
 * generator and coach see it:
 *   - wake_time / sleep_time  → single anchors the backend already understands
 *                               (we send the window MIDPOINT so the scheduler
 *                               builds around the expected time)
 *   - wake_window / sleep_window → the [start,end] arrays, so the planner can
 *                               redraw the exact range the user chose
 * Per-weekday overrides live in onboarding.weekly_timings (presence-based: a
 * day only stores the fields it changes; everything else inherits defaults).
 */

export type Obligation = { label: string; start: string; end: string };

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type Scope = 'all' | Weekday;

export type DayShape = {
  wakeWindow: [string, string];
  sleepWindow: [string, string];
  getReadyTime: string | null;
  workoutTime: string | null;
  workSchedule: 'fixed' | 'flexible' | null;
  workStart: string;
  workEnd: string;
  obligations: Obligation[];
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

export const WEEKDAY_KEYS = WEEKDAYS.map((w) => w.key);

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
//  Obligations                                                                //
// --------------------------------------------------------------------------- //

export function normObligations(raw: any): Obligation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o: any) => o && typeof o === 'object' && isHHMM(o.start) && isHHMM(o.end))
    .map((o: any) => ({
      label: String(o.label || '').trim() || 'Busy',
      start: String(o.start),
      end: String(o.end),
    }));
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

// --------------------------------------------------------------------------- //
//  Hydrate onboarding (snake_case) → DayShape / weekly overrides              //
// --------------------------------------------------------------------------- //

export function hydrateDayShape(ob: Record<string, any>): DayShape {
  return {
    wakeWindow: reconcileWindow(ob.wake_window, ob.wake_time, '07:00', false),
    sleepWindow: reconcileWindow(ob.sleep_window, ob.sleep_time, '23:00', true),
    getReadyTime: isHHMM(ob.get_ready_time) ? ob.get_ready_time : null,
    workoutTime: isHHMM(ob.preferred_workout_time) ? ob.preferred_workout_time : null,
    workSchedule:
      ob.work_schedule === 'fixed' || ob.work_schedule === 'flexible' ? ob.work_schedule : null,
    workStart: isHHMM(ob.work_start) ? ob.work_start : '09:00',
    workEnd: isHHMM(ob.work_end) ? ob.work_end : '17:00',
    obligations: normObligations(ob.obligations),
  };
}

/** One weekday override (snake_case, only-changed-fields) → Partial<DayShape>. */
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
  if ('preferred_workout_time' in raw)
    p.workoutTime = isHHMM(raw.preferred_workout_time) ? raw.preferred_workout_time : null;
  if ('work_schedule' in raw)
    p.workSchedule =
      raw.work_schedule === 'fixed' || raw.work_schedule === 'flexible' ? raw.work_schedule : null;
  if ('work_start' in raw) p.workStart = isHHMM(raw.work_start) ? raw.work_start : '09:00';
  if ('work_end' in raw) p.workEnd = isHHMM(raw.work_end) ? raw.work_end : '17:00';
  if ('obligations' in raw) p.obligations = normObligations(raw.obligations);
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
//  Serialise DayShape / overrides → onboarding (snake_case)                   //
// --------------------------------------------------------------------------- //

function obsToServer(obs: Obligation[]): Record<string, string>[] {
  return obs.map((o) => ({ label: o.label, start: o.start, end: o.end }));
}

/** Full default day → all the snake_case fields onboarding expects. */
export function dayShapeToServer(d: DayShape): Record<string, any> {
  return {
    wake_time: windowMid(d.wakeWindow, false),
    sleep_time: windowMid(d.sleepWindow, true),
    wake_window: [d.wakeWindow[0], d.wakeWindow[1]],
    sleep_window: [d.sleepWindow[0], d.sleepWindow[1]],
    get_ready_time: d.getReadyTime || null,
    preferred_workout_time: d.workoutTime || null,
    work_schedule: d.workSchedule || null,
    work_start: d.workSchedule === 'fixed' ? d.workStart : null,
    work_end: d.workSchedule === 'fixed' ? d.workEnd : null,
    obligations: obsToServer(d.obligations),
  };
}

/** Presence-based: only the fields this day actually overrides. */
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
  if ('workoutTime' in p) o.preferred_workout_time = p.workoutTime || null;
  if ('workSchedule' in p) o.work_schedule = p.workSchedule || null;
  if ('workStart' in p) o.work_start = p.workStart;
  if ('workEnd' in p) o.work_end = p.workEnd;
  if ('obligations' in p) o.obligations = obsToServer(p.obligations || []);
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
// --------------------------------------------------------------------------- //

function winEq(a: [string, string], b: [string, string]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function obsEq(a: Obligation[], b: Obligation[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((o, i) => o.label === b[i].label && o.start === b[i].start && o.end === b[i].end);
}

export function diffDayShape(base: DayShape, day: DayShape): Partial<DayShape> {
  const p: Partial<DayShape> = {};
  if (!winEq(day.wakeWindow, base.wakeWindow)) p.wakeWindow = day.wakeWindow;
  if (!winEq(day.sleepWindow, base.sleepWindow)) p.sleepWindow = day.sleepWindow;
  if (day.getReadyTime !== base.getReadyTime) p.getReadyTime = day.getReadyTime;
  if (day.workoutTime !== base.workoutTime) p.workoutTime = day.workoutTime;
  if (day.workSchedule !== base.workSchedule) p.workSchedule = day.workSchedule;
  // Whenever a day IS fixed-hours, carry its hours into the override (so a day
  // that newly becomes "fixed" never inherits null/again-flexible base hours).
  if (day.workSchedule === 'fixed') {
    if (base.workSchedule !== 'fixed' || day.workStart !== base.workStart) p.workStart = day.workStart;
    if (base.workSchedule !== 'fixed' || day.workEnd !== base.workEnd) p.workEnd = day.workEnd;
  }
  if (!obsEq(day.obligations, base.obligations)) p.obligations = day.obligations;
  return p;
}
