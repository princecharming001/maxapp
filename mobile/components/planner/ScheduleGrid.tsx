/**
 * ScheduleGrid — the day on a time axis, in two layers:
 *
 *   • STRUCTURE (behind): wake, get-ready, workout window, wind-down, the
 *     user's commitments and their calendar events, drawn as quiet full-width
 *     bands with a small label. They are the shape of the day, not things to
 *     do, so they never compete with the habits for attention or width.
 *   • HABITS (in front): the plan's tasks as full-width liquid-glass cards at
 *     the minute their reminder fires. Cards STACK — a card is pushed below the
 *     previous one when they would overlap — instead of splitting the width
 *     into columns, so a title is always one readable line. (Each card prints
 *     its own time, so a stacked card is never ambiguous.)
 *
 * One type family throughout (the app's sans), so calendar events, day-shape
 * bands and habits read as one surface. On today only: a live "now" line, and
 * past items are dimmed.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme/dark';
import { LiquidGlassFill } from '../glass/LiquidGlass';
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

const INK = '#111113';
const NOW_ACCENT = '#111113';
const WORKOUT_ACCENT = '#2F6B4E';
const CAL_ACCENT = '#5B6B8A';

const HOUR_H = 56;                 // pixels per hour
const PX_PER_MIN = HOUR_H / 60;
const GUTTER = 58;                 // time-label column width ("12 PM")
const TOP_PAD = 6;
const BOTTOM_PAD = 12;

const CARD_MIN_H = 42;             // one line of title + time, comfortably
const CARD_GAP = 4;                // between stacked cards
const CARD_INSET = 8;              // cards start right of a band's spine
const CARD_RADIUS = 14;
const LABEL_H = 22;                // one band label line
const BAND_MIN_H = LABEL_H + 4;

type Band = {
  key: string;
  start: number;
  end: number;
  label: string;
  detail?: string;
  accent: string;
  wash: string;
  icon?: 'calendar';
  onPress?: () => void;
};

type Card = {
  key: string;
  start: number;
  minutes: number;
  title: string;
  color: string;
  done: boolean;
  onPress?: () => void;
};

export type CalendarEventRow = {
  event_id: string;
  time?: string;
  end?: string;
  label: string;
  all_day?: boolean;
};

/** One habit from the plan, placed on the grid at the minute its reminder fires. */
export type GridTaskRow = {
  key: string;
  time: string;
  duration_minutes?: number;
  title: string;
  color: string;
  done: boolean;
  onPress?: () => void;
};

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

const NEUTRAL_WASH = 'rgba(17,17,19,0.045)';
const NEUTRAL_RULE = 'rgba(17,17,19,0.22)';

