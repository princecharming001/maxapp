/**
 * ScheduleGrid — the day read as a clean, Apple/Tiimo-style calendar: a quiet
 * hour gutter on the left and each block of the day floated onto the time axis
 * as a soft white card with a hairline accent tick. An alternate way to SEE the
 * same day the agenda shows; tapping a card opens the same editor.
 *
 * Pure presentation — it takes the resolved day + obligations. Notable behaviour:
 *   • Piecewise time axis: populated stretches render at full scale, long empty
 *     gaps are compressed (with a quiet break marker) so a sparse day doesn't
 *     scroll forever.
 *   • Every visible hour is labelled, so the first hour is always anchored.
 *   • On today only: a live "now" line + dot, and past events are dimmed.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme/dark';
import type { ShapeFocus } from './DayEditorSheet';
import {
  DayShape,
  Obligation,
  Scope,
  toMin,
  fmt12Compact,
  isExact,
  obligationsForDay,
} from './plannerModel';

const WORKOUT_ACCENT = '#2F6B4E';
const OB_INK = '#34343B';
const NOW_ACCENT = '#111113';      // the "now" line — black
const CAL_ACCENT = '#B0B0B8';     // calendar event accent (read-only, lighter than OB_INK)

const HOUR_H = 56;                 // pixels per hour (full scale)
const PX_PER_MIN = HOUR_H / 60;
const GUTTER = 58;                 // time-label column width ("12 PM")
const MIN_CARD_H = 30;             // floor card height
// No compression: show EVERY hour from wake to sleep at full scale, even when a
// stretch is blank. (Infinity threshold = no gap ever collapses.)
const GAP_THRESHOLD = Number.POSITIVE_INFINITY;
const COMPRESSED_GAP_H = 38;       // (retained; unused while compression is off)
const TOP_PAD = 6;
const BOTTOM_PAD = 12;

type Ev = {
  key: string;
  start: number;
  end: number;
  label: string;
  sub?: string;
  accent: string;
  onPress?: () => void;
  source?: 'calendar';
};

export type CalendarEventRow = {
  event_id: string;
  time?: string;
  end?: string;
  label: string;
  all_day?: boolean;
};

type Seg = { s: number; e: number; y0: number; y1: number; compressed: boolean };

function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh < 12 ? 'AM' : 'PM';
  const hr = hh % 12 || 12;
  return `${hr} ${suffix}`;
}

// minutes-from-midnight → "HH:MM" (so we can reuse fmt12Compact for labels)
function min2hhmm(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const mn = mm % 60;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function buildEvents(
  day: DayShape,
  obligations: Obligation[],
  scope: Scope,
  onEditShape: (focus: ShapeFocus) => void,
  onEditObligation?: (index: number) => void,
  calendarEvents: CalendarEventRow[] = [],
): Ev[] {
  const evs: Ev[] = [];

  // Wake
  {
    const w = day.wakeWindow;
    const s = toMin(w[0]);
    let e = toMin(w[1]);
    if (e <= s) e = s + 25;
    evs.push({
      key: 'wake', start: s, end: e, label: 'Wake',
      sub: isExact(w) ? undefined : `anytime ${fmt12Compact(w[0])} – ${fmt12Compact(w[1])}`,
      accent: colors.foreground, onPress: () => onEditShape('wake'),
    });
  }

  // Get ready
  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    evs.push({
      key: 'ready', start: toMin(gr[0]), end: toMin(gr[1]),
      label: 'Get ready', sub: 'AM routine', accent: colors.foreground,
      onPress: () => onEditShape('ready'),
    });
  }

  // Commitments for this scope
  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i }))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    const s = toMin(o.start);
    let e = toMin(o.end);
    if (e <= s) e = s + 30;
    evs.push({
      key: `ob-${i}-${o.start}`, start: s, end: e,
      label: o.label, accent: OB_INK,
      onPress: onEditObligation && i >= 0 ? () => onEditObligation(i) : undefined,
    });
  }

  // Calendar events (read-only; all-day events are rendered as pills elsewhere)
  for (const ev of calendarEvents) {
    if (ev.all_day || !ev.time) continue; // skip all-day — shown as top pill
    const s = toMin(ev.time);
    let e = ev.end ? toMin(ev.end) : s + 30;
    if (e <= s) e = s + 30;
    evs.push({
      key: `cal-${ev.event_id}`,
      start: s,
      end: e,
      label: ev.label,
      accent: CAL_ACCENT,
      onPress: undefined,
      source: 'calendar',
    });
  }

  // Workout window
  if (day.workoutWindow) {
    const ww = day.workoutWindow;
    evs.push({
      key: 'workout', start: toMin(ww[0]), end: toMin(ww[1]),
      label: 'Workout', sub: 'Max fits it here', accent: WORKOUT_ACCENT,
      onPress: () => onEditShape('workout'),
    });
  }

  // Wind down
  {
    const sw = day.sleepWindow;
    const s = toMin(sw[0]);
    let e = toMin(sw[1]);
    if (e <= s) e = s + 25;
    evs.push({
      key: 'sleep', start: s, end: e, label: 'Wind down',
      sub: isExact(sw) ? `Bed by ${fmt12Compact(sw[0])}` : `bed by ${fmt12Compact(sw[1])}`,
      accent: colors.foreground, onPress: () => onEditShape('sleep'),
    });
  }

  evs.sort((a, b) => a.start - b.start || a.end - b.end);

  // De-dupe identical overlapping items (presentation only) — e.g. a "Commute"
  // that resolves into two side-by-side twins. Same label+start+end = one card.
  const seen = new Set<string>();
  const deduped: Ev[] = [];
  for (const e of evs) {
    const sig = `${e.label.trim().toLowerCase()}|${e.start}|${e.end}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(e);
  }
  return deduped;
}

/** Merge a sorted event list into its covered [start,end] intervals. */
function coveredIntervals(evs: Ev[]): [number, number][] {
  const merged: [number, number][] = [];
  for (const e of [...evs].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && e.start <= last[1]) last[1] = Math.max(last[1], e.end);
    else merged.push([e.start, e.end]);
  }
  return merged;
}

