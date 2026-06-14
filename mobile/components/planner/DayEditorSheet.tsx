/**
 * DayEditorSheet — a bottom sheet for shaping ONE scope (all days, or a single
 * weekday). Everything is visual: drag the sliders, tap the segmented controls.
 *
 * Wake & sleep each offer a Range / Exact toggle:
 *   • Range  → a dual-thumb slider; the day's plan floats between the two times.
 *   • Exact  → a single thumb; one precise time.
 * Get-ready is an optional single time (Auto lets the coach decide). The Workout
 * is an optional [start, end] WINDOW the scheduler slots training into — it's a
 * default-level preference, so it only appears when editing "All days".
 *
 * Obligations (work, classes, commutes…) are NOT edited here — they're a global,
 * day-scoped list managed on the planner screen.
 *
 * "Done" hands the edited DayShape back to the orchestrator, which diffs it
 * against the base to store a minimal per-weekday override.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import TimePicker from './TimePicker';
import {
  DayShape,
  Scope,
  Weekday,
  WEEKDAYS,
  toMin,
  minToHHMM,
  eveMin,
  fmt12,
  fmt12Compact,
  isExact,
} from './plannerModel';

const WAKE_MIN = 240; // 4 AM
const WAKE_MAX = 780; // 1 PM
const SLEEP_MIN = 1080; // 6 PM
const SLEEP_MAX = 1680; // 4 AM (next day, evening-normalised)
const WORKOUT_MIN = 300; // 5 AM
const WORKOUT_MAX = 1320; // 10 PM
const WORKOUT_MIN_SPAN = 30; // a workout window stays at least 30 min wide
const READY_MIN = 240; // 4 AM
const READY_MAX = 780; // 1 PM

const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const fmtAbs = (m: number) => fmt12Compact(minToHHMM(m));

// When an arrow on the timeline is tapped, the sheet opens scoped to just that
// one item rather than the whole day. `undefined` shows every control.
export type ShapeFocus = 'wake' | 'ready' | 'workout' | 'sleep';

const FOCUS_TITLE: Record<ShapeFocus, string> = {
  wake: 'Wake up',
  ready: 'Get ready',
  workout: 'Workout window',
  sleep: 'Wind down',
};

type Mode = 'range' | 'exact';

function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={seg.wrap}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            style={[seg.item, compact && seg.itemCompact, on && seg.itemOn]}
            activeOpacity={0.8}
            onPress={() => onChange(o.key)}
          >
            <Text style={[seg.text, on && seg.textOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function DayEditorSheet({
  visible,
  scope,
  initial,
  overridden,
  focus,
  onClose,
  onCommit,
  onReset,
}: {
  visible: boolean;
  scope: Scope;
  initial: DayShape;
  overridden: boolean;
  focus?: ShapeFocus;
  onClose: () => void;
  onCommit: (scope: Scope, day: DayShape) => void;
  onReset: (scope: Weekday) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Numeric cap so the sheet has a DEFINITE height — a percentage maxHeight is
  // ignored when the parent has no fixed height, which let content overflow.
  const sheetMaxH = Math.round(winH * 0.9);

  const [d, setD] = useState<DayShape>(initial);
  const [wakeMode, setWakeMode] = useState<Mode>('range');
  const [sleepMode, setSleepMode] = useState<Mode>('range');
  // True once the user changes any value, so dismissing via backdrop / X /
  // hardware back can warn before silently discarding edits.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty(true);

  // Re-seed the working copy each time the sheet opens (or the scope changes).
  useEffect(() => {
    if (!visible) return;
    setD(initial);
    setWakeMode(isExact(initial.wakeWindow) ? 'exact' : 'range');
    setSleepMode(isExact(initial.sleepWindow) ? 'exact' : 'range');
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scope]);

  const scopeLong =
    scope === 'all' ? 'All days' : WEEKDAYS.find((w) => w.key === scope)?.long || '';

  // With a focus, render only that item's control; without one, the full day.
  const show = (k: ShapeFocus) => !focus || focus === k;

  const wakeVal: [number, number] = [toMin(d.wakeWindow[0]), toMin(d.wakeWindow[1])];
  const sleepVal: [number, number] = [eveMin(d.sleepWindow[0]), eveMin(d.sleepWindow[1])];

  const setWake = (v: [number, number]) => {
    markDirty();
    setD((p) => ({ ...p, wakeWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));
  };
  const setSleep = (v: [number, number]) => {
    markDirty();
    setD((p) => ({ ...p, sleepWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));
  };

  const switchWakeMode = (m: Mode) => {
    if (m === wakeMode) return;
    markDirty();
    setD((p) => {
      const a = toMin(p.wakeWindow[0]);
      const b = toMin(p.wakeWindow[1]);
      if (m === 'exact') {
        const mid = clampN(Math.round((a + b) / 2 / 15) * 15, WAKE_MIN, WAKE_MAX);
        return { ...p, wakeWindow: [minToHHMM(mid), minToHHMM(mid)] };
      }
      const lo = clampN(a - 30, WAKE_MIN, WAKE_MAX - 15);
      const hi = clampN(a + 30, lo + 15, WAKE_MAX);
      return { ...p, wakeWindow: [minToHHMM(lo), minToHHMM(hi)] };
    });
    setWakeMode(m);
  };

  const switchSleepMode = (m: Mode) => {
    if (m === sleepMode) return;
    markDirty();
    setD((p) => {
      const a = eveMin(p.sleepWindow[0]);
      const b = eveMin(p.sleepWindow[1]);
      if (m === 'exact') {
        const mid = clampN(Math.round((a + b) / 2 / 15) * 15, SLEEP_MIN, SLEEP_MAX);
        return { ...p, sleepWindow: [minToHHMM(mid), minToHHMM(mid)] };
      }
      const lo = clampN(a - 30, SLEEP_MIN, SLEEP_MAX - 15);
      const hi = clampN(a + 30, lo + 15, SLEEP_MAX);
      return { ...p, sleepWindow: [minToHHMM(lo), minToHHMM(hi)] };
    });
    setSleepMode(m);
  };

  const wakeHint =
    wakeMode === 'exact'
      ? `Wake at ${fmt12(d.wakeWindow[0])}`
      : `Wake anytime between ${fmt12Compact(d.wakeWindow[0])} and ${fmt12Compact(d.wakeWindow[1])}`;
  const sleepHint =
    sleepMode === 'exact'
      ? `Asleep by ${fmt12(d.sleepWindow[0])}`
      : `Asleep between ${fmt12Compact(d.sleepWindow[0])} and ${fmt12Compact(d.sleepWindow[1])}`;

  const setGetReady = (val: string | null) => {
    markDirty();
    setD((p) => ({ ...p, getReadyTime: val }));
  };

  // Workout is an optional [start,end] window (default-level only). Reject any
  // drag that would shrink it below the minimum span so it never collapses.
  const setWorkout = (v: [number, number]) => {
    if (v[1] - v[0] < WORKOUT_MIN_SPAN) return;
    markDirty();
    setD((p) => ({ ...p, workoutWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));
  };
  const toggleWorkout = (on: boolean) => {
    markDirty();
    setD((p) => ({ ...p, workoutWindow: on ? p.workoutWindow || ['17:00', '19:00'] : null }));
  };

  const done = () => {
    onCommit(scope, d);
    onClose();
  };

  const reset = () => {
    if (scope !== 'all') onReset(scope);
    onClose();
  };

  // Dismiss via backdrop tap, the X, or Android hardware back. Edits only
  // commit on "Done", so warn before throwing away unsaved changes.
  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved edits.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ],
      { cancelable: true },
    );
  };

  const readyValue = d.getReadyTime;
  const readyMin = toMin(readyValue || '07:00');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={requestClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { maxHeight: sheetMaxH }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <TouchableOpacity onPress={requestClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>{focus ? FOCUS_TITLE[focus] : scopeLong}</Text>
                {focus ? <Text style={styles.headerSub}>{scopeLong}</Text> : null}
              </View>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Wake */}
              {show('wake') ? (
                <View style={styles.section}>
                  <View style={[styles.sectionHead, focus && styles.sectionHeadFocused]}>
                    {!focus ? (
                      <View style={styles.sectionTitleWrap}>
                        <Ionicons name="sunny-outline" size={16} color={colors.foreground} />
                        <Text style={styles.sectionTitle}>Wake up</Text>
                      </View>
                    ) : null}
                    <Segmented
                      compact
                      options={[
                        { key: 'range', label: 'Range' },
                        { key: 'exact', label: 'Exact' },
                      ]}
                      value={wakeMode}
                      onChange={(k) => switchWakeMode(k as Mode)}
                    />
                  </View>
                  <TimePicker
                    single={wakeMode === 'exact'}
                    min={WAKE_MIN}
                    max={WAKE_MAX}
                    value={wakeVal}
                    onChange={setWake}
                    format={fmtAbs}
                    accent={colors.foreground}
                  />
                  <Text style={styles.hint}>{wakeHint}</Text>
                </View>
              ) : null}

              {/* Sleep */}
              {show('sleep') ? (
                <View style={styles.section}>
                  <View style={[styles.sectionHead, focus && styles.sectionHeadFocused]}>
                    {!focus ? (
                      <View style={styles.sectionTitleWrap}>
                        <Ionicons name="moon-outline" size={16} color={colors.foreground} />
                        <Text style={styles.sectionTitle}>Go to sleep</Text>
                      </View>
                    ) : null}
                    <Segmented
                      compact
                      options={[
                        { key: 'range', label: 'Range' },
                        { key: 'exact', label: 'Exact' },
                      ]}
                      value={sleepMode}
                      onChange={(k) => switchSleepMode(k as Mode)}
                    />
                  </View>
                  <TimePicker
                    single={sleepMode === 'exact'}
                    min={SLEEP_MIN}
                    max={SLEEP_MAX}
                    value={sleepVal}
                    onChange={setSleep}
                    format={fmtAbs}
                    accent={colors.foreground}
                  />
                  <Text style={styles.hint}>{sleepHint}</Text>
                </View>
              ) : null}

              {!focus ? <View style={styles.divider} /> : null}

              {/* Get ready (optional single time) */}
              {show('ready') ? (
                <View style={styles.section}>
                <View style={[styles.sectionHead, focus && styles.sectionHeadFocused]}>
                  {!focus ? (
                    <View style={styles.sectionTitleWrap}>
                      <Ionicons name="water-outline" size={16} color={colors.foreground} />
                      <Text style={styles.sectionTitle}>Get ready</Text>
                    </View>
                  ) : null}
                  <Segmented
                    compact
                    options={[
                      { key: 'auto', label: 'Auto' },
                      { key: 'set', label: 'Set time' },
                    ]}
                    value={readyValue ? 'set' : 'auto'}
                    onChange={(k) => setGetReady(k === 'auto' ? null : readyValue || '07:00')}
                  />
                </View>
                {readyValue ? (
                  <TimePicker
                    single
                    min={READY_MIN}
                    max={READY_MAX}
                    value={[readyMin, readyMin]}
                    onChange={(nv) => setGetReady(minToHHMM(nv[0]))}
                    format={fmtAbs}
                    accent="#5A5A62"
                  />
                ) : (
                  <Text style={styles.autoHint}>
                    Max anchors your AM skin, hair & mewing routine around your wake time.
                  </Text>
                )}
                </View>
              ) : null}

              {/* Workout window — default-level, so only on "All days". */}
              {show('workout') ? (scope === 'all' ? (
                <View style={styles.section}>
                  <View style={[styles.sectionHead, focus && styles.sectionHeadFocused]}>
                    {!focus ? (
                      <View style={styles.sectionTitleWrap}>
                        <Ionicons name="barbell-outline" size={16} color={colors.foreground} />
                        <Text style={styles.sectionTitle}>Workout window</Text>
                      </View>
                    ) : null}
                    <Segmented
                      compact
                      options={[
                        { key: 'auto', label: 'Auto' },
                        { key: 'set', label: 'Set window' },
                      ]}
                      value={d.workoutWindow ? 'set' : 'auto'}
                      onChange={(k) => toggleWorkout(k === 'set')}
                    />
                  </View>
                  {d.workoutWindow ? (
                    <>
                      <TimePicker
                        min={WORKOUT_MIN}
                        max={WORKOUT_MAX}
                        value={[toMin(d.workoutWindow[0]), toMin(d.workoutWindow[1])]}
                        onChange={setWorkout}
                        format={fmtAbs}
                        accent="#2F6B4E"
                        minSpan={WORKOUT_MIN_SPAN}
                      />
                      <Text style={styles.hint}>
                        Max fits your workout between {fmt12Compact(d.workoutWindow[0])} and{' '}
                        {fmt12Compact(d.workoutWindow[1])}.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.autoHint}>
                      Max slots lifts, stretches & post-workout fuel into a free part of your day.
                    </Text>
                  )}
                </View>
              ) : (
                // Workout is a default-level (all-days) setting. Show a quiet
                // placeholder on a single-day edit so the control doesn't feel
                // like it vanished, and point to where it lives.
                <View style={styles.section}>
                  {!focus ? (
                    <View style={styles.sectionHead}>
                      <View style={styles.sectionTitleWrap}>
                        <Ionicons name="barbell-outline" size={16} color={colors.textMuted} />
                        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Workout window</Text>
                      </View>
                    </View>
                  ) : null}
                  <Text style={styles.autoHint}>
                    Set once for all days. Open the All days view to change it.
                  </Text>
                </View>
              )) : null}

              {!focus && scope !== 'all' && overridden ? (
                <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
                  <Ionicons name="refresh" size={15} color={colors.textSecondary} />
                  <Text style={styles.resetText}>Reset {scopeLong} to base rhythm</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 12 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
              <TouchableOpacity style={styles.doneBtn} onPress={done} activeOpacity={0.9}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const seg = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 9,
    padding: 3,
  },
  item: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7 },
  itemCompact: { paddingHorizontal: 12, paddingVertical: 6 },
  itemOn: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  text: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textMuted, letterSpacing: 0.1 },
  textOn: { fontFamily: fonts.sansSemiBold, color: colors.foreground },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 18,
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  content: { paddingBottom: spacing.md },
  section: { marginTop: spacing.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    flexWrap: 'wrap',
    rowGap: 10,
  },
  sectionHeadFocused: { justifyContent: 'flex-end', marginBottom: spacing.sm },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, paddingRight: 8 },
  sectionTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.foreground,
    letterSpacing: 0.1,
  },
  hint: { fontSize: 12.5, color: colors.textSecondary, letterSpacing: 0.1, marginTop: 2 },
  autoHint: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 17,
    letterSpacing: 0.1,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginTop: spacing.lg,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: spacing.xl,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  resetText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 0.1 },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  doneBtn: {
    backgroundColor: colors.foreground,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.background,
    letterSpacing: 0.4,
  },
});
