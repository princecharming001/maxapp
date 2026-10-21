/**
 * CustomTaskSheet — add or edit one of the person's OWN tasks (a workout, a
 * run, a sauna visit) on their stack. Opened from the "+" on Home and on the
 * Planner, and from tapping one of their own tasks.
 *
 * Same language as the planner's commitments editor: cream sheet, serif title,
 * one white soft-shadow card (name + time), underline day tabs over hairline
 * day dots, and a footer with a live summary and the ink pill. The time wheel
 * is an in-sheet overlay, never a second <Modal> (iOS two-modal freeze).
 *
 * Driven by ref so one always-mounted instance serves every entry point.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { cardTitleFits } from '../../lib/cardTitle';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import api, { CustomTask, CustomTaskDay } from '../../services/api';
import { queryKeys } from '../../lib/queryClient';
import { Alert, InAppAlertHost } from '../InAppAlert';
import { fonts, spacing } from '../../theme/dark';
import { WheelTimeOverlay, WheelTimeRow, WT, CARD_SOFT } from '../planner/WheelTime';
import { fmt12, minToHHMM, toMin } from '../planner/plannerModel';
import {
  ALL_DAYS,
  DAY_LETTERS,
  DURATIONS,
  SUGGESTIONS,
  WEEKDAYS_ONLY,
  WEEKENDS_ONLY,
  customDaysLabel,
  defaultStartMinute,
  durationLabel,
  quickOf,
  sortDays,
} from './customTaskModel';

export type CustomTaskSheetHandle = {
  /** Blank editor. `time` (HH:MM) prefills, e.g. a tapped planner slot. */
  openAdd: (initial?: { time?: string }) => void;
  openEdit: (task: CustomTask) => void;
  /** From a task row: looks the template up by its catalog id. */
  openEditByCatalogId: (catalogId: string) => Promise<boolean>;
};

type Props = {
  /** One-line confirmation for the host's toast ("Added to your stack"). */
  onDone?: (message: string) => void;
};

const NAME_MAX = 60;

function serverMessage(e: unknown, fallback: string): string {
  const r = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (r?.status === 402) return 'Your own tasks are part of a subscription.';
  const d = r?.data?.detail;
  if (typeof d === 'string' && d.length < 140) return d;
  return fallback;
}

