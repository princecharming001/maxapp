import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';
import { TIME_OPTIONS, formatTime12h, hhmm } from '../../constants/profileLifestyleQuestionnaire';

type Obligation = { label: string; start: string; end: string };

// Mirror EditPersonal's hydration so both screens read/write the same
// onboarding fields and never drift. Nullable anchors (get ready / workout)
// stay null = "Auto" so the coach keeps its biology-anchored default unless
// the user pins a time.
function hydrate(ob: Record<string, any>) {
  const rawObs = Array.isArray(ob.obligations) ? ob.obligations : [];
  const obligations: Obligation[] = rawObs
    .filter((o: any) => o && typeof o === 'object' && o.start && o.end)
    .map((o: any) => ({
      label: String(o.label || '').trim() || 'Obligation',
      start: String(o.start),
      end: String(o.end),
    }));
  return {
    wakeTime: ob.wake_time || '07:00',
    sleepTime: ob.sleep_time || '23:00',
    getReadyTime: (ob.get_ready_time as string | undefined) || null,
    workoutTime: (ob.preferred_workout_time as string | undefined) || null,
    workSchedule: (ob.work_schedule as 'fixed' | 'flexible' | undefined) || null,
    workStart: ob.work_start || '09:00',
    workEnd: ob.work_end || '17:00',
    obligations,
  };
}

