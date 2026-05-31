/**
 * DayEditorSheet — a bottom sheet for shaping ONE scope (all days, or a single
 * weekday). Everything is visual: drag the sliders, tap the segmented controls.
 *
 * Wake & sleep each offer a Range / Exact toggle:
 *   • Range  → a dual-thumb slider; the day's plan floats between the two times.
 *   • Exact  → a single thumb; one precise time.
 * Get-ready & workout are optional single times (Auto lets the coach decide).
 * Work is Off / Flexible / Fixed (fixed reveals an hours slider the scheduler
 * keeps every routine outside of). Obligations are free-form busy blocks.
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
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../theme/dark';
import TimeRangeSlider from './TimeRangeSlider';
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
const WORK_MIN = 300; // 5 AM
const WORK_MAX = 1380; // 11 PM
const WORKOUT_MIN = 300; // 5 AM
const WORKOUT_MAX = 1320; // 10 PM
const READY_MIN = 240; // 4 AM
const READY_MAX = 780; // 1 PM
const OB_MIN = 0;
const OB_MAX = 1440;

const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const fmtAbs = (m: number) => fmt12Compact(minToHHMM(m));

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
  onClose,
  onCommit,
  onReset,
}: {
  visible: boolean;
  scope: Scope;
  initial: DayShape;
  overridden: boolean;
  onClose: () => void;
  onCommit: (scope: Scope, day: DayShape) => void;
  onReset: (scope: Weekday) => void;
}) {
  const [d, setD] = useState<DayShape>(initial);
  const [wakeMode, setWakeMode] = useState<Mode>('range');
  const [sleepMode, setSleepMode] = useState<Mode>('range');
  const [obLabel, setObLabel] = useState('');
  const [obRange, setObRange] = useState<[number, number]>([540, 600]);

  // Re-seed the working copy each time the sheet opens (or the scope changes).
  useEffect(() => {
    if (!visible) return;
    setD(initial);
    setWakeMode(isExact(initial.wakeWindow) ? 'exact' : 'range');
    setSleepMode(isExact(initial.sleepWindow) ? 'exact' : 'range');
    setObLabel('');
    setObRange([540, 600]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scope]);

  const scopeLong =
    scope === 'all' ? 'All days' : WEEKDAYS.find((w) => w.key === scope)?.long || '';

  const wakeVal: [number, number] = [toMin(d.wakeWindow[0]), toMin(d.wakeWindow[1])];
  const sleepVal: [number, number] = [eveMin(d.sleepWindow[0]), eveMin(d.sleepWindow[1])];

  const setWake = (v: [number, number]) =>
    setD((p) => ({ ...p, wakeWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));
  const setSleep = (v: [number, number]) =>
    setD((p) => ({ ...p, sleepWindow: [minToHHMM(v[0]), minToHHMM(v[1])] }));

  const switchWakeMode = (m: Mode) => {
    if (m === wakeMode) return;
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

  const setOptional = (key: 'getReadyTime' | 'workoutTime', val: string | null) =>
    setD((p) => ({ ...p, [key]: val }));

  const addObligation = () => {
    if (obRange[1] <= obRange[0]) return;
    const start = minToHHMM(obRange[0]);
    const end = minToHHMM(obRange[1]);
    setD((p) => ({
      ...p,
      obligations: [...p.obligations, { label: obLabel.trim() || 'Busy', start, end }],
    }));
    setObLabel('');
    setObRange([540, 600]);
  };

  const removeObligation = (idx: number) =>
    setD((p) => ({ ...p, obligations: p.obligations.filter((_, i) => i !== idx) }));

  const done = () => {
    onCommit(scope, d);
    onClose();
  };

  const reset = () => {
    if (scope !== 'all') onReset(scope);
    onClose();
  };

  const renderOptional = (opts: {
    key: 'getReadyTime' | 'workoutTime';
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    accent: string;
    domain: [number, number];
    fallback: string;
    autoHint: string;
  }) => {
    const value = d[opts.key];
    const isSet = !!value;
    const v = toMin(value || opts.fallback);
    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleWrap}>
            <Ionicons name={opts.icon} size={16} color={colors.foreground} />
            <Text style={styles.sectionTitle}>{opts.title}</Text>
          </View>
          <Segmented
            compact
            options={[
              { key: 'auto', label: 'Auto' },
              { key: 'set', label: 'Set time' },
            ]}
            value={isSet ? 'set' : 'auto'}
            onChange={(k) => setOptional(opts.key, k === 'auto' ? null : value || opts.fallback)}
          />
        </View>
        {isSet ? (
          <TimeRangeSlider
            single
            min={opts.domain[0]}
            max={opts.domain[1]}
            value={[v, v]}
            onChange={(nv) => setOptional(opts.key, minToHHMM(nv[0]))}
            format={fmtAbs}
            accent={opts.accent}
          />
        ) : (
          <Text style={styles.autoHint}>{opts.autoHint}</Text>
        )}
      </View>
    );
  };

  const workValue: 'off' | 'flexible' | 'fixed' = d.workSchedule || 'off';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{scopeLong}</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView
              style={{ maxHeight: '100%' }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Wake */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <View style={styles.sectionTitleWrap}>
                    <Ionicons name="sunny-outline" size={16} color={colors.foreground} />
                    <Text style={styles.sectionTitle}>Wake up</Text>
                  </View>
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
                <TimeRangeSlider
                  single={wakeMode === 'exact'}
                  min={WAKE_MIN}
                  max={WAKE_MAX}
                  value={wakeVal}
                  onChange={setWake}
                  format={fmtAbs}
                  accent="#f59e0b"
                />
                <Text style={styles.hint}>{wakeHint}</Text>
              </View>

              {/* Sleep */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <View style={styles.sectionTitleWrap}>
                    <Ionicons name="moon-outline" size={16} color={colors.foreground} />
                    <Text style={styles.sectionTitle}>Go to sleep</Text>
                  </View>
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
                <TimeRangeSlider
                  single={sleepMode === 'exact'}
                  min={SLEEP_MIN}
                  max={SLEEP_MAX}
                  value={sleepVal}
                  onChange={setSleep}
                  format={fmtAbs}
                  accent="#6366f1"
                />
                <Text style={styles.hint}>{sleepHint}</Text>
              </View>

              <View style={styles.divider} />

              {renderOptional({
                key: 'getReadyTime',
                title: 'Shower / get ready',
                icon: 'water-outline',
                accent: '#06b6d4',
                domain: [READY_MIN, READY_MAX],
                fallback: '07:00',
                autoHint: 'Max anchors your AM skin, hair & mewing routine around your wake time.',
              })}

              {renderOptional({
                key: 'workoutTime',
                title: 'Workout',
                icon: 'barbell-outline',
                accent: '#22c55e',
                domain: [WORKOUT_MIN, WORKOUT_MAX],
                fallback: '18:00',
                autoHint: 'Max slots lifts, stretches & post-workout fuel into a free part of your day.',
              })}

              <View style={styles.divider} />

              {/* Work */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <View style={styles.sectionTitleWrap}>
                    <Ionicons name="briefcase-outline" size={16} color={colors.foreground} />
                    <Text style={styles.sectionTitle}>Work / school</Text>
                  </View>
                  <Segmented
                    compact
                    options={[
                      { key: 'off', label: 'Off' },
                      { key: 'flexible', label: 'Flexible' },
                      { key: 'fixed', label: 'Fixed' },
                    ]}
                    value={workValue}
                    onChange={(k) =>
                      setD((p) => ({ ...p, workSchedule: k === 'off' ? null : (k as 'flexible' | 'fixed') }))
                    }
                  />
                </View>
                {workValue === 'fixed' ? (
                  <>
                    <TimeRangeSlider
                      min={WORK_MIN}
                      max={WORK_MAX}
                      value={[toMin(d.workStart), toMin(d.workEnd)]}
                      onChange={(v) =>
                        setD((p) => ({ ...p, workStart: minToHHMM(v[0]), workEnd: minToHHMM(v[1]) }))
                      }
                      format={fmtAbs}
                      accent="#3b82f6"
                    />
                    <Text style={styles.hint}>
                      Busy {fmt12Compact(d.workStart)} – {fmt12Compact(d.workEnd)}. Max keeps routines outside.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.autoHint}>
                    {workValue === 'flexible'
                      ? 'Max spreads routines through the day without a hard work block.'
                      : 'No work block — your whole day is open.'}
                  </Text>
                )}
              </View>

              <View style={styles.divider} />

              {/* Obligations */}
              <View style={styles.section}>
                <View style={styles.sectionTitleWrap}>
                  <Ionicons name="calendar-clear-outline" size={16} color={colors.foreground} />
                  <Text style={styles.sectionTitle}>Obligations</Text>
                </View>
                <Text style={styles.autoHint}>
                  Anything that recurs — a class, commute, or pickup. Max works around each.
                </Text>

                {d.obligations.map((o, idx) => (
                  <View style={styles.obRow} key={`${o.label}-${idx}`}>
                    <View style={styles.obDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.obLabel}>{o.label}</Text>
                      <Text style={styles.obTime}>
                        {fmt12(o.start)} – {fmt12(o.end)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeObligation(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.addBox}>
                  <TextInput
                    style={styles.addInput}
                    value={obLabel}
                    onChangeText={setObLabel}
                    placeholder="What is it? (e.g. commute)"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                  />
                  <View style={styles.addSlider}>
                    <TimeRangeSlider
                      min={OB_MIN}
                      max={OB_MAX}
                      value={obRange}
                      onChange={setObRange}
                      format={fmtAbs}
                      accent="#f59e0b"
                      ticksEvery={180}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.addBtn, obRange[1] <= obRange[0] && styles.addBtnOff]}
                    onPress={addObligation}
                    disabled={obRange[1] <= obRange[0]}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add" size={18} color={colors.foreground} />
                    <Text style={styles.addBtnText}>Add obligation</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {scope !== 'all' && overridden ? (
                <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
                  <Ionicons name="refresh" size={15} color={colors.textSecondary} />
                  <Text style={styles.resetText}>Reset {scopeLong} to base rhythm</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 12 }} />
            </ScrollView>

            <View style={styles.footer}>
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
    borderRadius: borderRadius.full,
    padding: 3,
  },
  item: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: borderRadius.full },
  itemCompact: { paddingHorizontal: 12, paddingVertical: 6 },
  itemOn: {
    backgroundColor: colors.card,
    shadowColor: '#0a0a0b',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
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
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    maxHeight: '90%',
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
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  content: { paddingBottom: spacing.md },
  section: { marginTop: spacing.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
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
  obRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    marginTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  obDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#f59e0b', marginRight: 12 },
  obLabel: { fontSize: 14.5, color: colors.foreground, fontWeight: '500', letterSpacing: 0.05 },
  obTime: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  addBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
  },
  addInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '500',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addSlider: { marginTop: spacing.md, marginBottom: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 11,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.foreground,
    backgroundColor: colors.card,
  },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { fontSize: 13.5, fontWeight: '600', color: colors.foreground, letterSpacing: 0.2 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: spacing.xl,
    paddingVertical: 12,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  resetText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.1 },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  doneBtn: {
    backgroundColor: colors.foreground,
    borderRadius: borderRadius.full,
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
