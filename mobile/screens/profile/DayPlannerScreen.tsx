import React, { useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';
import { TIME_OPTIONS, formatTime12h, hhmm } from '../../constants/profileLifestyleQuestionnaire';

type Obligation = { label: string; start: string; end: string };
type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
type Scope = 'all' | Weekday;

// The full shape of a single day's rhythm. `defaults` always holds a complete
// DayShape; per-weekday overrides hold a Partial — only the fields a given day
// changes — so unspecified fields transparently inherit the defaults. This
// presence-based model mirrors the backend exactly (weekly_timings keyed by
// weekday, each holding only changed fields; obligations key-presence replaces).
type DayShape = {
  wakeTime: string;
  sleepTime: string;
  getReadyTime: string | null;
  workoutTime: string | null;
  workSchedule: 'fixed' | 'flexible' | null;
  workStart: string;
  workEnd: string;
  obligations: Obligation[];
};

const WEEKDAYS: { key: Weekday; short: string; long: string }[] = [
  { key: 'monday', short: 'Mon', long: 'Monday' },
  { key: 'tuesday', short: 'Tue', long: 'Tuesday' },
  { key: 'wednesday', short: 'Wed', long: 'Wednesday' },
  { key: 'thursday', short: 'Thu', long: 'Thursday' },
  { key: 'friday', short: 'Fri', long: 'Friday' },
  { key: 'saturday', short: 'Sat', long: 'Saturday' },
  { key: 'sunday', short: 'Sun', long: 'Sunday' },
];

const CHAT_EXAMPLES = [
  'I sleep in until 10 on weekends',
  'Add gym 6–7pm on Mon, Wed, Fri',
  'Work 9–5 on weekdays',
  'No workout on Sundays',
];

function normObligations(raw: any): Obligation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o: any) => o && typeof o === 'object' && o.start && o.end)
    .map((o: any) => ({
      label: String(o.label || '').trim() || 'Obligation',
      start: String(o.start),
      end: String(o.end),
    }));
}

// onboarding (snake_case) → full DayShape, with the same sensible defaults
// EditPersonal uses so the two screens never drift.
function hydrateDayShape(ob: Record<string, any>): DayShape {
  return {
    wakeTime: ob.wake_time || '07:00',
    sleepTime: ob.sleep_time || '23:00',
    getReadyTime: (ob.get_ready_time as string | undefined) || null,
    workoutTime: (ob.preferred_workout_time as string | undefined) || null,
    workSchedule: (ob.work_schedule as 'fixed' | 'flexible' | undefined) || null,
    workStart: ob.work_start || '09:00',
    workEnd: ob.work_end || '17:00',
    obligations: normObligations(ob.obligations),
  };
}

// One weekday override dict (snake_case, only-changed-fields) → Partial<DayShape>.
// Key presence is preserved exactly: a key only lands in the Partial if the
// server sent it, so "no override" stays distinct from "overridden to a value".
function dayPartialFromServer(raw: Record<string, any>): Partial<DayShape> {
  const p: Partial<DayShape> = {};
  if (!raw || typeof raw !== 'object') return p;
  if ('wake_time' in raw) p.wakeTime = raw.wake_time || '07:00';
  if ('sleep_time' in raw) p.sleepTime = raw.sleep_time || '23:00';
  if ('get_ready_time' in raw) p.getReadyTime = raw.get_ready_time || null;
  if ('preferred_workout_time' in raw) p.workoutTime = raw.preferred_workout_time || null;
  if ('work_schedule' in raw) p.workSchedule = (raw.work_schedule as any) || null;
  if ('work_start' in raw) p.workStart = raw.work_start || '09:00';
  if ('work_end' in raw) p.workEnd = raw.work_end || '17:00';
  if ('obligations' in raw) p.obligations = normObligations(raw.obligations);
  return p;
}

