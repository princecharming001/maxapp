/**
 * ScheduleGrid — the day read as a Timepage-style hour grid: faint hour lines
 * with a time gutter on the left, and each block of the day floated onto the
 * grid as a soft white card with a coloured accent bar. An alternate way to
 * SEE the same day the DayTimeline shows as an agenda; tapping a card opens the
 * same editor. Pure presentation — it takes the resolved day + obligations.
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
  toMin,
  fmt12Compact,
  isExact,
  obligationsForDay,
} from './plannerModel';

const WORKOUT_ACCENT = '#2F6B4E';
const OB_INK = '#34343B';

const HOUR_H = 62;     // pixels per hour
const GUTTER = 54;     // time-label column width
const MIN_CARD_H = 24; // floor; real blocks are ≥25 min so height ≈ duration (no overlap)

type Ev = {
  key: string;
  start: number;
  end: number;
  icon: string;
  label: string;
  sub?: string;
  accent: string;
  onPress?: () => void;
};

function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh < 12 ? 'AM' : 'PM';
  const hr = hh % 12 || 12;
  return `${hr} ${suffix}`;
}

function buildEvents(
  day: DayShape,
  obligations: Obligation[],
  scope: Scope,
  onEditShape: (focus: ShapeFocus) => void,
  onEditObligation?: (index: number) => void,
): Ev[] {
  const evs: Ev[] = [];

  // Wake
  {
    const w = day.wakeWindow;
    const s = toMin(w[0]);
    let e = toMin(w[1]);
    if (e <= s) e = s + 25;
    evs.push({
      key: 'wake', start: s, end: e, icon: 'sunny-outline', label: 'Wake',
      sub: isExact(w) ? undefined : `anytime ${fmt12Compact(w[0])} – ${fmt12Compact(w[1])}`,
      accent: colors.foreground, onPress: () => onEditShape('wake'),
    });
  }

  // Get ready
  if (day.getReadyWindow) {
    const gr = day.getReadyWindow;
    evs.push({
      key: 'ready', start: toMin(gr[0]), end: toMin(gr[1]), icon: 'water-outline',
      label: 'Get ready', sub: 'AM routine', accent: colors.foreground,
      onPress: () => onEditShape('ready'),
    });
  }

  // Commitments for this scope
  const obs =
    scope === 'all'
      ? obligations.map((o, i) => ({ o, i }))
      : obligationsForDay(obligations, scope).map((o) => ({ o, i: obligations.indexOf(o) }));
  for (const { o, i } of obs) {
    const s = toMin(o.start);
    let e = toMin(o.end);
    if (e <= s) e = s + 30;
    const isCommute = o.label.toLowerCase().includes('commute');
    evs.push({
      key: `ob-${i}-${o.start}`, start: s, end: e,
      icon: isCommute ? 'car-outline' : 'briefcase-outline',
      label: o.label, accent: OB_INK,
      onPress: onEditObligation && i >= 0 ? () => onEditObligation(i) : undefined,
    });
  }

  // Workout window
  if (day.workoutWindow) {
    const ww = day.workoutWindow;
    evs.push({
      key: 'workout', start: toMin(ww[0]), end: toMin(ww[1]), icon: 'barbell-outline',
      label: 'Workout', sub: 'Max fits it here', accent: WORKOUT_ACCENT,
      onPress: () => onEditShape('workout'),
    });
  }

  // Wind down
  {
    const sw = day.sleepWindow;
    const s = toMin(sw[0]);
    let e = toMin(sw[1]);
    if (e <= s) e = s + 25;
    evs.push({
      key: 'sleep', start: s, end: e, icon: 'moon-outline', label: 'Wind down',
      sub: isExact(sw) ? `Bed by ${fmt12Compact(sw[0])}` : `bed by ${fmt12Compact(sw[1])}`,
      accent: colors.foreground, onPress: () => onEditShape('sleep'),
    });
  }

  evs.sort((a, b) => a.start - b.start || a.end - b.end);
  return evs;
}

export default function ScheduleGrid({
  day, obligations, scope, onEditShape, onEditObligation,
}: {
  day: DayShape;
  obligations: Obligation[];
  scope: Scope;
  onEditShape: (focus: ShapeFocus) => void;
  onEditObligation?: (index: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const evs = buildEvents(day, obligations, scope, onEditShape, onEditObligation);
  const minStart = Math.min(...evs.map((e) => e.start));
  const maxEnd = Math.max(...evs.map((e) => e.end));
  const startHour = Math.max(0, Math.floor(minStart / 60));
  const endHour = Math.min(24, Math.ceil(maxEnd / 60));
  const gridStart = startHour * 60;
  const gridHeight = Math.max(HOUR_H, (endHour - startHour) * HOUR_H);

  // Calendar-style layout: only events that actually overlap in time share the
  // width (split into side-by-side columns within their overlap "cluster");
  // everything else is full width. evs is already sorted by start.
  const lay: { col: number; cols: number }[] = new Array(evs.length);
  let ci = 0;
  while (ci < evs.length) {
    let clusterEnd = evs[ci].end;
    const idxs = [ci];
    let cj = ci + 1;
    while (cj < evs.length && evs[cj].start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, evs[cj].end);
      idxs.push(cj);
      cj++;
    }
    const colEnd: number[] = [];
    const colOf: number[] = [];
    for (const k of idxs) {
      let c = colEnd.findIndex((en) => evs[k].start >= en);
      if (c === -1) { c = colEnd.length; colEnd.push(0); }
      colEnd[c] = evs[k].end;
      colOf.push(c);
    }
    const cols = colEnd.length;
    idxs.forEach((k, t) => { lay[k] = { col: colOf[t], cols }; });
    ci = cj;
  }

  return (
    <View style={styles.wrap}>
      {/* Timepage-style "SCHEDULE" eyebrow with a collapse chevron */}
      <TouchableOpacity
        style={styles.head}
        activeOpacity={0.7}
        onPress={() => setCollapsed((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expand schedule' : 'Collapse schedule'}
      >
        <Text style={styles.eyebrow}>SCHEDULE</Text>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {!collapsed ? (
        <View style={[styles.grid, { height: gridHeight }]}>
          {/* Hour lines + labels */}
          {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
            const h = startHour + i;
            const top = i * HOUR_H;
            return (
              <View key={`h-${h}`} pointerEvents="none" style={[styles.hourRow, { top }]}>
                <Text style={styles.hourLabel}>{hourLabel(h)}</Text>
                <View style={styles.hourLine} />
              </View>
            );
          })}

          {/* Event cards — positioned within a lane area to the right of the gutter */}
          <View pointerEvents="box-none" style={styles.lane}>
            {evs.map((e, idx) => {
              const { col, cols } = lay[idx];
              const top = ((e.start - gridStart) / 60) * HOUR_H;
              const height = Math.max(((e.end - e.start) / 60) * HOUR_H, MIN_CARD_H);
              const compact = height < 54;
              const tiny = height < 38;
              return (
                <View
                  key={e.key}
                  pointerEvents="box-none"
                  style={{ position: 'absolute', top, height, left: `${(col / cols) * 100}%` as any, width: `${(1 / cols) * 100}%` as any }}
                >
                  <TouchableOpacity
                    activeOpacity={e.onPress ? 0.85 : 1}
                    onPress={e.onPress}
                    disabled={!e.onPress}
                    style={styles.card}
                    accessibilityRole={e.onPress ? 'button' : undefined}
                    accessibilityLabel={`${e.label}, ${fmt12Compact(min2hhmm(e.start))}`}
                  >
                    <View style={[styles.accentBar, { backgroundColor: e.accent }]} />
                    <View style={[styles.cardBody, tiny && styles.cardBodyTiny]}>
                      <View style={styles.cardTopRow}>
                        <Ionicons name={e.icon as any} size={15} color={e.accent} style={{ marginRight: 6 }} />
                        <Text style={styles.cardTitle} numberOfLines={1}>{e.label}</Text>
                      </View>
                      {!tiny ? (
                        <Text style={styles.cardTime} numberOfLines={1}>
                          {fmt12Compact(min2hhmm(e.start))} – {fmt12Compact(min2hhmm(e.end))}
                        </Text>
                      ) : null}
                      {!compact && e.sub ? <Text style={styles.cardSub} numberOfLines={1}>{e.sub}</Text> : null}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// minutes-from-midnight → "HH:MM" (so we can reuse fmt12Compact for labels)
function min2hhmm(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const mn = mm % 60;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, marginBottom: 6,
  },
  eyebrow: { fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 1.4, color: colors.textMuted },

  grid: { position: 'relative', width: '100%' },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  hourLabel: {
    width: GUTTER - 12, textAlign: 'left', fontFamily: fonts.sansMedium, fontSize: 11.5,
    color: colors.textMuted, marginTop: -7,
  },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  lane: { position: 'absolute', left: GUTTER, right: 0, top: 0, bottom: 0 },
  card: {
    flex: 1, height: '100%', flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden',
    marginRight: 5, marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  accentBar: { width: 5 },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'flex-start' },
  cardBodyTiny: { paddingVertical: 4, justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.foreground, letterSpacing: -0.1 },
  cardTime: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  cardSub: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
});
