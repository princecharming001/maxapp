/**
 * WeekCanvas — the whole week at a glance on one shared time axis.
 *
 * No tab-switching: every day is a row, all visible together. The axis runs
 * 4 AM → 4 AM so late bedtimes sit naturally on the right. Each row is a soft
 * "day strip", not a stack of calendar blocks:
 *   • a warm→cool gradient AWAKE band — gold at the wake end, indigo at the
 *     sleep end — that FEATHERS across the wake & sleep RANGES, so a chosen
 *     range reads soft and an exact time crisp. This glow is the hero.
 *   • a slim, muted "busy" under-rail for fixed work + obligations (no labels;
 *     the specifics live in the editor) so the picture stays calm.
 *   • small markers for workout (dot) and get-ready (ring).
 *
 * The first row is "Everyday" (your base rhythm). Weekday rows show the
 * effective day (defaults + overrides) and carry a dot when customised.
 * Tapping any row opens the editor for that scope.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

const GUTTER = 50;
const ROW_H = 46;
const ALL_ROW_H = 52;
const BAND_H = 18;
const BUSY_H = 4;
const AXIS_H = 20;

// Axis reference marks across the 4 AM → 4 AM window.
const AXIS_MARKS: { t: string; label: string }[] = [
  { t: '06:00', label: '6a' },
  { t: '12:00', label: '12p' },
  { t: '18:00', label: '6p' },
  { t: '00:00', label: '12a' },
];

// Warm sunrise → cool dusk. Peak opacity lives in the "definitely awake"
// middle; both ends fade to transparent across the wake / sleep ranges.
const SUNRISE = '250,176,80';
const MIDDAY = '232,141,163';
const DUSK = '99,102,241';
const PEAK = 0.72;
const RAIL = 'rgba(17,17,19,0.05)';
const BUSY = 'rgba(100,116,139,0.42)';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number): DimensionValue => `${(clamp01(n) * 100).toFixed(3)}%` as DimensionValue;
// Keep small markers off the very edges so nothing clips.
const markPct = (n: number): DimensionValue =>
  `${Math.max(2.5, Math.min(97.5, clamp01(n) * 100)).toFixed(3)}%` as DimensionValue;

function bandGeom(d: DayShape) {
  const bw0 = normCanvas(d.wakeWindow[0]);
  const bw1 = normCanvas(d.wakeWindow[1]);
  const bs0 = normCanvas(d.sleepWindow[0]);
  const bs1 = normCanvas(d.sleepWindow[1]);
  const total = bs1 - bw0;
  if (total <= 0.005) return null;
  let p1 = clamp01((bw1 - bw0) / total); // wake range ends → fade-in complete
  let p2 = clamp01((bs0 - bw0) / total); // sleep range begins → fade-out starts
  if (p2 < p1) {
    const m = (p1 + p2) / 2;
    p1 = m;
    p2 = m;
  }
  const mid = (p1 + p2) / 2;
  return { left: bw0, width: total, p1, mid, p2 };
}

type Busy = { left: number; width: number };

function busyFor(d: DayShape): Busy[] {
  const out: Busy[] = [];
  if (d.workSchedule === 'fixed') {
    const l = normCanvas(d.workStart);
    const r = normCanvas(d.workEnd);
    if (r - l > 0.004) out.push({ left: l, width: r - l });
  }
  for (const o of d.obligations) {
    const l = normCanvas(o.start);
    const r = normCanvas(o.end);
    if (r - l > 0.004) out.push({ left: l, width: r - l });
  }
  return out;
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
  const bandTop = (rowH - BAND_H) / 2 - 3;
  const geom = bandGeom(day);
  const busy = busyFor(day);

  const markers: { at: number; ring: boolean; color: string }[] = [];
  if (day.workoutTime) markers.push({ at: normCanvas(day.workoutTime), ring: false, color: colors.success });
  if (day.getReadyTime)
    markers.push({ at: normCanvas(day.getReadyTime), ring: true, color: colors.textSecondary });

  return (
    <TouchableOpacity
      style={[styles.row, { height: rowH }, isAll && styles.allRow]}
      activeOpacity={0.6}
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
        {/* Faint full-day rail for spatial context. */}
        <View pointerEvents="none" style={[styles.rail, { top: bandTop }]} />

        {/* Awake band — warm→cool, feathered over the wake/sleep ranges. */}
        {geom ? (
          <View style={[styles.band, { top: bandTop, left: pct(geom.left), width: pct(geom.width) }]}>
            <LinearGradient
              colors={[
                `rgba(${SUNRISE},0)`,
                `rgba(${SUNRISE},${PEAK})`,
                `rgba(${MIDDAY},${PEAK})`,
                `rgba(${DUSK},${PEAK})`,
                `rgba(${DUSK},0)`,
              ]}
              locations={[0, geom.p1, geom.mid, geom.p2, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}

        {/* Slim busy under-rail (fixed work + obligations), demoted + muted. */}
        {busy.map((b, i) => (
          <View
            key={`b${i}`}
            pointerEvents="none"
            style={[
              styles.busy,
              { top: bandTop + BAND_H + 3, left: pct(b.left), width: pct(Math.max(b.width, 0.012)) },
            ]}
          />
        ))}

        {/* Workout / get-ready markers, centred on the band. */}
        {markers.map((m, i) => (
          <View
            key={`m${i}`}
            pointerEvents="none"
            style={[
              styles.marker,
              {
                top: bandTop + BAND_H / 2 - 5,
                left: markPct(m.at),
                backgroundColor: m.ring ? colors.card : m.color,
                borderColor: m.color,
              },
            ]}
          />
        ))}
      </View>
    </TouchableOpacity>
  );
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
        {/* Vertical gridlines spanning every row, behind the content. */}
        <View style={[styles.gridOverlay, { left: GUTTER }]} pointerEvents="none">
          {AXIS_MARKS.map((m) => (
            <View key={m.t} style={[styles.gridLine, { left: pct(normCanvas(m.t)) }]} />
          ))}
        </View>

        <DayRow
          label="Everyday"
          sublabel="base"
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
          <LinearGradient
            colors={[`rgba(${SUNRISE},${PEAK})`, `rgba(${MIDDAY},${PEAK})`, `rgba(${DUSK},${PEAK})`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.legendBand}
          />
          <Text style={styles.legendText}>awake</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendBusy} />
          <Text style={styles.legendText}>busy</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>workout</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendRing]} />
          <Text style={styles.legendText}>get ready</Text>
        </View>
      </View>
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
    opacity: 0.55,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  allRow: { backgroundColor: colors.surface, borderRadius: 13, marginBottom: 2 },
  gutter: { paddingLeft: 4, paddingRight: 8, justifyContent: 'center' },
  dayLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  allLabel: { fontFamily: fonts.sansSemiBold, color: colors.foreground, fontSize: 13 },
  daySub: { fontSize: 9.5, color: colors.textMuted, letterSpacing: 0.4, marginTop: 1, textTransform: 'uppercase' },
  overrideDot: {
    position: 'absolute',
    top: '50%',
    marginTop: -9,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.foreground,
  },
  track: { flex: 1, height: '100%', position: 'relative' },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BAND_H,
    borderRadius: BAND_H / 2,
    backgroundColor: RAIL,
  },
  band: {
    position: 'absolute',
    height: BAND_H,
    borderRadius: BAND_H / 2,
    overflow: 'hidden',
  },
  busy: {
    position: 'absolute',
    height: BUSY_H,
    borderRadius: BUSY_H / 2,
    backgroundColor: BUSY,
  },
  marker: {
    position: 'absolute',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginVertical: 5,
    marginLeft: GUTTER,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 8,
    columnGap: 16,
    marginTop: spacing.md,
    paddingLeft: GUTTER,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBand: { width: 26, height: 9, borderRadius: 4.5 },
  legendBusy: { width: 16, height: 4, borderRadius: 2, backgroundColor: BUSY },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendRing: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.textSecondary },
  legendText: { fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.2 },
});