/**
 * Build the piecewise vertical map: covered stretches at full scale, long empty
 * gaps compressed. Returns the segments, the total height, and a y(min) mapper.
 */
function buildTimeMap(
  merged: [number, number][],
  gridStart: number,
  gridEnd: number,
): { segs: Seg[]; height: number; yOf: (min: number) => number } {
  const segs: Seg[] = [];
  let y = TOP_PAD;
  const push = (s: number, e: number, compressed: boolean) => {
    if (e <= s) return;
    const h = compressed ? COMPRESSED_GAP_H : (e - s) * PX_PER_MIN;
    segs.push({ s, e, y0: y, y1: y + h, compressed });
    y += h;
  };
  const addGap = (a: number, b: number) => push(a, b, b - a > GAP_THRESHOLD);

  let prev = gridStart;
  for (const [cs, ce] of merged) {
    if (cs > prev) addGap(prev, cs);
    push(cs, ce, false);
    prev = Math.max(prev, ce);
  }
  if (gridEnd > prev) addGap(prev, gridEnd);
  if (segs.length === 0) push(gridStart, gridEnd || gridStart + 60, false);

  const yOf = (min: number): number => {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (min <= first.s) return first.y0;
    if (min >= last.e) return last.y1;
    for (const sg of segs) {
      if (min <= sg.e) {
        const span = sg.e - sg.s || 1;
        return sg.y0 + ((min - sg.s) / span) * (sg.y1 - sg.y0);
      }
    }
    return last.y1;
  };

  return { segs, height: y + BOTTOM_PAD, yOf };
}

/** Is an hour boundary inside a compressed gap (so we skip its label)? */
function inCompressedGap(segs: Seg[], min: number): boolean {
  return segs.some((sg) => sg.compressed && min > sg.s && min < sg.e);
}