function buildBands(
  day: DayShape,
  obligations: Obligation[],
  scope: Scope,
  onEditShape: (focus: ShapeFocus) => void,
  onEditObligation?: (index: number) => void,
  calendarEvents: CalendarEventRow[] = [],
): Band[] {
  const bands: Band[] = [];
  const span = (s: number, e: number, min = 25) => (e <= s ? s + min : e);

  {
    const w = day.wakeWindow;
    const s = toMin(w[0]);
    bands.push({
      key: 'wake', start: s, end: span(s, toMin(w[1])), label: 'Wake',
      detail: isExact(w) ? undefined : `${fmt12Compact(w[0])} – ${fmt12Compact(w[1])}`,
      accent: NEUTRAL_RULE, wash: NEUTRAL_WASH, onPress: () => onEditShape('wake'),
    });
  }
  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    bands.push({
      key: 'ready', start: toMin(gr[0]), end: span(toMin(gr[0]), toMin(gr[1])),
      label: 'Get ready', accent: NEUTRAL_RULE, wash: NEUTRAL_WASH, onPress: () => onEditShape('ready'),
    });
  }
  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i }))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    const s = toMin(o.start);
    const e = span(s, toMin(o.end), 30);
    bands.push({
      key: `ob-${i}-${o.start}`, start: s, end: e, label: o.label,
      detail: `${fmt12Compact(min2hhmm(s))} – ${fmt12Compact(min2hhmm(e))}`,
      accent: NEUTRAL_RULE, wash: NEUTRAL_WASH,
      onPress: onEditObligation && i >= 0 ? () => onEditObligation(i) : undefined,
    });
  }
  for (const ev of calendarEvents) {
    if (ev.all_day || !ev.time) continue; // all-day events are shown as a pill above the grid
    const s = toMin(ev.time);
    const e = span(s, ev.end ? toMin(ev.end) : s + 30, 30);
    bands.push({
      key: `cal-${ev.event_id}`, start: s, end: e, label: ev.label,
      detail: `${fmt12Compact(min2hhmm(s))} – ${fmt12Compact(min2hhmm(e))}`,
      accent: CAL_ACCENT, wash: 'rgba(91,107,138,0.07)', icon: 'calendar',
    });
  }
  if (day.workoutWindow) {
    const ww = day.workoutWindow;
    bands.push({
      key: 'workout', start: toMin(ww[0]), end: span(toMin(ww[0]), toMin(ww[1])),
      label: 'Workout', detail: 'Max fits your session here',
      accent: WORKOUT_ACCENT, wash: 'rgba(47,107,78,0.07)', onPress: () => onEditShape('workout'),
    });
  }
  {
    const sw = day.sleepWindow;
    const s = toMin(sw[0]);
    bands.push({
      key: 'sleep', start: s, end: span(s, toMin(sw[1])), label: 'Wind down',
      detail: `Bed by ${fmt12Compact(isExact(sw) ? sw[0] : sw[1])}`,
      accent: NEUTRAL_RULE, wash: NEUTRAL_WASH, onPress: () => onEditShape('sleep'),
    });
  }

  bands.sort((a, b) => a.start - b.start || a.end - b.end);
  // De-dupe identical items (presentation only) — e.g. a "Commute" that
  // resolves into two side-by-side twins. Same label+start+end = one band.
  const seen = new Set<string>();
  return bands.filter((b) => {
    const sig = `${b.label.trim().toLowerCase()}|${b.start}|${b.end}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

function buildCards(tasks: GridTaskRow[]): Card[] {
  const out: Card[] = [];
  for (const t of tasks) {
    if (!t.time || !/^\d{1,2}:\d{2}$/.test(t.time)) continue;
    out.push({
      key: t.key,
      start: toMin(t.time),
      minutes: Math.max(1, Math.round(Number(t.duration_minutes) || 0) || 5),
      title: t.title,
      color: t.color,
      done: t.done,
      onPress: t.onPress,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

export default function ScheduleGrid({
  day, obligations, scope, onEditShape, onEditObligation, onAddAt, isToday = false, calendarEvents = [], tasks = [],
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
  /** The plan's habits for this date; a tap opens the habit. */
  tasks?: GridTaskRow[];
}) {
  const bands = buildBands(day, obligations, scope, onEditShape, onEditObligation, calendarEvents);
  const cards = buildCards(tasks);

  // Live "now" — only ticks while viewing today (keeps the indicator current).
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    if (!isToday) return;
    setNow(nowMinutes());
    const id = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  if (bands.length === 0 && cards.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>No times set for this day yet.</Text>
      </View>
    );
  }

  // The axis runs from the first whole hour anything starts to the hour after
  // the last thing ends — every hour at full scale, so a 5-minute habit lands
  // where the eye expects it.
  const spans = [...bands, ...cards.map((c) => ({ start: c.start, end: c.start + c.minutes }))];
  const minStart = Math.min(...spans.map((e) => e.start));
  const maxEnd = Math.max(...spans.map((e) => e.end));
  const startHour = Math.floor(minStart / 60);
  const endHour = Math.ceil(maxEnd / 60);
  const gridStart = startHour * 60;
  const gridEnd = Math.max(endHour * 60, gridStart + 60);
  const axisHeight = TOP_PAD + (gridEnd - gridStart) * PX_PER_MIN;
  const yOf = (min: number) => TOP_PAD + (Math.min(Math.max(min, gridStart), gridEnd) - gridStart) * PX_PER_MIN;
  const minAtY = (y: number) => gridStart + Math.max(0, y - TOP_PAD) / PX_PER_MIN;

  // Band geometry + the one-line label zone at the top of each band.
  const bandRects = bands.map((b) => {
    const top = yOf(b.start);
    return { b, top, bottom: Math.max(yOf(b.end), top + BAND_MIN_H) };
  });

  // Stack the habit cards: each one sits at its minute — nudged just past a
  // band's label line when it would start on top of it — unless the previous
  // card is still in the way, in which case it tucks below that.
  let prevBottom = -Infinity;
  const placed = cards.map((c) => {
    let top = yOf(c.start);
    for (const r of bandRects) {
      if (top >= r.top - 1 && top < r.top + LABEL_H + 2) top = r.top + LABEL_H + 2;
    }
    top = Math.max(top, prevBottom + CARD_GAP);
    const h = Math.max(CARD_MIN_H, c.minutes * PX_PER_MIN);
    prevBottom = top + h;
    return { c, top, h };
  });

  // Band labels never hide under a card: start at the band's top line, slide
  // down past whatever covers it, else sit just under (or above) the band.
  const occupied: { top: number; bottom: number }[] = placed.map((p) => ({ top: p.top, bottom: p.top + p.h }));
  const free = (y: number) => y >= 0 && !occupied.some((r) => r.top < y + LABEL_H && r.bottom > y);
  const labelY = new Map<string, number>();
  const gutterY = new Map<string, number>();   // last resort: the band's name beside the hour axis
  for (const { b, top, bottom } of bandRects) {
    let y = top;
    for (let guard = 0; guard < 24 && y + LABEL_H <= bottom && !free(y); guard++) {
      y = Math.max(...occupied.filter((r) => r.top < y + LABEL_H && r.bottom > y).map((r) => r.bottom)) + 2;
    }
    let chosen: number | null = y + LABEL_H <= bottom && free(y) ? y : null;
    if (chosen === null && free(bottom + 2)) chosen = bottom + 2;
    if (chosen === null && free(top - LABEL_H - 2)) chosen = top - LABEL_H - 2;
    if (chosen !== null) {
      labelY.set(b.key, chosen);
      occupied.push({ top: chosen, bottom: chosen + LABEL_H });
    } else {
      gutterY.set(b.key, top + 9);
    }
  }
  const gridHeight = Math.max(axisHeight, prevBottom + CARD_GAP, ...Array.from(labelY.values()).map((y) => y + LABEL_H)) + BOTTOM_PAD;
  const showNow = isToday && now >= gridStart && now <= gridEnd;

  return (
    <View style={styles.wrap}>
      <View style={[styles.grid, { height: gridHeight }]}>
        {/* Bottom layer: tapping empty space adds a commitment at that time.
            Bands and cards sit above and win their own touches; hour labels
            and the now-line are pointerEvents:none, so only true gaps land here. */}
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

        {/* Hour lines + labels — every hour, so the first is anchored. */}
        {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
          const h = startHour + i;
          return (
            <View key={`h-${h}`} pointerEvents="none" style={[styles.hourRow, { top: yOf(h * 60) }]}>
              <Text style={styles.hourLabel}>{hourLabel(h)}</Text>
              <View style={styles.hourLine} />
            </View>
          );
        })}

        {/* Structure bands — the shape of the day, quiet and full width. */}
        <View pointerEvents="box-none" style={styles.lane}>
          {bandRects.map(({ b, top, bottom }) => {
            const past = isToday && b.end <= now;
            return (
              <View key={b.key} pointerEvents="box-none" style={{ position: 'absolute', top, height: bottom - top, left: 0, right: 0 }}>
                <TouchableOpacity
                  activeOpacity={b.onPress ? 0.7 : 1}
                  onPress={b.onPress}
                  disabled={!b.onPress}
                  style={[styles.band, { backgroundColor: b.wash }, past && styles.past]}
                  accessibilityRole={b.onPress ? 'button' : undefined}
                  accessibilityLabel={`${b.label}, ${fmt12Compact(min2hhmm(b.start))}`}
                >
                  <View style={[styles.bandRule, { backgroundColor: b.accent }]} />
                </TouchableOpacity>
              </View>
            );
          })}
          {bandRects.map(({ b }) => {
            const y = labelY.get(b.key);
            if (y === undefined) return null;
            const past = isToday && b.end <= now;
            return (
              <View key={`label-${b.key}`} pointerEvents="none" style={[styles.bandText, { top: y }, past && styles.past]}>
                {b.icon === 'calendar' ? (
                  <Ionicons name="calendar-outline" size={11} color={CAL_ACCENT} style={{ marginRight: 4 }} />
                ) : null}
                <Text style={[styles.bandLabel, b.icon === 'calendar' && { color: CAL_ACCENT }]} numberOfLines={1}>
                  {b.label}
                </Text>
                {b.detail ? <Text style={styles.bandDetail} numberOfLines={1}>{`  ${b.detail}`}</Text> : null}
              </View>
            );
          })}
        </View>

        {/* Habit cards — liquid glass, full width, stacked. */}
        <View pointerEvents="box-none" style={styles.lane}>
          {placed.map(({ c, top, h }, idx) => {
            const past = isToday && c.start + c.minutes <= now;
            return (
              <View key={c.key} pointerEvents="box-none" style={[styles.cardFloat, { top, height: h }]}>
                <TouchableOpacity
                  activeOpacity={c.onPress ? 0.8 : 1}
                  onPress={c.onPress}
                  disabled={!c.onPress}
                  style={[styles.card, (past || c.done) && styles.cardSettled]}
                  accessibilityRole={c.onPress ? 'button' : undefined}
                  accessibilityLabel={`${c.title}, ${fmt12Compact(min2hhmm(c.start))}${c.done ? ', done' : ''}`}
                  testID={`planner-task-${c.key}`}
                >
                  <LiquidGlassFill idSuffix={`t${idx}`} corners={false} intensity={64} spec={0.55} />
                  <View style={styles.cardRow}>
                    <View style={[styles.dot, { borderColor: c.color }, c.done && { backgroundColor: c.color }]}>
                      {c.done ? <Ionicons name="checkmark" size={10} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={[styles.cardTitle, c.done && styles.cardTitleDone]} numberOfLines={1}>
                      {c.title}
                    </Text>
                    <Text style={styles.cardTime} numberOfLines={1}>
                      {fmt12Compact(min2hhmm(c.start))}
                      <Text style={styles.cardMinutes}>{`  ${c.minutes} min`}</Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* A band whose label had nowhere to go inside the lane names itself
            in the gutter, under the hour it starts. */}
        {bandRects.map(({ b }) => {
          const y = gutterY.get(b.key);
          if (y === undefined) return null;
          return (
            <View key={`gutter-${b.key}`} pointerEvents="none" style={[styles.gutterCaption, { top: y }]}>
              <Text style={[styles.gutterCaptionText, b.icon === 'calendar' && { color: CAL_ACCENT }]} numberOfLines={2}>
                {b.label.toLowerCase()}
              </Text>
            </View>
          );
        })}

        {/* "Now" indicator — today only: a dot in the gutter + a thin line. */}
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

  lane: { position: 'absolute', left: GUTTER, right: 0, top: 0, bottom: 0 },
  past: { opacity: 0.45 },

  // Structure band: a wash with a 2px rule on its left edge and one small line
  // of text. No box, no shadow — it is the ground the habits sit on.
  band: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-start', overflow: 'hidden',
    borderRadius: 8, borderCurve: 'continuous', marginRight: 6, marginBottom: 2,
  },
  bandRule: { width: 2, alignSelf: 'stretch', marginVertical: 3, borderRadius: 1 },
  bandText: {
    position: 'absolute', left: 11, right: 8, height: LABEL_H,
    flexDirection: 'row', alignItems: 'center', minWidth: 0,
  },
  bandLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary, letterSpacing: -0.1, flexShrink: 1 },
  bandDetail: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'], flexShrink: 1 },

  // Habit card: glass, one line, full width. The float shadow lives on the
  // un-clipped wrapper; the clip owns the corner + border.
  cardFloat: {
    position: 'absolute', left: CARD_INSET, right: 6,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  card: {
    flex: 1, overflow: 'hidden', justifyContent: 'center',
    borderRadius: CARD_RADIUS, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  cardSettled: { opacity: 0.6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, minWidth: 0, fontFamily: fonts.sansMedium, fontSize: 14, color: INK, letterSpacing: -0.15 },
  cardTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  cardTime: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  cardMinutes: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },

  gutterCaption: { position: 'absolute', left: 0, width: GUTTER - 8 },
  gutterCaptionText: { fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 12, color: colors.textMuted, letterSpacing: 0.1 },

  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: NOW_ACCENT, marginLeft: GUTTER - 7 },
  nowLine: { flex: 1, height: 1.5, backgroundColor: NOW_ACCENT, opacity: 0.9, marginRight: 6 },
});
