/**
 * DayEditorSheet — a bottom sheet for shaping ONE scope (all days, or a single
 * weekday). Everything is visual: drag the sliders, tap the segmented controls.
 *
 * Wake & sleep each offer a Range / Exact toggle:
 *   • Range  → a dual-thumb slider; the day's plan floats between the two times.
 *   • Exact  → a single thumb; one precise time.
 * Get-ready is an optional single time (Auto lets the coach decide). The Workout
 * is an optional [start, end] WINDOW the scheduler slots training into. Every
 * field is edited per day (the planner is per-day now — there is no "All days" view).
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
} from 'react-native'
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { Alert, InAppAlertHost } from '../InAppAlert';
import { useSwipeDownDismiss } from '../../hooks/useSwipeDownDismiss';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import TimePicker from './TimePicker';
import {
  DayShape,
  Scope,
  Weekday,
  WEEKDAYS,
  DayRecurrence,
  daysKey,
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
const READY_DEFAULT: [number, number] = [7 * 60, 7 * 60 + 30]; // 7:00–7:30
const READY_DEFAULT_HHMM: [string, string] = ['07:00', '07:30'];

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
  onCommit: (target: DayRecurrence, day: DayShape) => void;
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
  // Which days this edit applies to. Opening from "Your usual day" (scope='all')
  // defaults to Every day; opening from a specific weekday defaults to that day.
  const [applyTo, setApplyTo] = useState<DayRecurrence>(scope === 'all' ? 'all' : [scope]);
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
    setApplyTo(scope === 'all' ? 'all' : [scope]);
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
      ? `Bed by ${fmt12(d.sleepWindow[0])} · no fixed routine window`
      : `Wind down ${fmt12Compact(d.sleepWindow[0])} – ${fmt12Compact(d.sleepWindow[1])} · bed by ${fmt12Compact(d.sleepWindow[1])}`;

  // Get-ready is now a WINDOW (the AM routine spans it), not a single time.
  const readyWin = d.getReadyWindow;
  const readyVal: [number, number] = readyWin
    ? [toMin(readyWin[0]), toMin(readyWin[1])]
    : [READY_DEFAULT[0], READY_DEFAULT[1]];
  const setReady = (v: [number, number]) => {
    markDirty();
    setD((p) => ({ ...p, getReadyWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));
  };
  const toggleReady = (on: boolean) => {
    markDirty();
    setD((p) => ({ ...p, getReadyWindow: on ? p.getReadyWindow || READY_DEFAULT_HHMM : null }));
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
    onCommit(applyTo, d);
    onClose();
  };

  // "Apply to" options depend on where the sheet was opened from. Value is a
  // DayRecurrence; equality is by daysKey so the selected chip lights up.
  const applyOptions: { label: string; value: DayRecurrence }[] =
    scope === 'all'
      ? [
          { label: 'Every day', value: 'all' },
          { label: 'Weekdays', value: 'weekdays' },
          { label: 'Weekends', value: 'weekends' },
        ]
      : [
          { label: 'This day', value: [scope] },
          { label: 'Weekdays', value: 'weekdays' },
          { label: 'Weekends', value: 'weekends' },
          { label: 'Every day', value: 'all' },
        ];
  const applyKey = daysKey(applyTo);

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


  // Swipe the sheet down (from the grabber/header) to dismiss — routes through
  // requestClose so a dirty sheet still confirms before discarding.
  const { gesture, animatedStyle } = useSwipeDownDismiss(requestClose);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={requestClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <Animated.View style={[styles.sheet, { maxHeight: sheetMaxH }, animatedStyle]}>
            <GestureDetector gesture={gesture}>
              <View>
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
              </View>
            </GestureDetector>

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
                        <Text style={styles.sectionTitle}>Wind down</Text>
                      </View>
                    ) : null}
                    <Segmented
                      compact
                      options={[
                        { key: 'range', label: 'Window' },
                        { key: 'exact', label: 'Bedtime' },
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

              {/* Get ready — the morning routine WINDOW (skincare, shower, hair). */}
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
                      { key: 'set', label: 'Set window' },
                    ]}
                    value={readyWin ? 'set' : 'auto'}
                    onChange={(k) => toggleReady(k === 'set')}
                  />
                </View>
                {readyWin ? (
                  <>
                    <TimePicker
                      min={READY_MIN}
                      max={READY_MAX}
                      value={readyVal}
                      onChange={setReady}
                      format={fmtAbs}
                      accent="#5A5A62"
                    />
                    <Text style={styles.hint}>
                      Your AM routine runs {fmt12Compact(readyWin[0])} – {fmt12Compact(readyWin[1])}.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.autoHint}>
                    Max anchors your AM skincare, hair & routine just after you wake.
                  </Text>
                )}
                </View>
              ) : null}

              {/* Workout window — editable per day, like wake / wind-down / get-ready. */}
              {show('workout') ? (
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
              ) : null}

              {!focus && scope !== 'all' && overridden ? (
                <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
                  <Ionicons name="refresh" size={15} color={colors.textSecondary} />
                  <Text style={styles.resetText}>Reset {scopeLong} to base rhythm</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 12 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
              {/* Apply to — which days this edit recurs on. */}
              <View style={styles.applyRow}>
                <Text style={styles.applyLabel}>Apply to</Text>
                <View style={styles.applyChips}>
                  {applyOptions.map((opt) => {
                    const sel = daysKey(opt.value) === applyKey;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[styles.applyChip, sel && styles.applyChipSel]}
                        onPress={() => {
                          markDirty();
                          setApplyTo(opt.value);
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={`Apply to ${opt.label}`}
                      >
                        <Text style={[styles.applyChipText, sel && styles.applyChipTextSel]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity style={styles.doneBtn} onPress={done} activeOpacity={0.9}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
        {/* A host mounted INSIDE this sheet's Modal so the "Discard changes?"
            confirm renders ABOVE the sheet. Without it the alert routes to the
            root host, which iOS presents BEHIND this modal — making it invisible,
            so the X and swipe-down appeared to do nothing on a dirty sheet. */}
        <InAppAlertHost />
      </View>
    </Modal>
  );
}

const seg = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  item: {
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  itemCompact: {},
  itemOn: { borderBottomColor: colors.foreground },
  text: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.textMuted, letterSpacing: 0.1 },
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
    fontFamily: fonts.serif,
    fontSize: 21,
    color: colors.foreground,
    letterSpacing: -0.3,
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
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 10,
  },
  resetText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.textSecondary, letterSpacing: 0.1 },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  applyRow: {
    marginBottom: 12,
  },
  applyLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  applyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  applyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  applyChipSel: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  applyChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.foreground,
  },
  applyChipTextSel: {
    color: colors.background,
  },
  doneBtn: {
    backgroundColor: colors.foreground,
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
    color: colors.background,
    letterSpacing: 0.1,
  },
});