function hydrateWeekly(
  raw: Record<string, any> | null | undefined,
): Partial<Record<Weekday, Partial<DayShape>>> {
  const out: Partial<Record<Weekday, Partial<DayShape>>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const { key } of WEEKDAYS) {
    const dr = raw[key];
    if (dr && typeof dr === 'object') {
      const p = dayPartialFromServer(dr);
      if (Object.keys(p).length) out[key] = p;
    }
  }
  return out;
}

// Partial<DayShape> → snake_case override dict, preserving key presence so the
// backend's presence-based merge only touches fields the user actually set.
function dayPartialToServer(p: Partial<DayShape>): Record<string, any> {
  const o: Record<string, any> = {};
  if ('wakeTime' in p) o.wake_time = p.wakeTime ? hhmm(p.wakeTime) : null;
  if ('sleepTime' in p) o.sleep_time = p.sleepTime ? hhmm(p.sleepTime) : null;
  if ('getReadyTime' in p) o.get_ready_time = p.getReadyTime ? hhmm(p.getReadyTime) : null;
  if ('workoutTime' in p) o.preferred_workout_time = p.workoutTime ? hhmm(p.workoutTime) : null;
  if ('workSchedule' in p) o.work_schedule = p.workSchedule || null;
  if ('workStart' in p) o.work_start = p.workStart ? hhmm(p.workStart) : null;
  if ('workEnd' in p) o.work_end = p.workEnd ? hhmm(p.workEnd) : null;
  if ('obligations' in p) {
    o.obligations = (p.obligations || []).map((x) => ({
      label: x.label,
      start: hhmm(x.start),
      end: hhmm(x.end),
    }));
  }
  return o;
}

function serializeWeekly(
  weekly: Partial<Record<Weekday, Partial<DayShape>>>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const { key } of WEEKDAYS) {
    const p = weekly[key];
    if (!p || Object.keys(p).length === 0) continue;
    const day = dayPartialToServer(p);
    if (Object.keys(day).length) out[key] = day;
  }
  return out;
}

const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
};