const CustomTaskSheet = forwardRef<CustomTaskSheetHandle, Props>(function CustomTaskSheet({ onDone }, ref) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [minute, setMinute] = useState(defaultStartMinute());
  const [minutes, setMinutes] = useState(30);
  const [days, setDays] = useState<CustomTaskDay[]>([...ALL_DAYS]);
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reset = (t?: CustomTask, time?: string) => {
    setEditId(t?.id ?? null);
    setTitle(t?.title ?? '');
    setMinute(t ? toMin(t.time) : time && /^\d{1,2}:\d{2}$/.test(time) ? toMin(time) : defaultStartMinute());
    setMinutes(t?.minutes ?? 30);
    setDays(t ? sortDays(t.days) : [...ALL_DAYS]);
    setNote(t?.note ?? '');
    setPicker(false);
    setError(null);
    setBusy(null);
    busyRef.current = false;
  };

  useImperativeHandle(ref, () => ({
    openAdd: (initial) => {
      reset(undefined, initial?.time);
      setOpen(true);
    },
    openEdit: (t) => {
      reset(t);
      setOpen(true);
    },
    openEditByCatalogId: async (catalogId) => {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.customTasks,
          queryFn: () => api.getCustomTasks(),
          staleTime: 0,
        });
        const t = (data?.tasks || []).find((x) => x.catalog_id === catalogId);
        if (!t) return false;
        reset(t);
        setOpen(true);
        return true;
      } catch {
        return false;
      }
    },
  }));

  const trimmed = title.trim();
  // The card shows one line at full size, never shrunk: a longer name can't save.
  const tooLong = trimmed.length > 0 && !cardTitleFits(trimmed);
  const canSave = trimmed.length > 0 && !tooLong && days.length > 0 && minutes > 0 && !busy;
  const quick = quickOf(days);
  const durations = useMemo(
    () => (DURATIONS.includes(minutes) ? DURATIONS : [...DURATIONS, minutes].sort((a, b) => a - b)),
    [minutes],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull });
    void queryClient.invalidateQueries({ queryKey: queryKeys.customTasks });
    void queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary });
    void queryClient.invalidateQueries({ queryKey: ['plannerToday'] });
  };

  const close = () => {
    if (busyRef.current) return;
    if (picker) { setPicker(false); return; }
    setOpen(false);
  };

  const save = async () => {
    if (!canSave || busyRef.current) return;
    busyRef.current = true;
    setBusy('save');
    setError(null);
    const body = { title: trimmed.slice(0, NAME_MAX), time: minToHHMM(minute), minutes, days, note: note.trim() };
    try {
      if (editId) await api.updateCustomTask(editId, body);
      else await api.createCustomTask(body);
      refresh();
      busyRef.current = false;
      setBusy(null);
      setOpen(false);
      onDone?.(editId ? 'Saved' : 'Added to your stack');
    } catch (e) {
      busyRef.current = false;
      setBusy(null);
      setError(serverMessage(e, 'Couldn’t save that. Try again.'));
    }
  };

  const doDelete = async () => {
    if (!editId || busyRef.current) return;
    busyRef.current = true;
    setBusy('delete');
    setError(null);
    try {
      await api.deleteCustomTask(editId);
      refresh();
      busyRef.current = false;
      setBusy(null);
      // Defer a tick: the confirm (a nested alert) must tear down before the
      // sheet's Modal closes (iOS two-modal deadlock).
      setTimeout(() => setOpen(false), 0);
      onDone?.('Removed');
    } catch (e) {
      busyRef.current = false;
      setBusy(null);
      setError(serverMessage(e, 'Couldn’t remove that. Try again.'));
    }
  };

  const confirmDelete = () => {
    const name = trimmed || 'this task';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      const ok = typeof window === 'undefined' || window.confirm(`Remove "${name}"? It comes off every day.`);
      if (ok) void doDelete();
      return;
    }
    Alert.alert('Remove task?', `"${name}" comes off every day.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void doDelete(); } },
    ], { cancelable: true });
  };

  const toggleDay = (d: CustomTaskDay) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : sortDays([...prev, d])));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <View style={st.overlay}>
        <Pressable style={st.backdrop} onPress={close} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetWrap}>
          <View style={[st.sheet, { maxHeight: Math.round(winH * 0.92) }]} testID="custom-task-sheet">
            <View style={st.grabber} />
            <Text style={st.sheetTitle}>{editId ? 'Edit task' : 'New task'}</Text>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={st.card}>
                <TextInput
                  style={st.nameInput}
                  value={title}
                  onChangeText={(v) => { setTitle(v); if (error) setError(null); }}
                  placeholder="Gym, run, sauna…"
                  placeholderTextColor={WT.MUTE}
                  returnKeyType="done"
                  maxLength={NAME_MAX}
                  autoFocus={!editId}
                  accessibilityLabel="Task name"
                  testID="custom-task-name"
                />
                {tooLong ? (
                  <Text style={[st.error, { marginTop: 4, marginBottom: 10 }]} testID="custom-task-too-long">Too long for one line. Try a shorter name, like "Gym" or "Evening walk".</Text>
                ) : null}
                <View style={st.hair} />
                <WheelTimeRow label="Time" display={fmt12(minToHHMM(minute))} onPress={() => setPicker(true)} />
              </View>

              {!editId && !trimmed ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={st.suggestRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {SUGGESTIONS.map((sg) => (
                    <TouchableOpacity
                      key={sg.title}
                      style={st.suggest}
                      activeOpacity={0.75}
                      onPress={() => { setTitle(sg.title); setMinutes(sg.minutes); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${sg.title}, ${durationLabel(sg.minutes)}`}
                    >
                      <Ionicons name={sg.icon as any} size={14} color={WT.INK} />
                      <Text style={st.suggestText}>{sg.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={st.sectionLabel}>How long</Text>
              <View style={st.chipRow}>
                {durations.map((m) => {
                  const on = m === minutes;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[st.chip, on && st.chipOn]}
                      activeOpacity={0.8}
                      onPress={() => setMinutes(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[st.chipText, on && st.chipTextOn]}>{durationLabel(m)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={st.sectionLabel}>Which days</Text>
              <View style={st.tabs}>
                {([['all', 'Every day', ALL_DAYS], ['weekdays', 'Weekdays', WEEKDAYS_ONLY], ['weekends', 'Weekends', WEEKENDS_ONLY]] as const).map(
                  ([k, label, set]) => {
                    const on = quick === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[st.tab, on && st.tabOn]}
                        activeOpacity={0.8}
                        onPress={() => setDays([...set])}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[st.tabText, on && st.tabTextOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  },
                )}
              </View>
              <View style={st.dayRow}>
                {ALL_DAYS.map((d) => {
                  const on = days.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[st.dayDot, on && st.dayDotOn]}
                      activeOpacity={0.8}
                      onPress={() => toggleDay(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={d}
                      testID={`custom-task-day-${d}`}
                    >
                      <Text style={[st.dayDotText, on && st.dayDotTextOn]}>{DAY_LETTERS[d]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[st.card, { marginTop: 26 }]}>
                <TextInput
                  style={st.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Notes (optional)"
                  placeholderTextColor={WT.MUTE}
                  multiline
                  maxLength={280}
                  accessibilityLabel="Notes"
                />
              </View>

              {error ? <Text style={st.error} testID="custom-task-error">{error}</Text> : null}

              {editId ? (
                <TouchableOpacity style={st.removeBtn} onPress={confirmDelete} activeOpacity={0.6} disabled={!!busy}>
                  {busy === 'delete' ? (
                    <ActivityIndicator size="small" color="#C0452C" />
                  ) : (
                    <Ionicons name="trash-outline" size={14} color="#C0452C" />
                  )}
                  <Text style={st.removeText}>Remove task</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ height: 12 }} />
            </ScrollView>

            <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
              <View style={st.footerSummary}>
                <Text style={st.summaryText} numberOfLines={1}>
                  {`${fmt12(minToHHMM(minute))} · ${durationLabel(minutes)}`}
                </Text>
                <Text style={st.summaryDays} numberOfLines={1}>
                  {days.length ? customDaysLabel(days) : 'Pick at least one day'}
                </Text>
              </View>
              <TouchableOpacity
                style={[st.saveBtn, !canSave && st.saveBtnOff]}
                onPress={() => { void save(); }}
                disabled={!canSave}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave, busy: busy === 'save' }}
                testID="custom-task-save"
              >
                {busy === 'save' ? (
                  <ActivityIndicator size="small" color={WT.ON_INK} />
                ) : (
                  <Text style={[st.saveText, !canSave && st.saveTextOff]}>{editId ? 'Save' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {picker ? (
          <WheelTimeOverlay
            title="Time"
            value={minute}
            onClose={() => setPicker(false)}
            onConfirm={(v) => { setMinute(v); setPicker(false); }}
          />
        ) : null}

        <InAppAlertHost />
      </View>
    </Modal>
  );
});

export default CustomTaskSheet;

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: WT.BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.12)', marginBottom: 12 },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 24, color: WT.INK, letterSpacing: -0.4, textAlign: 'center', marginBottom: 16 },

  card: { backgroundColor: WT.CARD, borderRadius: 22, borderCurve: 'continuous', paddingHorizontal: 18, ...CARD_SOFT },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: WT.HAIR },
  nameInput: { paddingVertical: 17, paddingHorizontal: 0, color: WT.INK, fontSize: 17, fontFamily: fonts.sansSemiBold },
  noteInput: { paddingVertical: 14, minHeight: 56, color: WT.INK, fontSize: 15, fontFamily: fonts.sans, textAlignVertical: 'top' },

  suggestRow: { gap: 8, paddingTop: 14, paddingRight: 8 },
  suggest: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
    backgroundColor: WT.CARD, ...CARD_SOFT,
  },
  suggestText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.INK },

  sectionLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: WT.INK, letterSpacing: 0.1, marginTop: 26, marginBottom: 12, marginLeft: 4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  chipOn: { backgroundColor: WT.INK, borderColor: WT.INK },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.SUB, fontVariant: ['tabular-nums'] },
  chipTextOn: { color: WT.ON_INK, fontFamily: fonts.sansSemiBold },

  tabs: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', rowGap: 8 },
  tab: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: WT.INK },
  tabText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.MUTE, letterSpacing: 0.1 },
  tabTextOn: { fontFamily: fonts.sansSemiBold, color: WT.INK },

  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 2 },
  dayDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  dayDotOn: { backgroundColor: WT.INK, borderColor: WT.INK },
  dayDotText: { fontSize: 14, fontFamily: fonts.sansMedium, color: WT.SUB },
  dayDotTextOn: { color: WT.ON_INK, fontFamily: fonts.sansSemiBold },

  error: { fontFamily: fonts.sans, fontSize: 13.5, color: '#C0452C', textAlign: 'center', marginTop: 18 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.xl, paddingVertical: 12 },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#C0452C', letterSpacing: 0.1 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: WT.HAIR },
  footerSummary: { flex: 1, minWidth: 0 },
  summaryText: { fontFamily: fonts.serif, fontSize: 17, color: WT.INK, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  summaryDays: { fontFamily: fonts.sans, fontSize: 12.5, color: WT.MUTE, marginTop: 2, letterSpacing: 0.1 },
  saveBtn: { backgroundColor: WT.INK, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: 30, minWidth: 104, minHeight: 50, alignItems: 'center', justifyContent: 'center', ...CARD_SOFT },
  saveBtnOff: { backgroundColor: '#DAD9D6', shadowOpacity: 0 },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: WT.ON_INK, letterSpacing: 0.2 },
  saveTextOff: { color: '#8A8A86' },
});
