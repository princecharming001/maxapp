/**
 * DayBuckets — the day read as Tiimo-style time-of-day sections.
 *
 * The same day-shape rows the timeline shows (wake, get-ready, commitments,
 * workout, wind-down) grouped under coloured ANYTIME / MORNING / AFTERNOON /
 * EVENING headers. Each section lists its items as clean cards; an empty section
 * shows a dashed "add something" row. Tapping an item opens the existing editor.
 *
 * (Row builder mirrors DayTimeline.tsx — keep them in sync if the day shape
 * gains fields.)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  sortMin: number;   // ordering within a bucket (evening-aware)
  clockMin: number;  // real clock minute, for bucketing
  time: string;
  label: string;
  sub?: string;
  kind: Kind;
  editable: boolean;
  obIndex?: number;
};

function buildRows(day: DayShape, obligations: Obligation[], scope: Scope): Row[] {
  const rows: Row[] = [];

  const wakeMid = windowMid(day.wakeWindow, false);
  rows.push({
    key: 'wake',
    sortMin: eveMin(day.wakeWindow[0]),
    clockMin: toMin(day.wakeWindow[0]),
    time: fmt12Compact(wakeMid),
    label: 'Wake',
    sub: isExact(day.wakeWindow) ? undefined : `anytime ${fmt12Compact(day.wakeWindow[0])} – ${fmt12Compact(day.wakeWindow[1])}`,
    kind: 'wake',
    editable: true,
  });

  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    rows.push({
      key: 'ready',
      sortMin: eveMin(gr[0]),
      clockMin: toMin(gr[0]),
      time: fmt12Compact(gr[0]),
      label: 'Get ready',
      sub: `${fmt12Compact(gr[0])} – ${fmt12Compact(gr[1])} · AM routine`,
      kind: 'ready',
      editable: true,
    });
  }

  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i })).sort((a, b) => toMin(a.o.start) - toMin(b.o.start))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    rows.push({
      key: `ob-${i}-${o.start}`,
      sortMin: eveMin(o.start),
      clockMin: toMin(o.start),
      time: fmt12Compact(o.start),
      label: o.label,
      sub:
        scope === 'all'
          ? `${fmt12Compact(o.start)} – ${fmt12Compact(o.end)} · ${daysLabel(o.days)}`
          : `${fmt12Compact(o.start)} – ${fmt12Compact(o.end)}`,
      kind: 'ob',
      editable: i >= 0,
      obIndex: i,
    });
  }

  if (day.workoutWindow) {
    rows.push({
      key: 'workout',
      sortMin: eveMin(day.workoutWindow[0]),
      clockMin: toMin(day.workoutWindow[0]),
      time: fmt12Compact(day.workoutWindow[0]),
      label: 'Workout',
      sub: `Max fits it ${fmt12Compact(day.workoutWindow[0])} – ${fmt12Compact(day.workoutWindow[1])}`,
      kind: 'workout',
      editable: true,
    });
  }

  rows.push({
    key: 'sleep',
    sortMin: eveMin(day.sleepWindow[0]),
    clockMin: toMin(day.sleepWindow[0]),
    time: fmt12Compact(day.sleepWindow[0]),
    label: 'Wind down',
    sub: isExact(day.sleepWindow)
      ? `Bed by ${fmt12Compact(day.sleepWindow[0])}`
      : `${fmt12Compact(day.sleepWindow[0])} – ${fmt12Compact(day.sleepWindow[1])} · bed by ${fmt12Compact(day.sleepWindow[1])}`,
    kind: 'sleep',
    editable: true,
  });

  return rows.sort((a, b) => a.sortMin - b.sortMin);
}

type BucketId = 'anytime' | 'morning' | 'afternoon' | 'evening';
const BUCKETS: { id: BucketId; label: string; icon: any; pill: string; ink: string; empty: string }[] = [
  { id: 'anytime',   label: 'ANYTIME',   icon: 'time-outline',          pill: '#ECEBE7', ink: '#5A574F', empty: 'Anytime today works' },
  { id: 'morning',   label: 'MORNING',   icon: 'partly-sunny-outline',  pill: '#FBE6D4', ink: '#9C5A28', empty: "What's on your morning list?" },
  { id: 'afternoon', label: 'AFTERNOON', icon: 'sunny-outline',         pill: '#E7E3F7', ink: '#5B4C9A', empty: "What's happening today?" },
  { id: 'evening',   label: 'EVENING',   icon: 'moon-outline',          pill: '#E0D6F2', ink: '#5A3FA0', empty: 'End the day your way' },
];

function bucketOf(clockMin: number): BucketId {
  if (clockMin >= 240 && clockMin < 720) return 'morning';     // 4:00–11:59
  if (clockMin >= 720 && clockMin < 1020) return 'afternoon';  // 12:00–16:59
  return 'evening';                                            // 17:00–3:59
}

export default function DayBuckets({
  day,
  obligations,
  scope,
  onEditShape,
  onEditObligation,
  onAdd,
}: {
  day: DayShape;
  obligations: Obligation[];
  scope: Scope;
  onEditShape: (focus: ShapeFocus) => void;
  onEditObligation?: (index: number) => void;
  onAdd: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<BucketId, boolean>>({
    anytime: false, morning: false, afternoon: false, evening: false,
  });

  const rows = buildRows(day, obligations, scope);
  const byBucket: Record<BucketId, Row[]> = { anytime: [], morning: [], afternoon: [], evening: [] };
  for (const r of rows) byBucket[bucketOf(r.clockMin)].push(r);

  return (
    <View style={s.wrap}>
      {BUCKETS.map((b) => {
        const items = byBucket[b.id];
        const isCollapsed = collapsed[b.id];
        return (
          <View key={b.id} style={s.section}>
            <TouchableOpacity
              style={[s.pill, { backgroundColor: b.pill }]}
              activeOpacity={0.8}
              onPress={() => setCollapsed((c) => ({ ...c, [b.id]: !c[b.id] }))}
              accessibilityRole="button"
              accessibilityLabel={`${b.label}, ${items.length} items`}
            >
              <Ionicons name={b.icon} size={15} color={b.ink} />
              <Text style={[s.pillLabel, { color: b.ink }]}>{b.label}</Text>
              <Text style={[s.pillCount, { color: b.ink }]}>({items.length})</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={b.ink} />
            </TouchableOpacity>

            {isCollapsed ? null : items.length === 0 ? (
              <TouchableOpacity style={s.empty} activeOpacity={0.7} onPress={onAdd}>
                <Text style={s.emptyText}>{b.empty}</Text>
                <View style={s.emptyAdd}>
                  <Ionicons name="add" size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={s.items}>
                {items.map((r) => {
                  const onPress =
                    r.kind === 'ob'
                      ? r.editable && r.obIndex != null
                        ? () => onEditObligation?.(r.obIndex as number)
                        : undefined
                      : () => onEditShape(r.kind as ShapeFocus);
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[s.card, r.kind === 'workout' && s.cardWorkout]}
                      activeOpacity={onPress ? 0.7 : 1}
                      onPress={onPress}
                      disabled={!onPress}
                      accessibilityRole={onPress ? 'button' : undefined}
                      accessibilityLabel={`${r.label}, ${r.time}${onPress ? ', edit' : ''}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardLabel}>{r.label}</Text>
                        {r.sub ? <Text style={s.cardSub} numberOfLines={1}>{r.sub}</Text> : null}
                      </View>
                      <Text style={s.cardTime}>{r.time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const WORKOUT_ACCENT = '#2F6B4E';
const s = StyleSheet.create({
  wrap: { marginTop: 4 },
  section: { marginBottom: 18 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginBottom: 10,
    minWidth: 150,
  },
  pillLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, letterSpacing: 1 },
  pillCount: { fontFamily: fonts.sansMedium, fontSize: 12.5, letterSpacing: 0.3, opacity: 0.8 },
  // Empty-state — dashed rounded row, matching the reference.
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 12,
  },
  emptyText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.1 },
  emptyAdd: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  items: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 15,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardWorkout: { borderLeftWidth: 2.5, borderLeftColor: WORKOUT_ACCENT },
  cardLabel: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.foreground, letterSpacing: -0.1 },
  cardSub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 3, letterSpacing: 0.05 },
  cardTime: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
});