export default function DayPlannerScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const initial = hydrate((user?.onboarding || {}) as Record<string, any>);

  const [wakeTime, setWakeTime] = useState<string>(initial.wakeTime);
  const [sleepTime, setSleepTime] = useState<string>(initial.sleepTime);
  const [getReadyTime, setGetReadyTime] = useState<string | null>(initial.getReadyTime);
  const [workoutTime, setWorkoutTime] = useState<string | null>(initial.workoutTime);
  const [workSchedule, setWorkSchedule] = useState<'fixed' | 'flexible' | null>(initial.workSchedule);
  const [workStart, setWorkStart] = useState<string>(initial.workStart);
  const [workEnd, setWorkEnd] = useState<string>(initial.workEnd);
  const [obligations, setObligations] = useState<Obligation[]>(initial.obligations);

  // New-obligation draft form.
  const [obLabel, setObLabel] = useState('');
  const [obStart, setObStart] = useState('12:00');
  const [obEnd, setObEnd] = useState('13:00');

  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toMin = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  };

  const addObligation = () => {
    if (toMin(obEnd) <= toMin(obStart)) {
      Alert.alert('Check the times', 'The end time needs to be after the start time.');
      return;
    }
    const label = obLabel.trim() || 'Obligation';
    setObligations((prev) => [...prev, { label, start: hhmm(obStart), end: hhmm(obEnd) }]);
    setObLabel('');
    setObStart('12:00');
    setObEnd('13:00');
    setOpenPicker(null);
  };

  const removeObligation = (idx: number) => {
    setObligations((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setLoading(true);
    const base = { ...(user?.onboarding || {}) } as Record<string, any>;
    const tz =
      base.timezone ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');

    // Spread base so unrelated onboarding keys persist; only overwrite the
    // day-shape fields this screen owns. Empty obligations list is saved as
    // [] so removing the last one actually clears it server-side.
    const onboardingData: Record<string, any> = {
      ...base,
      completed: true,
      timezone: tz,
      wake_time: hhmm(wakeTime),
      sleep_time: hhmm(sleepTime),
      get_ready_time: getReadyTime ? hhmm(getReadyTime) : null,
      preferred_workout_time: workoutTime ? hhmm(workoutTime) : null,
      work_schedule: workSchedule || null,
      work_start: workSchedule === 'fixed' ? hhmm(workStart) : null,
      work_end: workSchedule === 'fixed' ? hhmm(workEnd) : null,
      obligations: obligations.map((o) => ({
        label: o.label,
        start: hhmm(o.start),
        end: hhmm(o.end),
      })),
    };

    try {
      await api.saveOnboarding(onboardingData as any);
      await refreshUser();
      // Day-shape edits change schedule generation (the validator now shifts
      // tasks out of work hours + obligations). Force-refetch so the Schedule
      // tab rebuilds with the new times on next mount.
      queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
      navigation.goBack();
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Could not save your day.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // Time row with inline dropdown. `nullable` adds an "Auto" option at the
  // top (coach derives the time from wake/sleep) for optional anchors.
  const pickerRow = (
    opts: {
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
      which: string;
      value: string | null;
      onChange: (s: string | null) => void;
      nullable?: boolean;
      autoHint?: string;
    },
  ) => {
    const { label, icon, which, value, onChange, nullable, autoHint } = opts;
    const open = openPicker === which;
    return (
      <View style={styles.row} key={which}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon} size={17} color={colors.foreground} />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowLabel}>{label}</Text>
          {!value && nullable && !open ? (
            <Text style={styles.rowHint}>{autoHint}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.timeTrigger}
          activeOpacity={0.85}
          onPress={() => setOpenPicker((p) => (p === which ? null : which))}
        >
          <Text style={[styles.timeTriggerText, !value && styles.timeTriggerAuto]}>
            {value ? formatTime12h(value) : 'Auto'}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {open ? (
          <View style={styles.dropdown}>
            <ScrollView nestedScrollEnabled style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
              {nullable ? (
                <TouchableOpacity
                  style={[styles.option, !value && styles.optionOn]}
                  onPress={() => {
                    onChange(null);
                    setOpenPicker(null);
                  }}
                >
                  <Text style={[styles.optionText, !value && styles.optionTextOn]}>Auto (let coach pick)</Text>
                </TouchableOpacity>
              ) : null}
              {TIME_OPTIONS.map((t) => {
                const active = t === value;
                return (
                  <TouchableOpacity
                    key={`${which}-${t}`}
                    style={[styles.option, active && styles.optionOn]}
                    onPress={() => {
                      onChange(t);
                      setOpenPicker(null);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextOn]}>{formatTime12h(t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your day</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Tell Max when your day happens — it builds every routine around these,
            and never schedules on top of your fixed commitments.
          </Text>

          {/* Key anchors — wake / shower / workout / sleep, top to bottom. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>DAILY TIMINGS</Text>
            {pickerRow({
              label: 'Wake up',
              icon: 'sunny-outline',
              which: 'wake',
              value: wakeTime,
              onChange: (s) => setWakeTime(s || '07:00'),
            })}
            {pickerRow({
              label: 'Shower / get ready',
              icon: 'water-outline',
              which: 'getReady',
              value: getReadyTime,
              onChange: setGetReadyTime,
              nullable: true,
              autoHint: 'Anchors your AM skin, hair & mewing routine.',
            })}
            {pickerRow({
              label: 'Workout',
              icon: 'barbell-outline',
              which: 'workout',
              value: workoutTime,
              onChange: setWorkoutTime,
              nullable: true,
              autoHint: 'Drives lifts, stretches & post-workout fuel.',
            })}
            {pickerRow({
              label: 'Go to sleep',
              icon: 'moon-outline',
              which: 'sleep',
              value: sleepTime,
              onChange: (s) => setSleepTime(s || '23:00'),
            })}
          </View>

          {/* Work / school — fixed window the scheduler avoids entirely. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>WORK / SCHOOL</Text>
            <Text style={styles.cardHint}>
              Set fixed hours and Max keeps every routine outside them.
            </Text>
            <View style={styles.tagWrap}>
              {[
                { id: 'fixed' as const, label: 'Fixed hours' },
                { id: 'flexible' as const, label: 'Flexible' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.tag, workSchedule === opt.id && styles.tagOn]}
                  onPress={() => setWorkSchedule((p) => (p === opt.id ? null : opt.id))}
                >
                  <Text style={[styles.tagText, workSchedule === opt.id && styles.tagTextOn]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {workSchedule === 'fixed' ? (
              <View style={{ marginTop: spacing.sm }}>
                {pickerRow({
                  label: 'Starts',
                  icon: 'briefcase-outline',
                  which: 'workStart',
                  value: workStart,
                  onChange: (s) => setWorkStart(s || '09:00'),
                })}
                {pickerRow({
                  label: 'Ends',
                  icon: 'briefcase-outline',
                  which: 'workEnd',
                  value: workEnd,
                  onChange: (s) => setWorkEnd(s || '17:00'),
                })}
              </View>
            ) : null}
          </View>

          {/* Arbitrary recurring obligations — gym class, commute, school run. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>OTHER OBLIGATIONS</Text>
            <Text style={styles.cardHint}>
              Anything else that repeats daily — a class, commute, or pickup.
              Max works around each one.
            </Text>

            {obligations.length === 0 ? (
              <Text style={styles.emptyObs}>None yet.</Text>
            ) : (
              obligations.map((o, idx) => (
                <View style={styles.obRow} key={`${o.label}-${idx}`}>
                  <View style={styles.obDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.obLabel}>{o.label}</Text>
                    <Text style={styles.obTime}>
                      {formatTime12h(o.start)} – {formatTime12h(o.end)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeObligation(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.obRemove}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Add-obligation draft. */}
            <View style={styles.addBox}>
              <TextInput
                style={styles.addInput}
                value={obLabel}
                onChangeText={setObLabel}
                placeholder="What is it? (e.g. gym class)"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
              />
              <View style={styles.addTimes}>
                {pickerRow({
                  label: 'From',
                  icon: 'time-outline',
                  which: 'obStart',
                  value: obStart,
                  onChange: (s) => setObStart(s || '12:00'),
                })}
                {pickerRow({
                  label: 'To',
                  icon: 'time-outline',
                  which: 'obEnd',
                  value: obEnd,
                  onChange: (s) => setObEnd(s || '13:00'),
                })}
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={addObligation} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color={colors.foreground} />
                <Text style={styles.addBtnText}>Add obligation</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveBtnText}>Save my day</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400',
    color: colors.foreground,
    letterSpacing: -0.4,
  },
  backButton: { padding: 4, width: 40 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  lead: {
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 19,
    letterSpacing: 0.05,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#0a0a0b', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }
      : { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }),
  },
  kicker: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    opacity: 0.7,
  },
  cardHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
    letterSpacing: 0.05,
    marginTop: -4,
  },
  // Anchor row: icon + label (left) and the time trigger (right). The
  // dropdown renders full-width below via absolute-free flow (flexWrap).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowMain: { flex: 1, paddingRight: 10 },
  rowLabel: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  rowHint: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 3,
    opacity: 0.85,
  },
  timeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  timeTriggerText: { fontSize: 15, color: colors.foreground, fontWeight: '600', letterSpacing: 0.05 },
  timeTriggerAuto: { color: colors.textMuted, fontWeight: '500' },
  dropdown: {
    width: '100%',
    marginTop: 8,
    maxHeight: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 200 },
  option: {
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  optionOn: { backgroundColor: colors.surface },
  optionText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  optionTextOn: { color: colors.foreground, fontWeight: '600' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tagOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  tagText: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.1 },
  tagTextOn: { color: colors.background, fontWeight: '600' },
  emptyObs: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  obRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  obDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.foreground,
    marginRight: 12,
  },
  obLabel: { fontSize: 15, color: colors.foreground, fontWeight: '500', letterSpacing: 0.05 },
  obTime: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  obRemove: { padding: 4 },
  addBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
  },
  addInput: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '500',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addTimes: { marginTop: 4 },
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
  addBtnText: { fontSize: 13.5, fontWeight: '600', color: colors.foreground, letterSpacing: 0.2 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  saveBtn: {
    backgroundColor: colors.foreground,
    borderRadius: borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.background,
    letterSpacing: 0.4,
  },
});
