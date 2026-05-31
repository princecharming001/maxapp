/**
 * WeekCanvas — the whole week at a glance, as a Google-Calendar-style board.
 *
 * No tab-switching: every day is its own lane, all visible together on one
 * shared time axis (4 AM → 4 AM, so late bedtimes sit naturally on the right).
 * Unlike an abstract glow, every mark here is a REAL thing the schedule tracks:
 *
 *   • a faint "asleep" wash on the night ends (a moon marks the long one),
 *   • soft warm/cool BUFFER washes over the wake & sleep RANGES — the open
 *     white core between them is the "definitely awake" window the AI builds
 *     around (it matches the backend's guaranteed-awake anchors exactly),
 *   • solid, labelled blocks for the fixed things: Work, each Obligation,
 *     your Workout and Get-ready — drawn like calendar events.
 *
 * The open white space inside the awake core is deliberate: that's the free
 * time Max drops your skin / hair / mewing / training routines into. Editing a
 * day here rewrites onboarding, which regenerates every Max schedule — so what
 * you see is exactly what the AI plans around.
 *
 * The first lane is "Everyday" (your base rhythm). Weekday lanes show the
 * effective day (defaults + overrides) and carry a dot when customised.
 * Tapping any lane opens the editor for that scope.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, DimensionValue, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import {
  DayShape,
  Scope,
  Weekday,
  WEEKDAYS,
  normCanvas,
  effectiveDay,
  hasOverride,
} from './plannerModel';

const GUTTER = 46;
const ROW_H = 40;
const ALL_ROW_H = 46;
const LANE_INSET = 3; // top/bottom inset of the day lane within its row
const BLOCK_INSET = 7; // top/bottom inset of an event block within the row
const AXIS_H = 20;
const LANE_RADIUS = 8;
const BLOCK_RADIUS = 5;

// Axis reference marks across the 4 AM → 4 AM window.
const AXIS_MARKS: { t: string; label: string }[] = [
  { t: '06:00', label: '6a' },
  { t: '12:00', label: '12p' },
  { t: '18:00', label: '6p' },
  { t: '00:00', label: '12a' },
];

// Event colours map 1:1 to the editor's slider accents, so a block here reads
// as the same "thing" you dragged in the sheet.
const WORK = '#3b82f6';
const OBLIG = '#64748b';
const WORKOUT = '#22c55e';
const READY = '#06b6d4';
const SLEEP_INK = '#6366f1';

// Washes (kept faint so blocks and gridlines read through them).
const LANE = 'rgba(17,17,19,0.028)';
const ASLEEP = 'rgba(99,102,241,0.09)';
const WAKE_BUF = 'rgba(245,158,11,0.10)';
const SLEEP_BUF = 'rgba(99,102,241,0.06)';

type IconName = keyof typeof Ionicons.glyphMap;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number): DimensionValue => `${(clamp01(n) * 100).toFixed(3)}%` as DimensionValue;

/** A clamped {left,width} fraction pair, or null when too thin to draw. */
function seg(left: number, width: number, min = 0.0025): { left: number; width: number } | null {
  const l = clamp01(left);
  const w = clamp01(Math.min(width, 1 - l));
  return w <= min ? null : { left: l, width: w };
}

type Wash = { left: number; width: number; color: string };

function washesFor(d: DayShape): { washes: Wash[]; sleepMark: { left: number; width: number } | null } {
  const wakeE = normCanvas(d.wakeWindow[0]);
  const wakeL = normCanvas(d.wakeWindow[1]);
  const sleepE = normCanvas(d.sleepWindow[0]);
  const sleepL = normCanvas(d.sleepWindow[1]);

  const washes: Wash[] = [];
  const push = (s: { left: number; width: number } | null, color: string) => {
    if (s) washes.push({ ...s, color });
  };
  // Night on both ends, warm/cool buffers over the chosen ranges, open core.
  const asleepLeft = seg(0, wakeE);
  const asleepRight = seg(sleepL, 1 - sleepL);
  push(asleepLeft, ASLEEP);
  push(seg(wakeE, wakeL - wakeE), WAKE_BUF);
  push(seg(sleepE, sleepL - sleepE), SLEEP_BUF);
  push(asleepRight, ASLEEP);

  // Label the wider night block (usually the evening one) with a moon.
  const candidates = [asleepLeft, asleepRight].filter(Boolean) as { left: number; width: number }[];
  candidates.sort((a, b) => b.width - a.width);
  const sleepMark = candidates[0] && candidates[0].width > 0.1 ? candidates[0] : null;
  return { washes, sleepMark };
}

