/**
 * WeekCanvas — the whole week at a glance, as a calendar-style board.
 *
 * No tab-switching: every day is its own lane, all visible together on one
 * shared time axis (4 AM → 4 AM, so late bedtimes sit naturally on the right).
 * Every mark is a REAL thing the schedule tracks:
 *
 *   • a flat "asleep" wash sits over each night edge (a moon marks the long one),
 *   • fainter washes sit over the wake & sleep RANGES — the open, unwashed core
 *     between them is the "definitely awake" window the AI builds around,
 *   • flat blocks for the fixed things: each commitment (work, class, commute…)
 *     in graphite, your Workout window in green, and Get-ready as a small tick.
 *
 * Obligations are day-scoped: a weekday lane shows only the commitments that
 * actually land on it, while the "Everyday" base lane shows the ones that recur
 * on every single day. The workout WINDOW is a default-level preference, so it
 * appears on every lane.
 *
 * Editing a lane rewrites onboarding, which regenerates every Max schedule — so
 * what you see is exactly what the AI plans around.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, DimensionValue } from 'react-native';
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

const GUTTER = 46;
const ROW_H = 42;
const ALL_ROW_H = 48;
const LANE_INSET = 3; // top/bottom inset of the day lane within its row
const BLOCK_INSET = 6; // top/bottom inset of an event block within the row
const AXIS_H = 20;
const LANE_RADIUS = 6;
const BLOCK_RADIUS = 4;

// Axis reference marks across the 4 AM → 4 AM window.
const AXIS_MARKS: { t: string; label: string }[] = [
  { t: '06:00', label: '6a' },
  { t: '12:00', label: '12p' },
  { t: '18:00', label: '6p' },
  { t: '00:00', label: '12a' },
];

// A monochrome event palette: commitments are graphite, get-ready a mid-grey
// tick, and the ONE green accent is reserved for your workout. They map 1:1 to
// the editor's slider accents.
const WORKOUT = '#2F6B4E'; // the single green accent — an input you add
const READY = '#5A5A62'; // get-ready tick (mid-graphite)
const OBLIG = '#34343B'; // commitments (graphite) — matches obligationColor
const SLEEP_INK = '#6E6E76'; // neutral grey for the moon / "Sleep" label

// Washes (kept faint so blocks and gridlines read through them). Value, not
// hue, separates asleep (darkest) from the wake/sleep ranges from the open,
// unwashed core in the middle — your free time.
const LANE = 'rgba(17,17,19,0.022)';
const LANE_ALL = 'rgba(17,17,19,0.042)';
const ASLEEP = 'rgba(17,17,19,0.055)';
const WAKE_BUF = 'rgba(17,17,19,0.025)';
const SLEEP_BUF = 'rgba(17,17,19,0.042)';

type IconName = keyof typeof Ionicons.glyphMap;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number): DimensionValue => `${(clamp01(n) * 100).toFixed(3)}%` as DimensionValue;

/** A clamped {left,width} fraction pair, or null when too thin to draw. */
function seg(left: number, width: number, min = 0.0025): { left: number; width: number } | null {
  const l = clamp01(left);
  const w = clamp01(Math.min(width, 1 - l));
  return w <= min ? null : { left: l, width: w };
}

type Seg = { left: number; width: number } | null;

function washesFor(d: DayShape): {
  asleepLeft: Seg;
  asleepRight: Seg;
  wakeBuf: Seg;
  sleepBuf: Seg;
  sleepMark: Seg;
} {
  const wakeE = normCanvas(d.wakeWindow[0]);
  const wakeL = normCanvas(d.wakeWindow[1]);
  const sleepE = normCanvas(d.sleepWindow[0]);
  const sleepL = normCanvas(d.sleepWindow[1]);

  const asleepLeft = seg(0, wakeE);
  const asleepRight = seg(sleepL, 1 - sleepL);
  const wakeBuf = seg(wakeE, wakeL - wakeE);
  const sleepBuf = seg(sleepE, sleepL - sleepE);

  const candidates = [asleepLeft, asleepRight].filter(Boolean) as { left: number; width: number }[];
  candidates.sort((a, b) => b.width - a.width);
  const sleepMark = candidates[0] && candidates[0].width > 0.1 ? candidates[0] : null;
  return { asleepLeft, asleepRight, wakeBuf, sleepBuf, sleepMark };
}

