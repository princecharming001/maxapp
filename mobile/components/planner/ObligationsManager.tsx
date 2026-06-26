/**
 * ObligationsManager — the single, GLOBAL list of recurring commitments
 * (work, classes, a commute, pickups…). Work/school is just an obligation here;
 * there is no separate "work schedule".
 *
 * Each obligation carries a `days` recurrence, so it can land on every day, only
 * weekdays, only weekends, or a specific set (e.g. Mon/Wed/Fri). The list reads
 * as a chronological stack; tapping a row edits it, the "×" removes it, and
 * "Add commitment" opens the same editor blank.
 *
 * The editor sheet is fully visual: a label, a dual-thumb time range, quick
 * recurrence chips (Every day / Weekdays / Weekends) and a 7-day toggle for an
 * exact set. Changes bubble up via onChange; the planner screen persists them.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native'
import { Alert } from '../InAppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
import TimePicker from './TimePicker';
import {
  Obligation,
  DayRecurrence,
  Weekday,
  WEEKDAYS,
  WEEKDAY_KEYS,
  normDays,
  daysLabel,
  obligationColor,
  fmt12Compact,
  minToHHMM,
  toMin,
} from './plannerModel';

const OB_MIN = 0; // 12 AM
const OB_MAX = 1425; // 11:45 PM (last 15-min step before midnight)
const fmtAbs = (m: number) => fmt12Compact(minToHHMM(m));

const MF: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const SS: Weekday[] = ['saturday', 'sunday'];

function setEq(a: Set<Weekday>, b: Weekday[]): boolean {
  return a.size === b.length && b.every((d) => a.has(d));
}

function daysToSet(days: DayRecurrence): Set<Weekday> {
  if (days === 'weekdays') return new Set(MF);
  if (days === 'weekends') return new Set(SS);
  if (Array.isArray(days)) return new Set(days);
  return new Set(WEEKDAY_KEYS); // 'all'
}

type Quick = 'all' | 'weekdays' | 'weekends';

export type ObligationsManagerHandle = { openEdit: (index: number) => void; openAdd: () => void };

const ObligationsManager = forwardRef<
  ObligationsManagerHandle,
  {
    obligations: Obligation[];
    onChange: (next: Obligation[]) => void;
    /**
     * Headless: render ONLY the add/edit sheet (no inline list/header/add button).
     * Lets the planner keep a single always-mounted instance whose editor is driven
     * by `ref` (from the day timeline or the commitments sheet) while the visible
     * list lives elsewhere.
     */
    headless?: boolean;
  }
