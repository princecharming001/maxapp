/**
 * DayTimeline — a single day read as a vertical agenda, the primary way to SEE
 * and adjust your day. Every part of the day's shape is a block on a time-ordered
 * spine: wake, get-ready, your commitments, the workout window, wind-down. Tap a
 * shape block (wake / get-ready / workout / wind-down) to adjust the times; tap a
 * commitment to edit it. Big touch targets, no tiny grid cells — the mobile-first
 * "vertical agenda" pattern rather than a cramped week grid.
 *
 * Pure presentation: it takes the already-resolved day for the chosen scope and
 * the obligations that apply, and reports taps back up. Persistence lives in the
 * planner screen.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme/dark';
import {
  DayShape,
  Obligation,
  Scope,
  eveMin,
  toMin,
  windowMid,
  fmt12Compact,
  isExact,
  obligationsForDay,
  daysLabel,
} from './plannerModel';

const WORKOUT_ACCENT = '#2F6B4E';
const OB_INK = '#34343B';

type Kind = 'wake' | 'ready' | 'workout' | 'sleep' | 'ob';

type Row = {
  key: string;
  sortMin: number;
  time: string;
  icon: string;
  label: string;
  sub?: string;
  kind: Kind;
  editable: boolean;
  obIndex?: number;
};

export default function DayTimeline({
  day,
  obligations,
  scope,
  onEditShape,
  onEditObligation,
}: {
  day: DayShape;
  obligations: Obligation[];
  scope: Scope;
  onEditShape: () => void;
  onEditObligation?: (index: number) => void;
}) {
  const rows: Row[] = [];

  // Wake — the top anchor. Show a range when it isn't an exact time.
  const wakeMid = windowMid(day.wakeWindow, false);
  rows.push({
    key: 'wake',
    sortMin: eveMin(day.wakeWindow[0]),
    time: fmt12Compact(wakeMid),
    icon: 'sunny-outline',
    label: 'Wake',
    sub: isExact(day.wakeWindow)
      ? undefined
      : `anytime ${fmt12Compact(day.wakeWindow[0])} – ${fmt12Compact(day.wakeWindow[1])}`,
    kind: 'wake',
    editable: true,
  });

  // Get ready (optional).
  if (day.getReadyTime) {
    rows.push({
      key: 'ready',
      sortMin: eveMin(day.getReadyTime),
      time: fmt12Compact(day.getReadyTime),
      icon: 'water-outline',
      label: 'Get ready',
      sub: 'AM skin · hair · mewing land here',
      kind: 'ready',
      editable: true,
    });
  }

  // Commitments that apply to this scope. On "Every day" show every obligation
  // with its recurrence; on a specific weekday show just that day's.
  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i })).sort((a, b) => toMin(a.o.start) - toMin(b.o.start))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    rows.push({
      key: `ob-${i}-${o.start}`,
      sortMin: eveMin(o.start),
      time: fmt12Compact(o.start),
      icon: o.label.toLowerCase().includes('commute') ? 'car-outline' : 'briefcase-outline',
      label: o.label,
      sub:
        scope === 'all'
          ? `${fmt12Compact(o.start)} – ${fmt12Compact(o.end)} · ${daysLabel(o.days)}`
          : `${fmt12Compact(o.start)} – ${fmt12Compact(o.end)}`,
      kind: 'ob',
      editable: !!onEditObligation && i >= 0,
      obIndex: i,
    });
  }

  // Workout window (global; shown on every scope).
  if (day.workoutWindow) {
    rows.push({
      key: 'workout',
      sortMin: eveMin(day.workoutWindow[0]),
      time: fmt12Compact(day.workoutWindow[0]),
      icon: 'barbell-outline',
      label: 'Workout',
      sub: `Max fits it ${fmt12Compact(day.workoutWindow[0])} – ${fmt12Compact(day.workoutWindow[1])}`,
      kind: 'workout',
      editable: true,
    });
  }

  // Wind down / sleep — the bottom anchor.
  const sleepMid = windowMid(day.sleepWindow, true);
  rows.push({
    key: 'sleep',
    sortMin: eveMin(day.sleepWindow[0]),
    time: fmt12Compact(sleepMid),
    icon: 'moon-outline',
    label: 'Wind down',
    sub: isExact(day.sleepWindow)
      ? undefined
      : `anytime ${fmt12Compact(day.sleepWindow[0])} – ${fmt12Compact(day.sleepWindow[1])}`,
    kind: 'sleep',
    editable: true,
  });

  rows.sort((a, b) => a.sortMin - b.sortMin);

  const accentFor = (k: Kind) =>
    k === 'workout' ? WORKOUT_ACCENT : k === 'ob' ? OB_INK : colors.foreground;

  return (
    <View style={styles.wrap}>
      {rows.map((r, idx) => {
        const onPress =
          r.kind === 'ob'
            ? r.editable && r.obIndex != null
              ? () => onEditObligation?.(r.obIndex as number)
              : undefined
            : onEditShape;
        const last = idx === rows.length - 1;
        return (
          <TouchableOpacity
            key={r.key}
            activeOpacity={onPress ? 0.6 : 1}
            onPress={onPress}
            disabled={!onPress}
            style={styles.row}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`${r.label}, ${r.time}${onPress ? ', edit' : ''}`}
          >
            {/* Time gutter */}
            <Text style={styles.time}>{r.time}</Text>

            {/* Spine: dot + connecting line */}
            <View style={styles.spine}>
              <View style={[styles.dot, { backgroundColor: accentFor(r.kind) }]} />
              {!last ? <View style={styles.line} /> : null}
            </View>

            {/* Block */}
            <View
              style={[
                styles.block,
                r.kind === 'workout' && styles.blockWorkout,
                r.kind === 'ob' && styles.blockOb,
              ]}
            >
              <View style={styles.iconTile}>
                <Ionicons name={r.icon as any} size={19} color={accentFor(r.kind)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{r.label}</Text>
                {r.sub ? <Text style={styles.sub}>{r.sub}</Text> : null}
              </View>
              {onPress ? (
                <View style={styles.chev}>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 60 },
  time: {
    width: 58,
    paddingTop: 18,
    textAlign: 'right',
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  spine: { width: 26, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 22 },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 2 },
  // Flat timeline rows — no card boxes; the spine + a hairline carry structure.
  // Top-aligned so the time, dot, icon and label's first line all sit on one
  // baseline even when a row has a second (sub) line.
  block: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  blockWorkout: {},
  blockOb: {},
  iconTile: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same 22px height as the leading icon so the chevron centers on the label's
  // first line instead of top-aligning above it.
  chev: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: colors.foreground, letterSpacing: -0.1 },
  sub: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 2, letterSpacing: 0.05 },
});