type Block = { left: number; width: number; color: string; icon?: IconName; label?: string };

function blocksFor(d: DayShape): Block[] {
  const out: Block[] = [];
  const add = (left: number, width: number, color: string, icon?: IconName, label?: string) => {
    const s = seg(left, width, 0.004);
    if (s) out.push({ ...s, color, icon, label });
  };
  if (d.workSchedule === 'fixed') {
    const l = normCanvas(d.workStart);
    add(l, normCanvas(d.workEnd) - l, WORK, 'briefcase', 'Work');
  }
  for (const o of d.obligations) {
    const l = normCanvas(o.start);
    add(l, normCanvas(o.end) - l, OBLIG, undefined, o.label);
  }
  if (d.getReadyTime) {
    const c = normCanvas(d.getReadyTime);
    add(c - 0.021, 0.042, READY, 'water');
  }
  if (d.workoutTime) {
    const c = normCanvas(d.workoutTime);
    add(c - 0.027, 0.054, WORKOUT, 'barbell');
  }
  return out;
}

function EventBlock({ b, rowH }: { b: Block; rowH: number }) {
  const wide = b.width >= 0.13;
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
  overridden,
  isAll,
  onPress,
}: {
  label: string;
  sublabel?: string;
  day: DayShape;
  overridden: boolean;
  isAll: boolean;
  onPress: () => void;
}) {
  const rowH = isAll ? ALL_ROW_H : ROW_H;
  const { washes, sleepMark } = washesFor(day);
  const blocks = blocksFor(day);

  return (
    <TouchableOpacity
      style={[styles.row, { height: rowH }]}
      activeOpacity={0.65}
      onPress={onPress}
    >
      <View style={[styles.gutter, { width: GUTTER }]}>
        <Text style={[styles.dayLabel, isAll && styles.allLabel]} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? <Text style={styles.daySub}>{sublabel}</Text> : null}
        {overridden ? <View style={styles.overrideDot} /> : null}
      </View>

      <View style={styles.track}>
        <View style={[styles.lane, isAll && styles.laneAll]}>
          {/* Sleep / range washes — the "off" and "maybe" parts of the day. */}
          {washes.map((w, i) => (
            <View
              key={`w${i}`}
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(w.left), width: pct(w.width), backgroundColor: w.color }}
            />
          ))}

          {/* Moon on the long night block. */}
          {sleepMark ? (
            <View
              pointerEvents="none"
              style={[styles.sleepMark, { left: pct(sleepMark.left), width: pct(sleepMark.width) }]}
            >
              <Ionicons name="moon" size={11} color={SLEEP_INK} style={{ opacity: 0.55 }} />
              {sleepMark.width > 0.2 ? <Text style={styles.sleepText}>Sleep</Text> : null}
            </View>
          ) : null}

          {/* Solid calendar blocks for the fixed, tracked things. */}
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
  onEditScope,
}: {
  defaults: DayShape;
  weekly: Partial<Record<Weekday, Partial<DayShape>>>;
  onEditScope: (scope: Scope) => void;
}) {
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
          <LegendSwatch color={WORK} />
          <Text style={styles.legendText}>work</Text>
        </View>
        <View style={styles.legendItem}>
          <LegendSwatch color={OBLIG} />
          <Text style={styles.legendText}>obligation</Text>
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
  daySub: { fontSize: 8.5, color: colors.textMuted, letterSpacing: 0.8, marginTop: 1 },
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
  laneAll: { backgroundColor: 'rgba(17,17,19,0.045)' },
  block: {
    position: 'absolute',
    borderRadius: BLOCK_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0a0a0b',
          shadowOpacity: 0.12,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
        }
      : {}),
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
  legendSleep: { backgroundColor: ASLEEP, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(99,102,241,0.35)' },
  legendText: { fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.2 },
  footnote: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    letterSpacing: 0.1,
    marginTop: spacing.md,
    paddingLeft: GUTTER,
  },
});