type Block = { left: number; width: number; color: string; icon?: IconName; label?: string };

function blocksFor(d: DayShape, obs: Obligation[]): Block[] {
  const out: Block[] = [];
  const add = (left: number, width: number, color: string, icon?: IconName, label?: string) => {
    const s = seg(left, width, 0.004);
    if (s) out.push({ ...s, color, icon, label });
  };
  // Commitments (work, classes, commute…), each in its inferred accent colour.
  for (const o of obs) {
    const l = normCanvas(o.start);
    add(l, normCanvas(o.end) - l, obligationColor(o.label), undefined, o.label);
  }
  // Get-ready — a small fixed tick around the chosen time.
  if (d.getReadyTime) {
    const c = normCanvas(d.getReadyTime);
    add(c - 0.025, 0.05, READY, 'water');
  }
  // Workout WINDOW (default-level) — drawn on every lane.
  if (d.workoutWindow) {
    const l = normCanvas(d.workoutWindow[0]);
    add(l, normCanvas(d.workoutWindow[1]) - l, WORKOUT, 'barbell', 'Workout');
  }
  return out;
}

function EventBlock({ b, rowH }: { b: Block; rowH: number }) {
  const wide = b.width >= 0.12;
  const mid = b.width >= 0.05;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.block,
        {
          top: BLOCK_INSET,
          height: rowH - BLOCK_INSET * 2 - LANE_INSET,
          left: pct(b.left),
          width: pct(b.width),
          backgroundColor: b.color,
        },
      ]}
    >
      {wide && b.label ? (
        <View style={styles.blockLabelRow}>
          {b.icon ? <Ionicons name={b.icon} size={9.5} color="#fff" style={{ marginRight: 3 }} /> : null}
          <Text style={styles.blockLabel} numberOfLines={1}>
            {b.label}
          </Text>
        </View>
      ) : mid && b.icon ? (
        <Ionicons name={b.icon} size={11} color="#fff" />
      ) : null}
    </View>
  );
}