export default function ScheduleGrid({
  day, obligations, scope, onEditShape, onEditObligation, onAddAt, isToday = false, calendarEvents = [],
}: {
  day: DayShape;
  obligations: Obligation[];
  scope: Scope;
  onEditShape: (focus: ShapeFocus) => void;
  onEditObligation?: (index: number) => void;
  /** Tap an EMPTY slot on the grid → add a commitment starting around there. */
  onAddAt?: (startMin: number) => void;
  isToday?: boolean;
  calendarEvents?: CalendarEventRow[];
}) {
  const evs = buildEvents(day, obligations, scope, onEditShape, onEditObligation, calendarEvents);

  // Live "now" — only ticks while viewing today (keeps the indicator current).
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    if (!isToday) return;
    setNow(nowMinutes());
    const id = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  if (evs.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>No times set for this day yet.</Text>
      </View>
    );
  }

  const minStart = Math.min(...evs.map((e) => e.start));
  const maxEnd = Math.max(...evs.map((e) => e.end));
  const startHour = Math.floor(minStart / 60);
  const endHour = Math.ceil(maxEnd / 60);
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;

  const merged = coveredIntervals(evs);
  const { segs, height: gridHeight, yOf } = buildTimeMap(merged, gridStart, gridEnd);

  // Calendar-style overlap layout: only events that actually overlap in time
  // share the width (split into side-by-side columns within their cluster).
  const lay: { col: number; cols: number }[] = new Array(evs.length);
  let ci = 0;
  while (ci < evs.length) {
    let clusterEnd = evs[ci].end;
    const idxs = [ci];
    let cj = ci + 1;
    while (cj < evs.length && evs[cj].start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, evs[cj].end);
      idxs.push(cj);
      cj++;
    }
    const colEnd: number[] = [];
    const colOf: number[] = [];
    for (const k of idxs) {
      let c = colEnd.findIndex((en) => evs[k].start >= en);
      if (c === -1) { c = colEnd.length; colEnd.push(0); }
      colEnd[c] = evs[k].end;
      colOf.push(c);
    }
    const cols = colEnd.length;
    idxs.forEach((k, t) => { lay[k] = { col: colOf[t], cols }; });
    ci = cj;
  }

  const showNow = isToday && now >= gridStart && now <= gridEnd;

  // Inverse of yOf — a tapped y back to minutes, for tap-empty-space-to-add.
  const minAtY = (y: number): number => {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (y <= first.y0) return first.s;
    if (y >= last.y1) return last.e;
    for (const sg of segs) {
      if (y <= sg.y1) {
        const h = sg.y1 - sg.y0 || 1;
        return sg.s + ((y - sg.y0) / h) * (sg.e - sg.s);
      }
    }
    return last.e;
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.grid, { height: gridHeight }]}>
        {/* Bottom layer: tapping empty space adds a commitment at that time.
            Event cards sit above and win their own touches; hour labels and
            the now-line are pointerEvents:none, so only true gaps land here. */}
        {onAddAt ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            accessible={false}
            onPress={(e) => {
              const m = Math.round(minAtY(e.nativeEvent.locationY) / 30) * 30;
              onAddAt(Math.max(gridStart, Math.min(m, gridEnd - 60)));
            }}
          />
        ) : null}
        {/* Hour lines + labels — every visible hour, so the first is anchored. */}
        {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
          const h = startHour + i;
          const hm = h * 60;
          if (inCompressedGap(segs, hm)) return null;
          return (
            <View key={`h-${h}`} pointerEvents="none" style={[styles.hourRow, { top: yOf(hm) }]}>
              <Text style={styles.hourLabel}>{hourLabel(h)}</Text>
              <View style={styles.hourLine} />
            </View>
          );
        })}

        {/* Compressed-gap break markers — a quiet hairline that says "time skipped". */}
        {segs.filter((sg) => sg.compressed).map((sg) => (
          <View
            key={`gap-${sg.s}`}
            pointerEvents="none"
            style={[styles.gapRow, { top: (sg.y0 + sg.y1) / 2 }]}
          >
            <View style={styles.gapLine} />
          </View>
        ))}

        {/* Event cards — positioned on the time axis, minimal white cards. */}
        <View pointerEvents="box-none" style={styles.lane}>
          {evs.map((e, idx) => {
            const { col, cols } = lay[idx];
            const top = yOf(e.start);
            const cardH = Math.max(yOf(e.end) - top, MIN_CARD_H);
            const tiny = cardH < 44;
            const narrow = cols > 1;
            const past = isToday && e.end <= now;
            return (
              <View
                key={e.key}
                pointerEvents="box-none"
                style={{ position: 'absolute', top, height: cardH, left: `${(col / cols) * 100}%` as any, width: `${(1 / cols) * 100}%` as any }}
              >
                <TouchableOpacity
                  activeOpacity={e.onPress ? 0.85 : 1}
                  onPress={e.onPress}
                  disabled={!e.onPress}
                  style={[styles.card, past && styles.cardPast]}
                  accessibilityRole={e.onPress ? 'button' : undefined}
                  accessibilityLabel={`${e.label}, ${fmt12Compact(min2hhmm(e.start))}`}
                >
                  {/* Flat Craft card — the workout keeps a whisper of its
                      accent as a wash; everything else stays warm white. */}
                  {e.accent === WORKOUT_ACCENT ? (
                    <View pointerEvents="none" style={styles.cardAccentWash} />
                  ) : null}
                  {/* Hairline tick — calendar events use a thin opacity line */}
                  <View style={[
                    styles.tick,
                    { backgroundColor: e.accent },
                    e.source === 'calendar' && { opacity: 0.4 },
                  ]} />
                  <View style={[styles.cardBody, tiny && styles.cardBodyTiny]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {e.source === 'calendar' ? (
                        <Ionicons name="calendar-outline" size={10} color={CAL_ACCENT} />
                      ) : null}
                      <Text
                        style={[styles.cardTitle, narrow && styles.cardTitleNarrow, e.source === 'calendar' && { color: CAL_ACCENT }]}
                        numberOfLines={tiny ? 1 : 2}
                      >
                        {e.label}
                      </Text>
                    </View>
                    {!tiny && cardH >= 44 ? (
                      <Text style={styles.cardTime} numberOfLines={1}>
                        {fmt12Compact(min2hhmm(e.start))} – {fmt12Compact(min2hhmm(e.end))}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* "Now" indicator — today only: a dot in the gutter + a thin accent line. */}
        {showNow ? (
          <View pointerEvents="none" style={[styles.nowRow, { top: yOf(now) }]}>
            <View style={styles.nowDot} />
            <View style={styles.nowLine} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  grid: { position: 'relative', width: '100%' },
  emptyText: {
    fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted,
    textAlign: 'center', paddingVertical: 28,
  },

  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  hourLabel: {
    width: GUTTER - 10, textAlign: 'left', fontFamily: fonts.sansMedium, fontSize: 12,
    color: colors.textMuted, marginTop: -7, letterSpacing: 0.3, fontVariant: ['tabular-nums'],
  },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border, opacity: 0.7 },

  gapRow: { position: 'absolute', left: GUTTER, right: 0, flexDirection: 'row', alignItems: 'center' },
  gapLine: {
    flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border,
    opacity: 0.55, marginRight: 6,
  },

  lane: { position: 'absolute', left: GUTTER, right: 0, top: 0, bottom: 0 },
  // Flat Craft card — warm white on the cream canvas, hairline edge, soft
  // shadow. No glass/blur: restraint reads designed here, translucency reads busy.
  card: {
    flex: 1, height: '100%', flexDirection: 'row', overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 12, borderCurve: 'continuous',
    marginRight: 6, marginBottom: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardPast: { opacity: 0.42 },
  // The workout keeps a whisper of its accent.
  cardAccentWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(47,107,78,0.07)' },
  tick: { width: 3, marginVertical: 7, borderRadius: 2 },
  cardBody: { flex: 1, paddingHorizontal: 11, paddingVertical: 7, justifyContent: 'center' },
  cardBodyTiny: { justifyContent: 'center', paddingVertical: 4 },
  cardTitle: { fontFamily: fonts.serif, fontSize: 15, color: colors.foreground, letterSpacing: -0.2 },
  cardTitleNarrow: { fontSize: 13.5 },
  cardTime: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },

  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: NOW_ACCENT, marginLeft: GUTTER - 7 },
  nowLine: { flex: 1, height: 1.5, backgroundColor: NOW_ACCENT, opacity: 0.9, marginRight: 6 },
});
