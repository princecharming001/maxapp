/**
 * DayEditorSheet — a bottom sheet for shaping ONE scope (all days, or a single
 * weekday). It speaks the SAME language as the onboarding day-shape flow that
 * first set these times: white soft-shadow cards on a soft canvas, tappable
 * time rows, and the drum-wheel picker (WheelTime) — not a bespoke rail — so a
 * user never feels dropped into a different app.
 *
 * Wake & sleep each offer a Range / Exact toggle:
 *   • Range  → a start + end the plan floats between.
 *   • Exact  → one precise time.
 * Get-ready and the Workout are optional [start,end] WINDOWS (Auto lets the
 * coach decide). Every field is edited per scope.
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
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert, InAppAlertHost } from '../InAppAlert';
import { useSwipeDownDismiss } from '../../hooks/useSwipeDownDismiss';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import { WheelTimeOverlay, WheelTimeRow, WT, CARD_SOFT } from './WheelTime';
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
const WORKOUT_MIN_SPAN = 30; // a workout window stays at least 30 min wide
const READY_DEFAULT_HHMM: [string, string] = ['07:00', '07:30'];

const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

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

// Minimal underline tabs (active = ink text + 2px ink underline). The app's
// segmented device everywhere except onboarding — quiet, no filled pills.
function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <View style={tab.wrap}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            style={[tab.item, on && tab.itemOn]}
            activeOpacity={0.8}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[tab.text, on && tab.textOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// The field currently being picked (an in-sheet wheel overlay).
type PickerState = { title: string; value: number; onConfirm: (v: number) => void };

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
  const sheetMaxH = Math.round(winH * 0.9);

  const [d, setD] = useState<DayShape>(initial);
  const [wakeMode, setWakeMode] = useState<Mode>('range');
  const [sleepMode, setSleepMode] = useState<Mode>('range');
  const [applyTo, setApplyTo] = useState<DayRecurrence>(scope === 'all' ? 'all' : [scope]);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const markDirty = () => setDirty(true);

  // Re-seed the working copy each time the sheet opens (or the scope changes).
  useEffect(() => {
    if (!visible) return;
    setD(initial);
    setWakeMode(isExact(initial.wakeWindow) ? 'exact' : 'range');
    setSleepMode(isExact(initial.sleepWindow) ? 'exact' : 'range');
    setApplyTo(scope === 'all' ? 'all' : [scope]);
    setDirty(false);
    setPicker(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scope]);

  const scopeLong =
    scope === 'all' ? 'All days' : WEEKDAYS.find((w) => w.key === scope)?.long || '';

  // With a focus, render only that item's control; without one, the full day.
  const show = (k: ShapeFocus) => !focus || focus === k;

  // ── Wake (absolute minutes) ────────────────────────────────────────────────
  const setWakeWin = (win: [string, string]) => {
    markDirty();
    setD((p) => ({ ...p, wakeWindow: win }));
  };
  const editWake = (idx: 0 | 1, wheelV: number) => {
    const cur = [toMin(d.wakeWindow[0]), toMin(d.wakeWindow[1])] as [number, number];
    if (idx === 0) setWakeWin([minToHHMM(wheelV), minToHHMM(Math.max(cur[1], wheelV + 15))]);
    else setWakeWin([minToHHMM(Math.min(cur[0], wheelV - 15)), minToHHMM(wheelV)]);
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

  // ── Sleep (evening-normalised minutes) ─────────────────────────────────────
  const setSleepWin = (win: [string, string]) => {
    markDirty();
    setD((p) => ({ ...p, sleepWindow: win }));
  };
  const editSleep = (idx: 0 | 1, wheelV: number) => {
    const ev = eveMin(minToHHMM(wheelV));
    const cur = [eveMin(d.sleepWindow[0]), eveMin(d.sleepWindow[1])] as [number, number];
    if (idx === 0) setSleepWin([minToHHMM(ev), minToHHMM(Math.max(cur[1], ev + 15))]);
    else setSleepWin([minToHHMM(Math.min(cur[0], ev - 15)), minToHHMM(ev)]);
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

  // ── Get-ready + Workout (optional absolute windows) ────────────────────────
  const readyWin = d.getReadyWindow;
  const setReadyWin = (win: [string, string]) => {
    markDirty();
    setD((p) => ({ ...p, getReadyWindow: win }));
  };
  const editReady = (idx: 0 | 1, wheelV: number) => {
    const w = readyWin || READY_DEFAULT_HHMM;
    const cur = [toMin(w[0]), toMin(w[1])] as [number, number];
    if (idx === 0) setReadyWin([minToHHMM(wheelV), minToHHMM(Math.max(cur[1], wheelV + 15))]);
    else setReadyWin([minToHHMM(Math.min(cur[0], wheelV - 15)), minToHHMM(wheelV)]);
  };
  const toggleReady = (on: boolean) => {
    markDirty();
    setD((p) => ({ ...p, getReadyWindow: on ? p.getReadyWindow || READY_DEFAULT_HHMM : null }));
  };

  const workoutWin = d.workoutWindow;
  const setWorkoutWin = (win: [string, string]) => {
    markDirty();
    setD((p) => ({ ...p, workoutWindow: win }));
  };
  const editWorkout = (idx: 0 | 1, wheelV: number) => {
    const w = workoutWin || ['17:00', '19:00'];
    const cur = [toMin(w[0]), toMin(w[1])] as [number, number];
    if (idx === 0) setWorkoutWin([minToHHMM(wheelV), minToHHMM(Math.max(cur[1], wheelV + WORKOUT_MIN_SPAN))]);
    else setWorkoutWin([minToHHMM(Math.min(cur[0], wheelV - WORKOUT_MIN_SPAN)), minToHHMM(wheelV)]);
  };
  const toggleWorkout = (on: boolean) => {
    markDirty();
    setD((p) => ({ ...p, workoutWindow: on ? p.workoutWindow || ['17:00', '19:00'] : null }));
  };

  // Open the wheel overlay for one field. `value` is 0..1439 wheel space.
  const openPicker = (title: string, value: number, onConfirm: (v: number) => void) =>
    setPicker({ title, value, onConfirm });

  const wakeHint =
    wakeMode === 'exact'
      ? `Wake at ${fmt12(d.wakeWindow[0])}`
      : `Wake anytime between ${fmt12Compact(d.wakeWindow[0])} and ${fmt12Compact(d.wakeWindow[1])}`;
  const sleepHint =
    sleepMode === 'exact'
      ? `Bed by ${fmt12(d.sleepWindow[0])} · no fixed routine window`
      : `Wind down ${fmt12Compact(d.sleepWindow[0])} – ${fmt12Compact(d.sleepWindow[1])} · bed by ${fmt12Compact(d.sleepWindow[1])}`;

  const done = () => {
    onCommit(applyTo, d);
    onClose();
  };

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
    if (picker) { setPicker(null); return; }
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved edits.',
      [
        { text: 'Cancel', style: 'cancel' },
        // Defer the parent-sheet dismissal a tick: the alert lives in a nested
        // <Modal> stacked on THIS sheet's <Modal>. Dismissing both in the same
        // frame is the iOS two-modal deadlock. Let the alert modal finish
        // tearing down first, then close the sheet.
        { text: 'Discard', style: 'destructive', onPress: () => setTimeout(onClose, 0) },
      ],
      { cancelable: true },
    );
  };

  // Swipe the sheet down (from the grabber/header) to dismiss.
  const { gesture, animatedStyle } = useSwipeDownDismiss(requestClose);

  // A titled white card wrapping a section's head (title + mode tabs) and body.
  const Card = ({
    icon,
    title,
    tabs,
    children,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    tabs: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <View style={styles.card}>
      <View style={[styles.cardHead, focus && styles.cardHeadFocused]}>
        {!focus ? (
          <View style={styles.titleWrap}>
            <Ionicons name={icon} size={15} color={WT.INK} />
            <Text style={styles.cardTitle}>{title}</Text>
          </View>
        ) : null}
        {tabs}
      </View>
      {children}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      {/* RN Modal renders in a SEPARATE native root outside the app's root
          GestureHandlerRootView, so gestures inside it get no touches until we
          mount our own root here. */}
      <GestureHandlerRootView style={styles.ghRoot}>
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
                    <Ionicons name="close" size={22} color={WT.MUTE} />
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
                <>
                  <Card
                    icon="sunny-outline"
                    title="Wake up"
                    tabs={
                      <Tabs
                        options={[{ key: 'range', label: 'Range' }, { key: 'exact', label: 'Exact' }]}
                        value={wakeMode}
                        onChange={(k) => switchWakeMode(k as Mode)}
                      />
                    }
                  >
                    <View style={styles.hair} />
                    {wakeMode === 'exact' ? (
                      <WheelTimeRow
                        label="Wake at"
                        display={fmt12(d.wakeWindow[0])}
                        onPress={() => openPicker('Wake up', toMin(d.wakeWindow[0]), (v) => setWakeWin([minToHHMM(v), minToHHMM(v)]))}
                      />
                    ) : (
                      <>
                        <WheelTimeRow
                          label="Earliest"
                          display={fmt12(d.wakeWindow[0])}
                          onPress={() => openPicker('Earliest wake', toMin(d.wakeWindow[0]), (v) => editWake(0, v))}
                        />
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="Latest"
                          display={fmt12(d.wakeWindow[1])}
                          onPress={() => openPicker('Latest wake', toMin(d.wakeWindow[1]), (v) => editWake(1, v))}
                        />
                      </>
                    )}
                  </Card>
                  <Text style={styles.hint}>{wakeHint}</Text>
                </>
              ) : null}

              {/* Sleep */}
              {show('sleep') ? (
                <>
                  <Card
                    icon="moon-outline"
                    title="Wind down"
                    tabs={
                      <Tabs
                        options={[{ key: 'range', label: 'Window' }, { key: 'exact', label: 'Bedtime' }]}
                        value={sleepMode}
                        onChange={(k) => switchSleepMode(k as Mode)}
                      />
                    }
                  >
                    <View style={styles.hair} />
                    {sleepMode === 'exact' ? (
                      <WheelTimeRow
                        label="Bed by"
                        display={fmt12(d.sleepWindow[0])}
                        onPress={() => openPicker('Bedtime', toMin(d.sleepWindow[0]), (v) => {
                          const hh = minToHHMM(v);
                          setSleepWin([hh, hh]);
                        })}
                      />
                    ) : (
                      <>
                        <WheelTimeRow
                          label="Wind down from"
                          display={fmt12(d.sleepWindow[0])}
                          onPress={() => openPicker('Wind down from', toMin(d.sleepWindow[0]), (v) => editSleep(0, v))}
                        />
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="Bed by"
                          display={fmt12(d.sleepWindow[1])}
                          onPress={() => openPicker('Bed by', toMin(d.sleepWindow[1]), (v) => editSleep(1, v))}
                        />
                      </>
                    )}
                  </Card>
                  <Text style={styles.hint}>{sleepHint}</Text>
                </>
              ) : null}

              {/* Get ready — the morning routine WINDOW (skincare, shower, hair). */}
              {show('ready') ? (
                <>
                  <Card
                    icon="water-outline"
                    title="Get ready"
                    tabs={
                      <Tabs
                        options={[{ key: 'auto', label: 'Auto' }, { key: 'set', label: 'Set window' }]}
                        value={readyWin ? 'set' : 'auto'}
                        onChange={(k) => toggleReady(k === 'set')}
                      />
                    }
                  >
                    {readyWin ? (
                      <>
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="Starts"
                          display={fmt12(readyWin[0])}
                          onPress={() => openPicker('Get ready starts', toMin(readyWin[0]), (v) => editReady(0, v))}
                        />
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="Ends"
                          display={fmt12(readyWin[1])}
                          onPress={() => openPicker('Get ready ends', toMin(readyWin[1]), (v) => editReady(1, v))}
                        />
                      </>
                    ) : (
                      <Text style={styles.autoInCard}>
                        Max anchors your AM skincare, hair & routine just after you wake.
                      </Text>
                    )}
                  </Card>
                  {readyWin ? (
                    <Text style={styles.hint}>
                      Your AM routine runs {fmt12Compact(readyWin[0])} – {fmt12Compact(readyWin[1])}.
                    </Text>
                  ) : null}
                </>
              ) : null}

              {/* Workout window */}
              {show('workout') ? (
                <>
                  <Card
                    icon="barbell-outline"
                    title="Workout window"
                    tabs={
                      <Tabs
                        options={[{ key: 'auto', label: 'Auto' }, { key: 'set', label: 'Set window' }]}
                        value={workoutWin ? 'set' : 'auto'}
                        onChange={(k) => toggleWorkout(k === 'set')}
                      />
                    }
                  >
                    {workoutWin ? (
                      <>
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="From"
                          display={fmt12(workoutWin[0])}
                          onPress={() => openPicker('Workout from', toMin(workoutWin[0]), (v) => editWorkout(0, v))}
                        />
                        <View style={styles.hair} />
                        <WheelTimeRow
                          label="To"
                          display={fmt12(workoutWin[1])}
                          onPress={() => openPicker('Workout to', toMin(workoutWin[1]), (v) => editWorkout(1, v))}
                        />
                      </>
                    ) : (
                      <Text style={styles.autoInCard}>
                        Max slots lifts, stretches & post-workout fuel into a free part of your day.
                      </Text>
                    )}
                  </Card>
                  {workoutWin ? (
                    <Text style={styles.hint}>
                      Max fits your workout between {fmt12Compact(workoutWin[0])} and {fmt12Compact(workoutWin[1])}.
                    </Text>
                  ) : null}
                </>
              ) : null}

              {!focus && scope !== 'all' && overridden ? (
                <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
                  <Ionicons name="refresh" size={15} color={WT.SUB} />
                  <Text style={styles.resetText}>Reset {scopeLong} to base rhythm</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 2 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
              <View style={styles.applyRow}>
                <Text style={styles.applyLabel}>Applies to</Text>
                <Tabs
                  options={applyOptions.map((o) => ({ key: daysKey(o.value), label: o.label }))}
                  value={applyKey}
                  onChange={(k) => {
                    const opt = applyOptions.find((o) => daysKey(o.value) === k);
                    if (!opt) return;
                    markDirty();
                    setApplyTo(opt.value);
                  }}
                />
              </View>
              <TouchableOpacity style={styles.doneBtn} onPress={done} activeOpacity={0.9}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>

        {/* Drum-wheel picker — an in-sheet overlay within THIS modal (never a
            second <Modal>, which would trip the two-modals-at-once iOS freeze). */}
        {picker ? (
          <WheelTimeOverlay
            title={picker.title}
            value={picker.value}
            onClose={() => setPicker(null)}
            onConfirm={(v) => { picker.onConfirm(v); setPicker(null); }}
          />
        ) : null}

        {/* Alert host mounted INSIDE this sheet's Modal so the "Discard changes?"
            confirm renders ABOVE the sheet. */}
        <InAppAlertHost />
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const tab = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', rowGap: 8 },
  item: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  itemOn: { borderBottomColor: WT.INK },
  text: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.MUTE, letterSpacing: 0.1 },
  textOn: { fontFamily: fonts.sansSemiBold, color: WT.INK },
});