function DayRow({
  label,
  sublabel,
  day,
  obligations,
  overridden,
  isAll,
  onPress,
}: {
  label: string;
  sublabel?: string;
  day: DayShape;
  obligations: Obligation[];
  overridden: boolean;
  isAll: boolean;
  onPress: () => void;
}) {
  const rowH = isAll ? ALL_ROW_H : ROW_H;
  const { asleepLeft, asleepRight, wakeBuf, sleepBuf, sleepMark } = washesFor(day);
  const blocks = blocksFor(day, obligations);

  return (
    <TouchableOpacity style={[styles.row, { height: rowH }]} activeOpacity={0.65} onPress={onPress}>
      <View style={[styles.gutter, { width: GUTTER }]}>
        <Text style={[styles.dayLabel, isAll && styles.allLabel]} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.daySub}>{sublabel}</Text> : null}
        {overridden ? <View style={styles.overrideDot} /> : null}
      </View>

      <View style={styles.track}>
        <View style={[styles.lane, isAll && styles.laneAll]}>
          {/* Flat night washes from each edge — value alone marks "asleep". */}
          {asleepLeft ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(asleepLeft.left), width: pct(asleepLeft.width), backgroundColor: ASLEEP }}
            />
          ) : null}
          {asleepRight ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(asleepRight.left), width: pct(asleepRight.width), backgroundColor: ASLEEP }}
            />
          ) : null}
          {/* Soft buffer washes over the wake / sleep ranges. */}
          {wakeBuf ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(wakeBuf.left), width: pct(wakeBuf.width), backgroundColor: WAKE_BUF }}
            />
          ) : null}
          {sleepBuf ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(sleepBuf.left), width: pct(sleepBuf.width), backgroundColor: SLEEP_BUF }}
            />
          ) : null}

          {/* Moon on the long night block. */}
          {sleepMark ? (
            <View
              pointerEvents="none"
              style={[styles.sleepMark, { left: pct(sleepMark.left), width: pct(sleepMark.width) }]}
            >
              <Ionicons name="moon" size={11} color={SLEEP_INK} style={{ opacity: 0.5 }} />
              {sleepMark.width > 0.2 ? <Text style={styles.sleepText}>Sleep</Text> : null}
            </View>
          ) : null}

          {/* Gradient calendar blocks for the fixed, tracked things. */}
          {blocks.map((b, i) => (
            <EventBlock key={`b${i}`} b={b} rowH={rowH} />
          ))}
        </View>
      </View>
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
  // The base "Everyday" lane shows commitments that recur on EVERY day.
  const everydayObs = obligations.filter((o) => o.days === 'all');

  return (
    <View style={styles.wrap}>
      {/* Axis header — labels line up with the gridlines below. */}
      <View style={styles.axisRow}>
        <View style={{ width: GUTTER }} />
        <View style={styles.axisTrack}>
          {AXIS_MARKS.map((m) => (
            <Text key={m.t} style={[styles.axisLabel, { left: pct(normCanvas(m.t)) }]}>
              {m.label}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* Continuous vertical gridlines through every lane, behind the content. */}
        <View style={[styles.gridOverlay, { left: GUTTER }]} pointerEvents="none">
          {AXIS_MARKS.map((m) => (
            <View key={m.t} style={[styles.gridLine, { left: pct(normCanvas(m.t)) }]} />
          ))}
        </View>

        <DayRow
          label="Everyday"
          sublabel="BASE"
          day={defaults}
          obligations={everydayObs}
          overridden={false}
          isAll
          onPress={() => onEditScope('all')}
        />
        <View style={styles.divider} />
        {WEEKDAYS.map((w) => (
          <DayRow
            key={w.key}
            label={w.short}
            day={effectiveDay(defaults, weekly, w.key)}
            obligations={obligationsForDay(obligations, w.key)}
            overridden={hasOverride(weekly, w.key)}
            isAll={false}
            onPress={() => onEditScope(w.key)}
          />
        ))}
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
        The open space is your free time — Max fits skin, hair, mewing & training there. Change a
        day and your Max plans move with it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  axisRow: { flexDirection: 'row', height: AXIS_H, alignItems: 'flex-end' },
  axisTrack: { flex: 1, height: AXIS_H, position: 'relative' },
  axisLabel: {
    position: 'absolute',
    bottom: 2,
    marginLeft: -12,
    width: 24,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  body: { position: 'relative' },
  gridOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  gridLine: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  gutter: { paddingLeft: 2, paddingRight: 8, justifyContent: 'center' },
  dayLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  allLabel: { fontFamily: fonts.sansSemiBold, color: colors.foreground, fontSize: 13 },
  daySub: { fontFamily: fonts.sansMedium, fontSize: 8.5, color: colors.textMuted, letterSpacing: 0.8, marginTop: 1 },
  overrideDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -9,
    right: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.foreground,
  },
  track: { flex: 1, height: '100%', position: 'relative' },
  lane: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: LANE_INSET,
    bottom: LANE_INSET,
    borderRadius: LANE_RADIUS,
    backgroundColor: LANE,
    overflow: 'hidden',
  },
  laneAll: { backgroundColor: LANE_ALL },
  block: {
    position: 'absolute',
    borderRadius: BLOCK_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  blockLabelRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  blockLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9.5,
    color: '#fff',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  sleepMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sleepText: { fontSize: 9.5, color: SLEEP_INK, opacity: 0.7, fontFamily: fonts.sansMedium, letterSpacing: 0.3 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 5,
    marginLeft: GUTTER,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 8,
    columnGap: 14,
    marginTop: spacing.md,
    paddingLeft: GUTTER,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 11, height: 11, borderRadius: 3 },
  legendSleep: { backgroundColor: 'rgba(17,17,19,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(17,17,19,0.22)' },
  legendText: { fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.2 },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    letterSpacing: 0.1,
    marginTop: spacing.md,
    paddingLeft: GUTTER,
  },
});
