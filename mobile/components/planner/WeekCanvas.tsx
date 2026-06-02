/**
 * WeekCanvas — the whole week as a Google-Calendar-style grid.
 *
 * Hours run DOWN the left gutter; the seven weekdays are COLUMNS across the
 * top, exactly like Google Calendar's week view. The time axis spans one full
 * day (4 AM → 4 AM next day) so a late bedtime stays in one piece at the bottom
 * of the column instead of being split across midnight. Faint hour gridlines
 * cross every column, a red line marks the current time, and today's column is
 * tinted — the same cues you read on a real calendar.
 *
 * Every mark is a REAL thing the schedule tracks:
 *   • a flat "asleep" wash fills the top and bottom of each column (the night),
 *   • softer washes sit over the wake & sleep RANGES; the clear band between
 *     them is the awake window the AI builds around,
 *   • flat blocks for the fixed things: each commitment (work, class, commute…)
 *     in graphite, your workout window in green, get-ready as a small tick.
 *
 * This is a recurring WEEKLY template, not a dated week — so the header shows
 * weekday letters, and "Typical day" up top sets every day at once. Tap a single
 * column to tweak just that weekday; a dot under its letter means it differs
 * from the typical day. Editing rewrites onboarding, which regenerates every Max
 * schedule, so what you see is exactly what the AI plans around.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import {
  DayShape,
  Obligation,
  Scope,
  Weekday,
  WEEKDAYS,
  normCanvas,
  effectiveDay,
  hasOverride,
  obligationsForDay,
  obligationColor,
} from './plannerModel';

const TIME_GUTTER = 42; // left column carrying the hour labels
const HEADER_H = 40; // weekday header row
const GRID_H = 580; // full 4 AM → 4 AM grid height (~24px / hour)
const COL_GAP_INSET = 1.5; // horizontal inset so blocks don't touch column edges
const BLOCK_RADIUS = 3;

// Hour labels down the side. Positions are resolved through normCanvas so they
// line up with the gridlines (4 AM sits at the top, 4 AM again at the bottom).
const HOUR_LABELS: { t: string; label: string }[] = [
  { t: '06:00', label: '6 AM' },
  { t: '09:00', label: '9 AM' },
  { t: '12:00', label: 'Noon' },
  { t: '15:00', label: '3 PM' },
  { t: '18:00', label: '6 PM' },
  { t: '21:00', label: '9 PM' },
  { t: '00:00', label: '12 AM' },
  { t: '03:00', label: '3 AM' },
];

// Event palette — mirrors the editor's slider accents. Commitments are
// graphite, get-ready a mid-grey tick, and the single green accent is reserved
// for your workout (a thing you actively add).
const WORKOUT = '#2F6B4E';
const READY = '#5A5A62';
const OBLIG = '#34343B'; // matches obligationColor
const SLEEP_INK = '#6E6E76';
const NOW = '#EA4335'; // the calendar's current-time line

// Washes — value (not hue) separates asleep (darkest) from the wake/sleep
// ranges from the clear awake band in the middle (your free time).
const ASLEEP = 'rgba(17,17,19,0.055)';
const WAKE_BUF = 'rgba(17,17,19,0.025)';
const SLEEP_BUF = 'rgba(17,17,19,0.042)';
const TODAY_TINT = 'rgba(47,107,78,0.045)';

type IconName = keyof typeof Ionicons.glyphMap;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const yPx = (t: string) => clamp01(normCanvas(t)) * GRID_H;

type Seg = { top: number; height: number } | null;

/** A clamped {top,height} px pair along the vertical day axis, or null when too thin. */
function seg(startFrac: number, lenFrac: number, minFrac = 0.004): Seg {
  const top = clamp01(startFrac);
  const h = clamp01(Math.min(lenFrac, 1 - top));
  return h <= minFrac ? null : { top: top * GRID_H, height: h * GRID_H };
}

function washesFor(d: DayShape): {
  asleepTop: Seg;
  asleepBottom: Seg;
  wakeBuf: Seg;
  sleepBuf: Seg;
  moon: Seg;
} {
  const wakeE = normCanvas(d.wakeWindow[0]);
  const wakeL = normCanvas(d.wakeWindow[1]);
  const sleepE = normCanvas(d.sleepWindow[0]);
  const sleepL = normCanvas(d.sleepWindow[1]);

  const asleepTop = seg(0, wakeE);
  const asleepBottom = seg(sleepL, 1 - sleepL);
  const wakeBuf = seg(wakeE, wakeL - wakeE);
  const sleepBuf = seg(sleepE, sleepL - sleepE);

  // Park the moon on the taller of the two night blocks (if it's tall enough).
  const candidates = [asleepTop, asleepBottom].filter(Boolean) as { top: number; height: number }[];
  candidates.sort((a, b) => b.height - a.height);
  const moon = candidates[0] && candidates[0].height > 44 ? candidates[0] : null;
  return { asleepTop, asleepBottom, wakeBuf, sleepBuf, moon };
}