const styles = StyleSheet.create({
  ghRoot: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: WT.BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 10,
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
    fontSize: 24,
    color: WT.INK,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: WT.MUTE,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  content: { paddingBottom: 6, paddingTop: 4 },

  // White soft-shadow card per section — the onboarding shapeCard.
  card: {
    backgroundColor: WT.CARD,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingBottom: 4,
    marginTop: spacing.md,
    ...CARD_SOFT,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  cardHeadFocused: { justifyContent: 'flex-end', paddingTop: 14 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, paddingRight: 8 },
  cardTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: WT.INK,
    letterSpacing: 0.1,
  },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: WT.HAIR },
  hint: { fontSize: 12.5, color: WT.SUB, letterSpacing: 0.1, marginTop: 8, marginLeft: 4 },
  autoInCard: {
    fontSize: 13,
    color: WT.MUTE,
    lineHeight: 19,
    letterSpacing: 0.1,
    paddingTop: 12,
    paddingBottom: 14,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 10,
  },
  resetText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.SUB, letterSpacing: 0.1 },
  footer: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: WT.HAIR,
  },
  applyRow: { marginBottom: 16 },
  applyLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: WT.INK,
    letterSpacing: 0.1,
    marginBottom: 10,
  },
  doneBtn: {
    backgroundColor: WT.INK,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 16,
    alignItems: 'center',
    ...CARD_SOFT,
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15.5,
    color: WT.ON_INK,
    letterSpacing: 0.2,
  },
});