>(function ObligationsManager({ obligations, onChange, headless = false }, ref) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetMaxH = Math.round(winH * 0.9);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [range, setRange] = useState<[number, number]>([540, 600]);
  const [dayset, setDayset] = useState<Set<Weekday>>(() => new Set(MF));

  // Show the list chronologically (by start time), but remember each item's real
  // index in the source array so edit / delete target the right one.
  const ordered = obligations
    .map((o, idx) => ({ o, idx }))
    .sort((a, b) => toMin(a.o.start) - toMin(b.o.start) || a.idx - b.idx);

  const openAdd = () => {
    setEditIndex(null);
    setLabel('');
    setRange([540, 600]);
    setDayset(new Set(MF));
    setEditorOpen(true);
  };

  const openEdit = (idx: number) => {
    const o = obligations[idx];
    if (!o) return;
    setEditIndex(idx);
    setLabel(o.label);
    setRange([toMin(o.start), toMin(o.end)]);
    setDayset(daysToSet(o.days));
    setEditorOpen(true);
  };

  // Let the timeline / commitments sheet drive this same editor by ref.
  useImperativeHandle(ref, () => ({ openEdit, openAdd }));

  const remove = (idx: number) => onChange(obligations.filter((_, i) => i !== idx));

  // Confirm before deleting so a stray tap on the "x" or "Remove" never wipes a
  // commitment instantly. Runs `after` (e.g. close the editor) once removed.
  // Alert.alert's button callbacks don't fire on react-native-web, so fall back
  // to window.confirm there — otherwise the "×" silently does nothing on web.
  const confirmRemove = (idx: number, after?: () => void) => {
    const name = obligations[idx]?.label || 'this commitment';
    const doRemove = () => {
      remove(idx);
      after?.();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window === 'undefined' ||
        // eslint-disable-next-line no-alert
        window.confirm(`Remove "${name}"? This takes it off your week.`);
      if (ok) doRemove();
      return;
    }
    Alert.alert(
      'Remove commitment?',
      `This takes "${name}" off your week.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ],
      { cancelable: true },
    );
  };

  const toggleDay = (k: Weekday) =>
    setDayset((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const applyQuick = (q: Quick) => {
    if (q === 'all') setDayset(new Set(WEEKDAY_KEYS));
    else if (q === 'weekdays') setDayset(new Set(MF));
    else setDayset(new Set(SS));
  };

  const canSave = range[1] > range[0] && dayset.size > 0;

  const save = () => {
    if (!canSave) return;
    const days = normDays(WEEKDAY_KEYS.filter((k) => dayset.has(k)));
    const item: Obligation = {
      label: (label.trim() || 'Busy').slice(0, 40),
      start: minToHHMM(range[0]),
      end: minToHHMM(range[1]),
      days,
    };
    const next = [...obligations];
    if (editIndex === null) next.push(item);
    else next[editIndex] = item;
    onChange(next);
    setEditorOpen(false);
  };

  const activeQuick: Quick | null = setEq(dayset, WEEKDAY_KEYS)
    ? 'all'
    : setEq(dayset, MF)
      ? 'weekdays'
      : setEq(dayset, SS)
        ? 'weekends'
        : null;

  return (
    <View>
      {!headless ? (
        <>
      <View style={styles.head}>
        <Text style={styles.title}>Commitments</Text>
        <Text style={styles.sub}>
          Work, classes, a commute, anything that recurs. Set which days each lands on and Max plans
          around them.
        </Text>
      </View>

      {ordered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No fixed commitments yet. Add work, a class or a commute so Max keeps your routines clear
            of them.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {ordered.map(({ o, idx }) => {
            const accent = obligationColor(o.label);
            return (
              <TouchableOpacity
                key={`${o.label}-${idx}`}
                style={styles.row}
                activeOpacity={0.6}
                onPress={() => openEdit(idx)}
              >
                <View style={[styles.rowBar, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {o.label}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowTime}>
                      {fmt12Compact(o.start)} - {fmt12Compact(o.end)}
                    </Text>
                    <View style={styles.rowDaysChip}>
                      <Text style={[styles.rowDaysText, { color: accent }]}>{daysLabel(o.days)}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={(e) => {
                    // Don't let the tap bubble to the row and open the editor.
                    e?.stopPropagation?.();
                    confirmRemove(idx);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.rowDelete}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${o.label}`}
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color={colors.foreground} />
        <Text style={styles.addBtnText}>Add commitment</Text>
      </TouchableOpacity>
        </>
      ) : null}

      {/* Add / edit sheet */}
      <Modal
        visible={editorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setEditorOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetWrap}
          >
            <View style={[styles.sheet, { maxHeight: sheetMaxH }]}>
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  onPress={() => setEditorOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>
                  {editIndex === null ? 'New commitment' : 'Edit commitment'}
                </Text>
                <View style={{ width: 22 }} />
              </View>

              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: spacing.md }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.fieldLabel}>What is it?</Text>
                <TextInput
                  style={styles.input}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g. Work, Biology class, Commute"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  maxLength={40}
                />

                <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>When?</Text>
                <TimePicker
                  min={OB_MIN}
                  max={OB_MAX}
                  value={range}
                  onChange={setRange}
                  format={fmtAbs}
                  accent={obligationColor(label)}
                />

                <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Which days?</Text>
                <View style={styles.quickRow}>
                  {(
                    [
                      { k: 'all', label: 'Every day' },
                      { k: 'weekdays', label: 'Weekdays' },
                      { k: 'weekends', label: 'Weekends' },
                    ] as { k: Quick; label: string }[]
                  ).map((q) => {
                    const on = activeQuick === q.k;
                    return (
                      <TouchableOpacity
                        key={q.k}
                        style={[styles.quickChip, on && styles.quickChipOn]}
                        activeOpacity={0.8}
                        onPress={() => applyQuick(q.k)}
                      >
                        <Text style={[styles.quickText, on && styles.quickTextOn]}>{q.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.dayDotsRow}>
                  {WEEKDAYS.map((w) => {
                    const on = dayset.has(w.key);
                    return (
                      <TouchableOpacity
                        key={w.key}
                        style={[styles.dayDot, on && styles.dayDotOn]}
                        activeOpacity={0.8}
                        onPress={() => toggleDay(w.key)}
                      >
                        <Text style={[styles.dayDotText, on && styles.dayDotTextOn]}>{w.letter}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {editIndex !== null ? (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => confirmRemove(editIndex, () => setEditorOpen(false))}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={{ height: 12 }} />
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
                <View style={styles.footerSummary}>
                  <Text style={styles.summaryText} numberOfLines={1}>
                    {canSave
                      ? `${fmtAbs(range[0])}–${fmtAbs(range[1])}`
                      : 'Set a valid time and at least one day'}
                  </Text>
                  {canSave ? (
                    <Text style={styles.summaryDays} numberOfLines={1}>
                      {daysLabel(normDays(WEEKDAY_KEYS.filter((k) => dayset.has(k))))}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
                  onPress={save}
                  disabled={!canSave}
                  activeOpacity={0.9}
                >
                  <Text style={styles.saveText}>{editIndex === null ? 'Add commitment' : 'Save changes'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
});

export default ObligationsManager;

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.foreground, letterSpacing: 0.1 },
  sub: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, lineHeight: 17, marginTop: 3, letterSpacing: 0.05 },
  empty: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 19, letterSpacing: 0.05 },
  list: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowBar: { width: 4, height: 34, borderRadius: 2, marginRight: 12 },
  rowLabel: { fontSize: 15, color: colors.foreground, fontFamily: fonts.sansSemiBold, letterSpacing: 0.05 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  rowTime: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textSecondary, letterSpacing: 0.1 },
  rowDaysChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  rowDaysText: { fontSize: 11, fontFamily: fonts.sansSemiBold, letterSpacing: 0.2 },
  rowDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.xs,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  addBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground, letterSpacing: 0.1 },

  // Sheet
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 21, color: colors.foreground, letterSpacing: -0.3 },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.1,
    marginBottom: 10,
  },
  input: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 0,
    color: colors.foreground,
    fontSize: 18,
    fontFamily: fonts.sansMedium,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  quickChip: {
    alignItems: 'center',
    paddingBottom: 7,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  quickChipOn: { borderBottomColor: colors.foreground },
  quickText: { fontSize: 14, fontFamily: fonts.sansMedium, color: colors.textMuted, letterSpacing: 0.1 },
  quickTextOn: { color: colors.foreground, fontFamily: fonts.sansSemiBold },
  dayDotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#1C1A17',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dayDotOn: { backgroundColor: colors.foreground, borderColor: colors.foreground, shadowOpacity: 0 },
  dayDotText: { fontSize: 13.5, fontFamily: fonts.sansMedium, color: colors.textSecondary },
  dayDotTextOn: { color: colors.background, fontFamily: fonts.sansSemiBold },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 10,
  },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.error, letterSpacing: 0.1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  footerSummary: { flex: 1, minWidth: 0 },
  summaryText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground, letterSpacing: 0.1 },
  summaryDays: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 2, letterSpacing: 0.1 },
  saveBtn: {
    backgroundColor: colors.foreground,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.35 },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.background, letterSpacing: 0.1 },
});