type Block = { top: number; height: number; color: string; icon?: IconName };

function blocksFor(d: DayShape, obs: Obligation[]): Block[] {
  const out: Block[] = [];
  const add = (startFrac: number, lenFrac: number, color: string, icon?: IconName) => {
    const s = seg(startFrac, lenFrac, 0.006);
    if (s) out.push({ ...s, color, icon });
  };
  // Commitments (work, classes, commute…), graphite.
  for (const o of obs) {
    const l = normCanvas(o.start);
    add(l, normCanvas(o.end) - l, obligationColor(o.label));
  }
  // Get-ready — a small fixed tick around the chosen time.
  if (d.getReadyTime) {
    const c = normCanvas(d.getReadyTime);
    add(c - 0.012, 0.024, READY, 'water');
  }
  // Workout WINDOW (default-level) — drawn on every column, the green accent.
  if (d.workoutWindow) {
    const l = normCanvas(d.workoutWindow[0]);
    add(l, normCanvas(d.workoutWindow[1]) - l, WORKOUT, 'barbell');
  }
  return out;
}

function DayColumn({
  day,
  obligations,
  isToday,
  isLast,
  onPress,
}: {
  day: DayShape;
  obligations: Obligation[];
  isToday: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const { asleepTop, asleepBottom, wakeBuf, sleepBuf, moon } = washesFor(day);
  const blocks = blocksFor(day, obligations);

  const washStyle = (s: Seg, bg: string) =>
    s ? (
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: s.top, height: s.height, backgroundColor: bg }}
      />
    ) : null;

  return (
    <TouchableOpacity
      style={[styles.col, !isLast && styles.colBorder, isToday && styles.colToday]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      {/* Night washes at the top and bottom edges. */}
      {washStyle(asleepTop, ASLEEP)}
      {washStyle(asleepBottom, ASLEEP)}
      {/* Soft buffers over the wake / sleep ranges. */}
      {washStyle(wakeBuf, WAKE_BUF)}
      {washStyle(sleepBuf, SLEEP_BUF)}

      {/* A small moon on the long night block. */}
      {moon ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: moon.top, height: moon.height, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="moon" size={11} color={SLEEP_INK} style={{ opacity: 0.45 }} />
        </View>
      ) : null}

      {/* Calendar blocks for the fixed, tracked things. */}
      {blocks.map((b, i) => (
        <View
          key={`b${i}`}
          pointerEvents="none"
          style={[
            styles.block,
            { top: b.top, height: Math.max(b.height, 6), backgroundColor: b.color },
          ]}
        >
          {b.icon && b.height >= 20 ? <Ionicons name={b.icon} size={10} color="#fff" /> : null}
        </View>
      ))}
    </TouchableOpacity>
  );
}

function LegendSwatch({ color, sleep }: { color?: string; sleep?: boolean }) {
  if (sleep) return <View style={[styles.legendSwatch, styles.legendSleep]} />;
  return <View style={[styles.legendSwatch, { backgroundColor: color }]} />;
}