export default function DayPlannerScreen({ embedded = false }: { embedded?: boolean }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const ob = (user?.onboarding || {}) as Record<string, any>;

  const [defaults, setDefaults] = useState<DayShape>(() => hydrateDayShape(ob));
  const [weekly, setWeekly] = useState<Partial<Record<Weekday, Partial<DayShape>>>>(
    () => hydrateWeekly(ob.weekly_timings),
  );
  const [scope, setScope] = useState<Scope>('all');

  // New-obligation draft form (shared across scopes — it's just a staging area).
  const [obLabel, setObLabel] = useState('');
  const [obStart, setObStart] = useState('12:00');
  const [obEnd, setObEnd] = useState('13:00');

  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Chatbot state.
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);
  const chatRef = useRef<TextInput>(null);

  // The effective day being edited: defaults, or defaults with this weekday's
  // overrides layered on top.
  const eff: DayShape = useMemo(
    () => (scope === 'all' ? defaults : { ...defaults, ...(weekly[scope] || {}) }),
    [scope, defaults, weekly],
  );

  const hasOverride = (day: Weekday) =>
    !!weekly[day] && Object.keys(weekly[day] as object).length > 0;

  // Route a field edit to the right place: defaults for "All days", otherwise
  // a per-weekday override (creating one if needed).
  const setField = <K extends keyof DayShape>(key: K, val: DayShape[K]) => {
    if (scope === 'all') {
      setDefaults((d) => ({ ...d, [key]: val }));
    } else {
      const day = scope;
      setWeekly((w) => ({ ...w, [day]: { ...(w[day] || {}), [key]: val } }));
    }
  };

  const switchScope = (next: Scope) => {
    setOpenPicker(null);
    setScope(next);
  };

  const resetDay = () => {
    if (scope === 'all') return;
    const day = scope;
    setWeekly((w) => {
      const n = { ...w };
      delete n[day];
      return n;
    });
    setOpenPicker(null);
  };

  const addObligation = () => {
    if (toMin(obEnd) <= toMin(obStart)) {
      Alert.alert('Check the times', 'The end time needs to be after the start time.');
      return;
    }
    const label = obLabel.trim() || 'Obligation';
    // Editing obligations on a weekday snapshots the *effective* list into that
    // day's override (matches the backend, where obligations key-presence
    // replaces the default list for that day).
    setField('obligations', [...eff.obligations, { label, start: hhmm(obStart), end: hhmm(obEnd) }]);
    setObLabel('');
    setObStart('12:00');
    setObEnd('13:00');
    setOpenPicker(null);
  };

  const removeObligation = (idx: number) => {
    setField(
      'obligations',
      eff.obligations.filter((_, i) => i !== idx),
    );
  };

  // Build the full onboarding payload (defaults + serialized weekly overrides).
  const buildOnboarding = (): Record<string, any> => {
    const base = { ...(user?.onboarding || {}) } as Record<string, any>;
    const tz =
      base.timezone ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    const weeklyOut = serializeWeekly(weekly);
    return {
      ...base,
      completed: true,
      timezone: tz,
      wake_time: hhmm(defaults.wakeTime),
      sleep_time: hhmm(defaults.sleepTime),
      get_ready_time: defaults.getReadyTime ? hhmm(defaults.getReadyTime) : null,
      preferred_workout_time: defaults.workoutTime ? hhmm(defaults.workoutTime) : null,
      work_schedule: defaults.workSchedule || null,
      work_start: defaults.workSchedule === 'fixed' ? hhmm(defaults.workStart) : null,
      work_end: defaults.workSchedule === 'fixed' ? hhmm(defaults.workEnd) : null,
      obligations: defaults.obligations.map((o) => ({
        label: o.label,
        start: hhmm(o.start),
        end: hhmm(o.end),
      })),
      weekly_timings: Object.keys(weeklyOut).length ? weeklyOut : null,
    };
  };

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
  };

  const applyServerState = (
    d?: Record<string, any> | null,
    wk?: Record<string, any> | null,
  ) => {
    setDefaults(hydrateDayShape(d || {}));
    setWeekly(hydrateWeekly(wk || {}));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveOnboarding(buildOnboarding() as any);
      await refreshUser();
      invalidateSchedules();
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Could not save your week.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatLoading(true);
    setChatReply(null);
    try {
      // Persist any in-progress manual edits first so the chatbot reasons over
      // — and never silently discards — what the user just set by hand.
      await api.saveOnboarding(buildOnboarding() as any);
      const res = await api.plannerChat(text);
      // Re-hydrate from the authoritative merged result the backend returns.
      applyServerState(res.defaults, res.weekly_timings);
      setChatReply(res.summary || res.message || 'Updated your plan.');
      setChatInput('');
      await refreshUser();
      invalidateSchedules();
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Could not update your plan — try rephrasing.';
      setChatReply(msg);
    } finally {
      setChatLoading(false);
    }
  };

  // Time row with inline dropdown. `nullable` adds an "Auto" option at the top
  // (coach derives the time from wake/sleep) for optional anchors.
  const pickerRow = (opts: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    which: string;
    value: string | null;
    onChange: (s: string | null) => void;
    nullable?: boolean;
    autoHint?: string;
  }) => {
    const { label, icon, which, value, onChange, nullable, autoHint } = opts;
    const open = openPicker === which;
    return (
      <View style={styles.row} key={which}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon} size={17} color={colors.foreground} />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowLabel}>{label}</Text>
          {!value && nullable && !open ? <Text style={styles.rowHint}>{autoHint}</Text> : null}
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

  const scopeLong = scope === 'all' ? 'All days' : WEEKDAYS.find((w) => w.key === scope)?.long || '';
  const dayHasOverride = scope !== 'all' && hasOverride(scope);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {!embedded && navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={styles.headerTitle}>Your week</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Day selector — All days + Mon–Sun. Overridden days carry a dot. */}
      <View style={styles.dayStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={[styles.dayChip, styles.allChip, scope === 'all' && styles.dayChipOn]}
            activeOpacity={0.85}
            onPress={() => switchScope('all')}
          >
            <Text style={[styles.dayChipText, scope === 'all' && styles.dayChipTextOn]}>All days</Text>
          </TouchableOpacity>
          {WEEKDAYS.map((d) => {
            const on = scope === d.key;
            const dot = hasOverride(d.key);
            return (
              <TouchableOpacity
                key={d.key}
                style={[styles.dayChip, on && styles.dayChipOn]}
                activeOpacity={0.85}
                onPress={() => switchScope(d.key)}
              >
                <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{d.short}</Text>
                {dot ? <View style={[styles.dayDot, on && styles.dayDotOn]} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Scope banner — what the edits below apply to. */}
          <View style={styles.scopeBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scopeTitle}>
                {scope === 'all' ? 'Every day' : scopeLong}
              </Text>
              <Text style={styles.scopeHint}>
                {scope === 'all'
                  ? 'Your base rhythm. Pick a weekday above to set something different just for that day.'
                  : dayHasOverride
                    ? `Customised for ${scopeLong}. Other days are unaffected.`
                    : `Inherits your defaults. Change anything to make it specific to ${scopeLong}.`}
              </Text>
            </View>
            {dayHasOverride ? (
              <TouchableOpacity onPress={resetDay} style={styles.resetBtn} activeOpacity={0.7}>
                <Ionicons name="refresh" size={13} color={colors.textSecondary} />
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Key anchors — wake / shower / workout / sleep, top to bottom. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>DAILY TIMINGS</Text>
            {pickerRow({
              label: 'Wake up',
              icon: 'sunny-outline',
              which: 'wake',
              value: eff.wakeTime,
              onChange: (s) => setField('wakeTime', s || '07:00'),
            })}
            {pickerRow({
              label: 'Shower / get ready',
              icon: 'water-outline',
              which: 'getReady',
              value: eff.getReadyTime,
              onChange: (s) => setField('getReadyTime', s),
              nullable: true,
              autoHint: 'Anchors your AM skin, hair & mewing routine.',
            })}
            {pickerRow({
              label: 'Workout',
              icon: 'barbell-outline',
              which: 'workout',
              value: eff.workoutTime,
              onChange: (s) => setField('workoutTime', s),
              nullable: true,
              autoHint: 'Drives lifts, stretches & post-workout fuel.',
            })}
            {pickerRow({
              label: 'Go to sleep',
              icon: 'moon-outline',
              which: 'sleep',
              value: eff.sleepTime,
              onChange: (s) => setField('sleepTime', s || '23:00'),
            })}
          </View>

          {/* Work / school — fixed window the scheduler avoids entirely. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>WORK / SCHOOL</Text>
            <Text style={styles.cardHint}>Set fixed hours and Max keeps every routine outside them.</Text>
            <View style={styles.tagWrap}>
              {[
                { id: 'fixed' as const, label: 'Fixed hours' },
                { id: 'flexible' as const, label: 'Flexible' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.tag, eff.workSchedule === opt.id && styles.tagOn]}
                  onPress={() => setField('workSchedule', eff.workSchedule === opt.id ? null : opt.id)}
                >
                  <Text style={[styles.tagText, eff.workSchedule === opt.id && styles.tagTextOn]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {eff.workSchedule === 'fixed' ? (
              <View style={{ marginTop: spacing.sm }}>
                {pickerRow({
                  label: 'Starts',
                  icon: 'briefcase-outline',
                  which: 'workStart',
                  value: eff.workStart,
                  onChange: (s) => setField('workStart', s || '09:00'),
                })}
                {pickerRow({
                  label: 'Ends',
                  icon: 'briefcase-outline',
                  which: 'workEnd',
                  value: eff.workEnd,
                  onChange: (s) => setField('workEnd', s || '17:00'),
                })}
              </View>
            ) : null}
          </View>

          {/* Arbitrary recurring obligations — gym class, commute, school run. */}
          <View style={styles.card}>
            <Text style={styles.kicker}>OBLIGATIONS</Text>
            <Text style={styles.cardHint}>
              {scope === 'all'
                ? 'Anything that repeats every day — a class, commute, or pickup. Max works around each one.'
                : `Commitments just for ${scopeLong}. Max works around each one.`}
            </Text>

            {eff.obligations.length === 0 ? (
              <Text style={styles.emptyObs}>None yet.</Text>
            ) : (
              eff.obligations.map((o, idx) => (
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

          {/* Chatbot — natural-language edits to the whole week. */}
          <View style={[styles.card, styles.chatCard]}>
            <View style={styles.chatHead}>
              <View style={styles.chatIconWrap}>
                <Ionicons name="sparkles" size={15} color={colors.background} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatTitle}>Ask Max to rearrange</Text>
                <Text style={styles.chatSub}>Describe a change and Max updates the right days for you.</Text>
              </View>
            </View>

            {chatReply ? (
              <View style={styles.chatReply}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.foreground}
                  style={{ marginTop: 1 }}
                />
                <Text style={styles.chatReplyText}>{chatReply}</Text>
              </View>
            ) : (
              <View style={styles.chipsWrap}>
                {CHAT_EXAMPLES.map((ex) => (
                  <TouchableOpacity
                    key={ex}
                    style={styles.exChip}
                    activeOpacity={0.8}
                    onPress={() => {
                      setChatInput(ex);
                      chatRef.current?.focus();
                    }}
                  >
                    <Text style={styles.exChipText}>{ex}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.chatInputRow}>
              <TextInput
                ref={chatRef}
                style={styles.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="e.g. wake at 6:30 on weekdays"
                placeholderTextColor={colors.textMuted}
                multiline
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={sendChat}
                editable={!chatLoading}
              />
              <TouchableOpacity
                style={[styles.chatSend, (!chatInput.trim() || chatLoading) && styles.chatSendOff]}
                onPress={sendChat}
                activeOpacity={0.85}
                disabled={!chatInput.trim() || chatLoading}
              >
                {chatLoading ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Ionicons name="arrow-up" size={18} color={colors.background} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || savedTick) && { opacity: 0.85 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : savedTick ? (
            <View style={styles.saveRow}>
              <Ionicons name="checkmark" size={16} color={colors.background} />
              <Text style={styles.saveBtnText}>Saved</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Save my week</Text>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  dayStripWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: 2,
  },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  allChip: { paddingHorizontal: 16 },
  dayChipOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  dayChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.1 },
  dayChipTextOn: { color: colors.background },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.foreground },
  dayDotOn: { backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  scopeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  scopeTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.foreground,
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  scopeHint: { fontSize: 12, color: colors.textMuted, lineHeight: 16.5, letterSpacing: 0.05 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  resetText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.1 },
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
  rowLabel: { fontSize: 15, color: colors.foreground, fontWeight: '500', letterSpacing: 0.05 },
  rowHint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 15, marginTop: 3, opacity: 0.85 },
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
  emptyObs: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.xs },
  obRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  obDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.foreground, marginRight: 12 },
  obLabel: { fontSize: 15, color: colors.foreground, fontWeight: '500', letterSpacing: 0.05 },
  obTime: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  obRemove: { padding: 4 },
  addBox: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md },
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
  // Chatbot card.
  chatCard: { backgroundColor: colors.card },
  chatHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: spacing.md },
  chatIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTitle: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground, letterSpacing: 0.1 },
  chatSub: { fontSize: 12.5, color: colors.textMuted, lineHeight: 17, marginTop: 2, letterSpacing: 0.05 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  exChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  exChipText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '500', letterSpacing: 0.05 },
  chatReply: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  chatReplyText: { flex: 1, fontSize: 13.5, color: colors.foreground, lineHeight: 19, letterSpacing: 0.05 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontSize: 15,
    letterSpacing: 0.05,
  },
  chatSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendOff: { opacity: 0.35 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.background, letterSpacing: 0.4 },
});
