/**
 * WeekCanvas — the whole week at a glance, on one shared time axis.
 *
 * Every day is a row (no tab-switching). The horizontal axis runs 4 AM → 4 AM
 * so late bedtimes sit naturally to the right. Each row draws:
 *   • an "awake" band that FADES IN across the wake range and FADES OUT across
 *     the sleep range — so a chosen range looks soft and an exact time crisp;
 *   • fixed work + obligations as calendar-style blocks;
 *   • workout & get-ready as small markers on the band.
 *
 * The first row is "All days" (your base rhythm). Weekday rows show the
 * effective day (defaults + that day's overrides) and carry a dot when
 * customised. Tapping any row opens the editor for that scope.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  isExact,
} from './plannerModel';

const GUTTER = 58;
const ROW_H = 44;
const BAND_H = 22;
const AXIS_H = 22;

// Axis reference marks (4 AM → 4 AM window).
const AXIS_MARKS: { t: string; label: string }[] = [
  { t: '06:00', label: '6a' },
  { t: '12:00', label: '12p' },
  { t: '18:00', label: '6p' },
  { t: '00:00', label: '12a' },
];

const BAND_SOLID = 'rgba(17,17,19,0.12)';
const BAND_CLEAR = 'rgba(17,17,19,0)';
const WORK_FILL = 'rgba(59,130,246,0.16)';
const WORK_BAR = '#3b82f6';
const OB_FILL = 'rgba(245,158,11,0.20)';
const OB_BAR = '#f59e0b';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number): DimensionValue => `${(clamp01(n) * 100).toFixed(3)}%` as DimensionValue;

function bandGeom(d: DayShape) {
  const bw0 = normCanvas(d.wakeWindow[0]);
  const bw1 = normCanvas(d.wakeWindow[1]);
  const bs0 = normCanvas(d.sleepWindow[0]);
  const bs1 = normCanvas(d.sleepWindow[1]);
  const total = bs1 - bw0;
  if (total <= 0.005) return null;
  let p1 = clamp01((bw1 - bw0) / total);
  let p2 = clamp01((bs0 - bw0) / total);
  if (p2 < p1) {
    const m = (p1 + p2) / 2;
    p1 = m;
    p2 = m;
  }
  return { left: bw0, width: total, p1, p2 };
}

type BlockSpec = { left: number; width: number; fill: string; bar: string; label: string };

function blocksFor(d: DayShape): BlockSpec[] {
  const out: BlockSpec[] = [];
  if (d.workSchedule === 'fixed') {
    const l = normCanvas(d.workStart);
    const r = normCanvas(d.workEnd);
    if (r - l > 0.002) out.push({ left: l, width: r - l, fill: WORK_FILL, bar: WORK_BAR, label: 'Work' });
  }
  for (const o of d.obligations) {
    const l = normCanvas(o.start);
    const r = normCanvas(o.end);
    if (r - l > 0.002) out.push({ left: l, width: r - l, fill: OB_FILL, bar: OB_BAR, label: o.label });
  }
  return out;
}

function DayRow({
  label,
  caption,
  day,
  overridden,
  isAll,
  trackW,
  onPress,
  onTrackLayout,
}: {
  label: string;
  caption?: string;
  day: DayShape;
  overridden: boolean;
  isAll: boolean;
  trackW: number;
  onPress: () => void;
  onTrackLayout?: (e: LayoutChangeEvent) => void;
}) {
  const geom = bandGeom(day);
  const blocks = blocksFor(day);
  const markers: { at: number; color: string; ring: boolean }[] = [];
  if (day.workoutTime) markers.push({ at: normCanvas(day.workoutTime), color: colors.success, ring: false });
  if (day.getReadyTime) markers.push({ at: normCanvas(day.getReadyTime), color: colors.textSecondary, ring: true });

  return (
    <TouchableOpacity
      style={[styles.row, isAll && styles.allRow]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <View style={styles.gutter}>
        <Text style={[styles.dayLabel, isAll && styles.allLabel]} numberOfLines={1}>
          {label}
        </Text>
        {caption ? <Text style={styles.dayCaption}>{caption}</Text> : null}
        {overridden ? <View style={styles.overrideDot} /> : null}
      </View>

      <View style={styles.track} onLayout={onTrackLayout}>
        {/* Awake band — fades over the wake/sleep ranges. */}
        {geom ? (
          <View
            style={[styles.band, { left: pct(geom.left), width: pct(geom.width) }]}
          >
            <LinearGradient
              colors={[BAND_CLEAR, BAND_SOLID, BAND_SOLID, BAND_CLEAR]}
              locations={[0, geom.p1, geom.p2, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}

        {/* Fixed work + obligations. */}
        {blocks.map((b, i) => {
          const widePx = b.width * trackW;
          return (
            <View
              key={`${b.label}-${i}`}
              style={[
                styles.block,
                { left: pct(b.left), width: pct(b.width), backgroundColor: b.fill },
              ]}
            >
              <View style={[styles.blockBar, { backgroundColor: b.bar }]} />
              {widePx >= 40 ? (
                <Text style={styles.blockLabel} numberOfLines={1}>
                  {b.label}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* Workout / get-ready markers. */}
        {markers.map((m, i) => (
          <View
            key={i}
            style={[
              styles.marker,
              {
                left: pct(m.at),
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
  const [trackW, setTrackW] = useState(0);

  return (
    <View style={styles.wrap}>
      {/* Axis header — labels align with the gridlines below. */}
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
          label="All days"
          caption="base"
          day={defaults}
          overridden={false}
          isAll
          trackW={trackW}
          onPress={() => onEditScope('all')}
          onTrackLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        />
        <View style={styles.divider} />
        {WEEKDAYS.map((w) => (
          <DayRow
            key={w.key}
            label={w.short}
            day={effectiveDay(defaults, weekly, w.key)}
            overridden={hasOverride(weekly, w.key)}
            isAll={false}
            trackW={trackW}
            onPress={() => onEditScope(w.key)}
          />
        ))}
      </View>

      {/* Legend. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <LinearGradient
            colors={[BAND_CLEAR, BAND_SOLID]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.legendBand}
          />
          <Text style={styles.legendText}>awake</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: WORK_FILL, borderColor: WORK_BAR }]} />
          <Text style={styles.legendText}>work</Text>
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
    marginLeft: -10,
    width: 20,
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
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    opacity: 0.7,
  },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H },
  allRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  gutter: { width: GUTTER, paddingLeft: 4, paddingRight: 8, justifyContent: 'center' },
  dayLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  allLabel: { fontFamily: fonts.sansSemiBold, color: colors.foreground, fontSize: 12.5 },
  dayCaption: { fontSize: 9.5, color: colors.textMuted, letterSpacing: 0.3, marginTop: 1 },
  overrideDot: {
    position: 'absolute',
    top: ROW_H / 2 - 9,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.foreground,
  },
  track: { flex: 1, height: ROW_H, justifyContent: 'center', position: 'relative' },
  band: {
    position: 'absolute',
    top: (ROW_H - BAND_H) / 2,
    height: BAND_H,
    borderRadius: 7,
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    top: (ROW_H - BAND_H) / 2,
    height: BAND_H,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  blockBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  blockLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 10.5,
    color: colors.foreground,
    letterSpacing: 0.1,
  },
  marker: {
    position: 'absolute',
    top: ROW_H / 2 - 5,
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
    marginLeft: GUTTER,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginTop: spacing.md,
    paddingLeft: GUTTER,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBand: { width: 22, height: 9, borderRadius: 3 },
  legendSwatch: { width: 14, height: 11, borderRadius: 3, borderLeftWidth: 2 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendRing: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.textSecondary },
  legendText: { fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.2 },
});