export default function WeekCanvas({
  defaults,
  weekly,
  obligations,
  onEditScope,
}: {
  defaults: DayShape;
  weekly: Partial<Record<Weekday, Partial<DayShape>>>;
  obligations: Obligation[];
  onEditScope: (scope: Scope) => void;
}) {
  // Today's weekday in our Mon-first order (JS getDay is Sun-first).
  const todayIdx = (new Date().getDay() + 6) % 7;

  // Current-time line, mapped onto the 4 AM → 4 AM axis.
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nowTop = yPx(nowStr);

  // Faint gridline every hour (labels only land on the 3-hour marks).
  const hourLines: number[] = [];
  for (let off = 0; off <= 1440; off += 60) hourLines.push((off / 1440) * GRID_H);

  return (
    <View style={styles.wrap}>
      {/* Typical-day strip — sets all seven days at once (the recurring base). */}
      <TouchableOpacity style={styles.typicalStrip} activeOpacity={0.7} onPress={() => onEditScope('all')}>
        <View style={styles.typicalIcon}>
          <Ionicons name="repeat" size={15} color={colors.foreground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.typicalTitle}>Typical day</Text>
          <Text style={styles.typicalSub}>Sets all 7 days. Tap a single day to change just that one.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Weekday header row. */}
      <View style={styles.headerRow}>
        <View style={{ width: TIME_GUTTER }} />
        {WEEKDAYS.map((w, i) => {
          const isToday = i === todayIdx;
          const overridden = hasOverride(weekly, w.key);
          return (
            <TouchableOpacity
              key={w.key}
              style={styles.dayHead}
              activeOpacity={0.6}
              onPress={() => onEditScope(w.key)}
            >
              <View style={[styles.dayHeadPill, isToday && styles.dayHeadPillToday]}>
                <Text style={[styles.dayHeadText, isToday && styles.dayHeadTextToday]}>{w.letter}</Text>
              </View>
              {overridden ? <View style={styles.overrideDot} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Grid body: hour gutter + the seven columns, hour lines crossing both. */}
      <View style={styles.gridBody}>
        {/* Hour labels in the gutter. */}
        <View style={{ width: TIME_GUTTER, height: GRID_H }}>
          {HOUR_LABELS.map((m) => (
            <Text key={m.t} style={[styles.hourLabel, { top: yPx(m.t) - 6 }]}>
              {m.label}
            </Text>
          ))}
        </View>

        {/* Columns area, with gridlines + now-line behind / over the columns. */}
        <View style={styles.colsWrap}>
          {hourLines.map((top, i) => (
            <View key={`h${i}`} pointerEvents="none" style={[styles.hLine, { top }]} />
          ))}

          <View style={styles.colsRow}>
            {WEEKDAYS.map((w, i) => (
              <DayColumn
                key={w.key}
                day={effectiveDay(defaults, weekly, w.key)}
                obligations={obligationsForDay(obligations, w.key)}
                isToday={i === todayIdx}
                isLast={i === WEEKDAYS.length - 1}
                onPress={() => onEditScope(w.key)}
              />
            ))}
          </View>

          {/* Current-time line, spanning every column like Google Calendar. */}
          <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
            <View style={styles.nowDot} />
          </View>
        </View>
      </View>

      {/* Legend. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <LegendSwatch sleep />
          <Text style={styles.legendText}>asleep</Text>
        </View>
        <View style={styles.legendItem}>
          <LegendSwatch color={OBLIG} />
          <Text style={styles.legendText}>commitment</Text>
        </View>
        <View style={styles.legendItem}>
          <LegendSwatch color={WORKOUT} />
          <Text style={styles.legendText}>workout</Text>
        </View>
        <View style={styles.legendItem}>
          <LegendSwatch color={READY} />
          <Text style={styles.legendText}>get ready</Text>
        </View>
      </View>

      <Text style={styles.footnote}>
        The clear band is your free time — Max fits skin, hair, mewing and training there. Change a
        day and your Max plans move with it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },

  // Typical-day strip.
  typicalStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  typicalIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  typicalTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.foreground, letterSpacing: 0.1 },
  typicalSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, lineHeight: 16, marginTop: 2 },

  // Header.
  headerRow: { flexDirection: 'row', alignItems: 'center', height: HEADER_H },
  dayHead: { flex: 1, alignItems: 'center', justifyContent: 'center', height: HEADER_H },
  dayHeadPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeadPillToday: { backgroundColor: WORKOUT },
  dayHeadText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 0.2 },
  dayHeadTextToday: { color: '#fff' },
  overrideDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.foreground,
  },

  // Grid.
  gridBody: {
    flexDirection: 'row',
    height: GRID_H,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  hourLabel: {
    position: 'absolute',
    right: 6,
    width: TIME_GUTTER - 8,
    textAlign: 'right',
    fontFamily: fonts.sansMedium,
    fontSize: 9.5,
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  colsWrap: { flex: 1, height: GRID_H, position: 'relative' },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  colsRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  col: { flex: 1, height: GRID_H, position: 'relative', overflow: 'hidden' },
  colBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  colToday: { backgroundColor: TODAY_TINT },
  block: {
    position: 'absolute',
    left: COL_GAP_INSET,
    right: COL_GAP_INSET,
    borderRadius: BLOCK_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: NOW,
  },
  nowDot: {
    position: 'absolute',
    left: -3,
    top: -2.75,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: NOW,
  },

  // Legend.
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 8,
    columnGap: 14,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: 3 },
  legendSleep: {
    backgroundColor: 'rgba(17,17,19,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,19,0.22)',
  },
  legendText: { fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.2 },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    letterSpacing: 0.1,
    marginTop: spacing.md,
  },
});
