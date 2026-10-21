/** Pure helpers for the person's own tasks (CustomTaskSheet). Kept out of the
 *  component so they're unit-tested without React Native. */
import type { CustomTaskDay } from '../../services/api';

export const ALL_DAYS: readonly CustomTaskDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS_ONLY: readonly CustomTaskDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const WEEKENDS_ONLY: readonly CustomTaskDay[] = ['sat', 'sun'];
export const DAY_LETTERS: Record<CustomTaskDay, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };
const DAY_SHORT: Record<CustomTaskDay, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120];

/** One-tap starters. Biology levers only — these are OUR suggestions (the
 *  person can still type anything). */
export const SUGGESTIONS: { title: string; minutes: number; icon: string }[] = [
  { title: 'Workout', minutes: 60, icon: 'barbell-outline' },
  { title: 'Run', minutes: 30, icon: 'walk-outline' },
  { title: 'Walk', minutes: 20, icon: 'footsteps-outline' },
  { title: 'Sauna', minutes: 20, icon: 'flame-outline' },
  { title: 'Cold plunge', minutes: 5, icon: 'snow-outline' },
  { title: 'Stretch', minutes: 10, icon: 'body-outline' },
  { title: 'Yoga', minutes: 30, icon: 'leaf-outline' },
];

export function sortDays(days: readonly string[]): CustomTaskDay[] {
  const set = new Set(days.map((d) => String(d).toLowerCase().slice(0, 3)));
  return ALL_DAYS.filter((d) => set.has(d));
}

function same(a: readonly CustomTaskDay[], b: readonly CustomTaskDay[]): boolean {
  return a.length === b.length && b.every((d) => a.includes(d));
}

export function quickOf(days: readonly CustomTaskDay[]): 'all' | 'weekdays' | 'weekends' | null {
  if (same(days, ALL_DAYS)) return 'all';
  if (same(days, WEEKDAYS_ONLY)) return 'weekdays';
  if (same(days, WEEKENDS_ONLY)) return 'weekends';
  return null;
}

export function customDaysLabel(days: readonly CustomTaskDay[]): string {
  const q = quickOf(days);
  if (q === 'all') return 'Every day';
  if (q === 'weekdays') return 'Weekdays';
  if (q === 'weekends') return 'Weekends';
  return sortDays(days).map((d) => DAY_SHORT[d]).join(', ');
}

export function durationLabel(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** The next quarter hour from now (what someone adding a task "now-ish" means). */
export function defaultStartMinute(now: Date = new Date()): number {
  const m = now.getHours() * 60 + now.getMinutes();
  return (Math.ceil((m + 1) / 15) * 15) % 1440;
}

/** Is this merged schedule row one of the person's own tasks? */
export function isCustomTaskRow(row: { catalog_id?: string | null } | null | undefined): boolean {
  return String(row?.catalog_id || '').startsWith('custom.');
}
