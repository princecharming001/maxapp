/**
 * ScheduleGrid — the day on a time axis, the way a calendar draws it.
 *
 *   • BLOCKS: commitments and calendar events fill their real span (a 9–5
 *     job is eight hours tall), tinted like calendar events with the name at
 *     the top-left; the day's own shape (wake, get ready, workout window,
 *     wind down) is drawn the same way in a lighter tint.
 *   • HABITS: the plan's tasks as liquid-glass cards laid OVER the blocks at
 *     the minute their reminder fires, cascaded in from the left like an
 *     overlapping calendar event so the block underneath stays legible. Cards
 *     stack (a card tucks below the previous one when they would collide) so
 *     every title reads in full; long titles wrap to a second line. A block's
 *     name never hides under a card: cards start below it, and if a card
 *     from earlier still covers it, the name slides to the next free line.
 *
 * One type family throughout. On today only: a live "now" line, and past
 * items are dimmed.
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
const NEUTRAL_ACCENT = 'rgba(17,17,19,0.28)';
const SHAPE_WASH = 'rgba(17,17,19,0.035)';      // wake / get ready / wind down
const COMMIT_WASH = 'rgba(17,17,19,0.07)';      // a commitment (work, class)
const WORKOUT_WASH = 'rgba(47,107,78,0.10)';
const CAL_WASH = 'rgba(91,107,138,0.12)';

const HOUR_H = 56;                 // pixels per hour
const PX_PER_MIN = HOUR_H / 60;
const GUTTER = 58;                 // time-label column width ("12 PM")
const TOP_PAD = 6;
const BOTTOM_PAD = 12;

const ROW_GAP = 4;                 // between stacked rows
const CARD_H = 42;                 // one-line habit card
const CARD_H_TALL = 60;            // two-line habit card (long title)
const TITLE_WRAP_AT = 26;          // characters — beyond this a title gets two lines
const CARD_RADIUS = 14;
const CARD_INSET = 14;             // habit cards cascade in from the block's left edge
const BLOCK_LABEL_H = 24;          // the name line at the top of a block
const BLOCK_MIN_H = BLOCK_LABEL_H + 4;

type Span = {
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

type Row = { key: string; start: number; h: number; card: Card; tall: boolean };

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

function range(s: number, e: number): string {
  return `${fmt12Compact(min2hhmm(s))} – ${fmt12Compact(min2hhmm(e))}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function buildSpans(
  day: DayShape,
  obligations: Obligation[],
  scope: Scope,
  onEditShape: (focus: ShapeFocus) => void,
  onEditObligation?: (index: number) => void,
  calendarEvents: CalendarEventRow[] = [],
): Span[] {
  const spans: Span[] = [];
  const endOf = (s: number, e: number, min = 25) => (e <= s ? s + min : e);

  {
    const w = day.wakeWindow;
    const s = toMin(w[0]);
    spans.push({
      key: 'wake', start: s, end: endOf(s, toMin(w[1])), label: 'Wake',
      detail: isExact(w) ? fmt12Compact(w[0]) : range(s, toMin(w[1])),
      accent: NEUTRAL_ACCENT, wash: SHAPE_WASH, onPress: () => onEditShape('wake'),
    });
  }
  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    const s = toMin(gr[0]);
    spans.push({
      key: 'ready', start: s, end: endOf(s, toMin(gr[1])), label: 'Get ready',
      detail: range(s, endOf(s, toMin(gr[1]))), accent: NEUTRAL_ACCENT, wash: SHAPE_WASH, onPress: () => onEditShape('ready'),
    });
  }
  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i }))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    const s = toMin(o.start);
    const e = endOf(s, toMin(o.end), 30);
    spans.push({
      key: `ob-${i}-${o.start}`, start: s, end: e, label: o.label, detail: range(s, e),
      accent: 'rgba(17,17,19,0.55)', wash: COMMIT_WASH,
      onPress: onEditObligation && i >= 0 ? () => onEditObligation(i) : undefined,
    });
  }
  for (const ev of calendarEvents) {
    if (ev.all_day || !ev.time) continue; // all-day events are shown as a pill above the grid
    const s = toMin(ev.time);
    const e = endOf(s, ev.end ? toMin(ev.end) : s + 30, 30);
    spans.push({
      key: `cal-${ev.event_id}`, start: s, end: e, label: ev.label, detail: range(s, e),
      accent: CAL_ACCENT, wash: CAL_WASH, icon: 'calendar',
    });
  }
  if (day.workoutWindow) {
    const ww = day.workoutWindow;
    const s = toMin(ww[0]);
    spans.push({
      key: 'workout', start: s, end: endOf(s, toMin(ww[1])), label: 'Workout window',
      detail: range(s, endOf(s, toMin(ww[1]))), accent: WORKOUT_ACCENT, wash: WORKOUT_WASH, onPress: () => onEditShape('workout'),
    });
  }
  {
    const sw = day.sleepWindow;
    const s = toMin(sw[0]);
    spans.push({
      key: 'sleep', start: s, end: endOf(s, toMin(sw[1])), label: 'Wind down',
      detail: `bed by ${fmt12Compact(isExact(sw) ? sw[0] : sw[1])}`,
      accent: NEUTRAL_ACCENT, wash: SHAPE_WASH, onPress: () => onEditShape('sleep'),
    });
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  // De-dupe identical items (presentation only) — e.g. a "Commute" that
  // resolves into two side-by-side twins. Same label+start+end = one span.
  const seen = new Set<string>();
  return spans.filter((sp) => {
    const sig = `${sp.label.trim().toLowerCase()}|${sp.start}|${sp.end}`;
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
  const spans = buildSpans(day, obligations, scope, onEditShape, onEditObligation, calendarEvents);
  const cards = buildCards(tasks);

  // Live "now" — only ticks while viewing today (keeps the indicator current).
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    if (!isToday) return;
    setNow(nowMinutes());
    const id = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  if (spans.length === 0 && cards.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>No times set for this day yet.</Text>
      </View>
    );
  }

  // The axis runs from the first whole hour anything starts to the hour after
  // the last thing ends — every hour at full scale.
  const extents = [...spans, ...cards.map((c) => ({ start: c.start, end: c.start + c.minutes }))];
  const minStart = Math.min(...extents.map((e) => e.start));
  const maxEnd = Math.max(...extents.map((e) => e.end));
  const startHour = Math.floor(minStart / 60);
  const endHour = Math.ceil(maxEnd / 60);
  const gridStart = startHour * 60;
  const gridEnd = Math.max(endHour * 60, gridStart + 60);
  const axisHeight = TOP_PAD + (gridEnd - gridStart) * PX_PER_MIN;
  const yOf = (min: number) => TOP_PAD + (Math.min(Math.max(min, gridStart), gridEnd) - gridStart) * PX_PER_MIN;
  const minAtY = (y: number) => gridStart + Math.max(0, y - TOP_PAD) / PX_PER_MIN;

  // Blocks fill their real span; the name line sits at their top.
  const blocks = spans.map((sp) => {
    const top = yOf(sp.start);
    return { sp, top, bottom: Math.max(yOf(sp.end), top + BLOCK_MIN_H) };
  });

  // Habit cards: at their minute, nudged just past a block's name line when
  // they would start on it, and tucked below the previous card when the two
  // would collide.
  const rows: Row[] = cards.map((c) => {
    const tall = c.title.length > TITLE_WRAP_AT;
    return { key: `card-${c.key}`, start: c.start, h: tall ? CARD_H_TALL : CARD_H, card: c, tall };
  });
  let prevBottom = -Infinity;
  const placed = rows.map((r) => {
    let top = yOf(r.start);
    for (const b of blocks) {
      if (top >= b.top - 1 && top < b.top + BLOCK_LABEL_H + 2) top = b.top + BLOCK_LABEL_H + 2;
    }
    top = Math.max(top, prevBottom + ROW_GAP);
    prevBottom = top + r.h;
    return { r, top };
  });

  // A block's name never hides under a card: start on the block's top line,
  // slide down past whatever covers it, else sit just under (or above) it.
  const occupied: { top: number; bottom: number }[] = placed.map((p) => ({ top: p.top, bottom: p.top + p.r.h }));
  const free = (y: number) => y >= 0 && !occupied.some((o) => o.top < y + BLOCK_LABEL_H && o.bottom > y);
  const labelY = new Map<string, number>();
  const gutterY = new Map<string, number>();   // last resort: the block names itself beside the hour axis
  for (const { sp, top, bottom } of blocks) {
    let y = top;
    for (let guard = 0; guard < 24 && y + BLOCK_LABEL_H <= bottom && !free(y); guard++) {
      y = Math.max(...occupied.filter((o) => o.top < y + BLOCK_LABEL_H && o.bottom > y).map((o) => o.bottom)) + 2;
    }
    let chosen: number | null = y + BLOCK_LABEL_H <= bottom && free(y) ? y : null;
    if (chosen === null && free(bottom + 2)) chosen = bottom + 2;
    if (chosen === null && free(top - BLOCK_LABEL_H - 2)) chosen = top - BLOCK_LABEL_H - 2;
    if (chosen !== null) {
      labelY.set(sp.key, chosen);
      occupied.push({ top: chosen, bottom: chosen + BLOCK_LABEL_H });
    } else {
      gutterY.set(sp.key, top + 9);
    }
  }
  const gridHeight = Math.max(axisHeight, prevBottom + ROW_GAP, ...blocks.map((b) => b.bottom), ...Array.from(labelY.values()).map((y) => y + BLOCK_LABEL_H)) + BOTTOM_PAD;
  const showNow = isToday && now >= gridStart && now <= gridEnd;

  return (
    <View style={styles.wrap}>
      <View style={[styles.grid, { height: gridHeight }]}>
        {/* Bottom layer: tapping empty space adds a commitment at that time.
            Rows sit above and win their own touches; hour labels and the
            now-line are pointerEvents:none, so only true gaps land here. */}
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

        {/* Blocks — commitments, calendar events and the day's shape, at
            their real size, the way a calendar draws an event. */}
        <View pointerEvents="box-none" style={styles.lane}>
          {blocks.map(({ sp, top, bottom }) => {
            const past = isToday && sp.end <= now;
            return (
              <View key={`block-${sp.key}`} pointerEvents="box-none" style={[styles.rowFloat, { top, height: bottom - top }]}>
                <TouchableOpacity
                  activeOpacity={sp.onPress ? 0.7 : 1}
                  onPress={sp.onPress}
                  disabled={!sp.onPress}
                  style={[styles.block, { backgroundColor: sp.wash }, past && styles.past]}
                  accessibilityRole={sp.onPress ? 'button' : undefined}
                  accessibilityLabel={`${sp.label}, ${sp.detail ?? fmt12Compact(min2hhmm(sp.start))}`}
                >
                  <View style={[styles.blockEdge, { backgroundColor: sp.accent }]} />
                </TouchableOpacity>
              </View>
            );
          })}
          {blocks.map(({ sp }) => {
            const y = labelY.get(sp.key);
            if (y === undefined) return null;
            const past = isToday && sp.end <= now;
            return (
              <View key={`name-${sp.key}`} pointerEvents="none" style={[styles.blockName, { top: y }, past && styles.past]}>
                {sp.icon === 'calendar' ? (
                  <Ionicons name="calendar-outline" size={11} color={CAL_ACCENT} style={{ marginRight: 4 }} />
                ) : null}
                <Text style={[styles.blockLabel, sp.icon === 'calendar' && { color: CAL_ACCENT }]} numberOfLines={1}>
                  {sp.label}
                </Text>
                {sp.detail ? <Text style={styles.blockDetail} numberOfLines={1}>{`  ${sp.detail}`}</Text> : null}
              </View>
            );
          })}
        </View>

        {/* Habit cards — liquid glass, laid over the blocks, cascaded in from the left. */}
        <View pointerEvents="box-none" style={styles.lane}>
          {placed.map(({ r, top }, idx) => {
            const c = r.card;
            const past = isToday && c.start + c.minutes <= now;
            return (
              <View key={r.key} pointerEvents="box-none" style={[styles.cardFloat, { top, height: r.h }]}>
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
                    <Text style={[styles.cardTitle, c.done && styles.cardTitleDone]} numberOfLines={r.tall ? 2 : 1}>
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

        {/* A block whose name had nowhere to go names itself in the gutter,
            under the hour it starts. */}
        {blocks.map(({ sp }) => {
          const y = gutterY.get(sp.key);
          if (y === undefined) return null;
          return (
            <View key={`gutter-${sp.key}`} pointerEvents="none" style={[styles.gutterCaption, { top: y }]}>
              <Text style={[styles.gutterCaptionText, sp.icon === 'calendar' && { color: CAL_ACCENT }]} numberOfLines={2}>
                {sp.label.toLowerCase()}
              </Text>
            </View>
          );
        })}

        {/* "Now" indicator — today only: a dot at the axis + a thin line. */}
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
  rowFloat: { position: 'absolute', left: 0, right: 6 },
  cardFloat: { position: 'absolute', left: CARD_INSET, right: 6 },
  past: { opacity: 0.45 },

  // A block: tinted like a calendar event, with a 3px edge in its colour and
  // its name on the top line (drawn separately so it can dodge a card).
  block: {
    flex: 1, flexDirection: 'row', overflow: 'hidden',
    borderRadius: 10, borderCurve: 'continuous', marginBottom: 2,
  },
  blockEdge: { width: 3, alignSelf: 'stretch' },
  blockName: {
    position: 'absolute', left: 12, right: 10, height: BLOCK_LABEL_H,
    flexDirection: 'row', alignItems: 'center', minWidth: 0,
  },
  blockLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.textPrimary, letterSpacing: -0.1, flexShrink: 1 },
  blockDetail: { fontFamily: fonts.sans, fontSize: 12, color: colors.textSecondary, fontVariant: ['tabular-nums'], flexShrink: 1 },

  // Habit card: glass, full width, one or two lines. The clip owns the corner
  // + border; the soft float shadow is on it too (the fill is absolute inside).
  card: {
    flex: 1, overflow: 'hidden', justifyContent: 'center',
    borderRadius: CARD_RADIUS, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.09)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardSettled: { opacity: 0.6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 9 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, minWidth: 0, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 18, color: INK, letterSpacing: -0.15 },
  cardTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  cardTime: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  cardMinutes: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },

  gutterCaption: { position: 'absolute', left: 0, width: GUTTER - 8 },
  gutterCaptionText: { fontFamily: fonts.sans, fontSize: 10.5, lineHeight: 12, color: colors.textMuted, letterSpacing: 0.1 },

  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: NOW_ACCENT, marginLeft: GUTTER - 7 },
  nowLine: { flex: 1, height: 1.5, backgroundColor: NOW_ACCENT, opacity: 0.9, marginRight: 6 },
});
