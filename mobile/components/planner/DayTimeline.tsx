/**
 * DayTimeline — a single day read as a vertical agenda, the primary way to SEE
 * and adjust your day. Every part of the day's shape is a block on a ruled time
 * axis: wake, get-ready, your commitments, the workout window, wind-down. Tap a
 * shape block (wake / get-ready / workout / wind-down) to adjust the times; tap a
 * commitment to edit it.
 *
 * Editorial calendar styling: a left time gutter (tabular figures), a faint
 * hairline rule per entry, and the entry itself as a clean floating card — no
 * icons, no chevrons. Pure presentation; persistence lives in the planner screen.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme/dark';
import type { ShapeFocus } from './DayEditorSheet';
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

type Kind = 'wake' | 'ready' | 'workout' | 'sleep' | 'ob';

type Row = {
  key: string;
  sortMin: number;
  time: string;
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
  onEditShape: (focus: ShapeFocus) => void;
  onEditObligation?: (index: number) => void;
}) {
  const rows: Row[] = [];

  // Wake — the top anchor. Show a range when it isn't an exact time.
  const wakeMid = windowMid(day.wakeWindow, false);
  rows.push({
    key: 'wake',
    sortMin: eveMin(day.wakeWindow[0]),
    time: fmt12Compact(wakeMid),
    label: 'Wake',
    sub: isExact(day.wakeWindow)
      ? undefined
      : `anytime ${fmt12Compact(day.wakeWindow[0])} – ${fmt12Compact(day.wakeWindow[1])}`,
    kind: 'wake',
    editable: true,
  });

  // Get ready — the morning routine window (skincare, shower, hair).
  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    rows.push({
      key: 'ready',
      sortMin: eveMin(gr[0]),
      time: fmt12Compact(gr[0]),
      label: 'Get ready',
      sub: `${fmt12Compact(gr[0])} – ${fmt12Compact(gr[1])} · AM routine`,
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
      label: 'Workout',
      sub: `Max fits it ${fmt12Compact(day.workoutWindow[0])} – ${fmt12Compact(day.workoutWindow[1])}`,
      kind: 'workout',
      editable: true,
    });
  }

  // Wind down — the nighttime routine window (PM skincare, shower, winding
  // down). The window's end is bedtime; an exact time means no routine window.
  rows.push({
    key: 'sleep',
    sortMin: eveMin(day.sleepWindow[0]),
    time: fmt12Compact(day.sleepWindow[0]),
    label: 'Wind down',
    sub: isExact(day.sleepWindow)
      ? `Bed by ${fmt12Compact(day.sleepWindow[0])}`
      : `${fmt12Compact(day.sleepWindow[0])} – ${fmt12Compact(day.sleepWindow[1])} · bed by ${fmt12Compact(day.sleepWindow[1])}`,
    kind: 'sleep',
    editable: true,
  });

  rows.sort((a, b) => a.sortMin - b.sortMin);

  return (
    <View style={styles.wrap}>
      {rows.map((r) => {
        const onPress =
          r.kind === 'ob'
            ? r.editable && r.obIndex != null
              ? () => onEditObligation?.(r.obIndex as number)
              : undefined
            : () => onEditShape(r.kind as ShapeFocus);
        return (
          <View key={r.key} style={styles.entry}>
            {/* Faint ruled line per entry — the time axis. */}
            <View style={styles.rule} />
            <View style={styles.entryRow}>
              <Text style={styles.time}>{r.time}</Text>
              <TouchableOpacity
                activeOpacity={onPress ? 0.7 : 1}
                onPress={onPress}
                disabled={!onPress}
                style={[styles.cardItem, r.kind === 'workout' && styles.cardItemWorkout]}
                accessibilityRole={onPress ? 'button' : undefined}
                accessibilityLabel={`${r.label}, ${r.time}${onPress ? ', edit' : ''}`}
              >
                <Text style={styles.label}>{r.label}</Text>
                {r.sub ? <Text style={styles.sub}>{r.sub}</Text> : null}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const WORKOUT_ACCENT = '#2F6B4E';

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  entry: {},
  // Full-width hairline that reads as a ruled time line behind each entry.
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 12, paddingBottom: 18 },
  // Left time gutter — tabular figures so the column stays optically aligned.
  time: {
    width: 64,
    paddingTop: 15,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  // The entry as a clean floating card — white with a hairline edge and a very
  // soft shadow so it lifts off the surface without an icon to carry it.
  cardItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  // The one restrained accent: the workout card gets a thin green left edge.
  cardItemWorkout: { borderLeftWidth: 2.5, borderLeftColor: WORKOUT_ACCENT },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.foreground, letterSpacing: -0.1 },
  sub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 3, letterSpacing: 0.05 },
});
