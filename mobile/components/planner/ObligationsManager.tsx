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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing } from '../../theme/dark';
import { paper as p, radius } from './plannerTheme';
import TimeRangeSlider from './TimeRangeSlider';
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

export default function ObligationsManager({
  obligations,
  onChange,
}: {
  obligations: Obligation[];
  onChange: (next: Obligation[]) => void;
}) {
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

  const remove = (idx: number) => onChange(obligations.filter((_, i) => i !== idx));

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
      <View style={styles.head}>
        <View style={styles.headIconWrap}>
          <Ionicons name="calendar-clear-outline" size={16} color={p.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Commitments</Text>
          <Text style={styles.sub}>
            Work, classes, a commute — anything that recurs. Set which days each lands on; Max plans
            around them.
          </Text>
        </View>
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
                      {fmt12Compact(o.start)} – {fmt12Compact(o.end)}
                    </Text>
                    <View style={styles.rowDaysChip}>
                      <Text style={[styles.rowDaysText, { color: accent }]}>{daysLabel(o.days)}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => remove(idx)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.rowDelete}
                >
                  <Ionicons name="close" size={16} color={p.inkFaint} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color={p.ink} />
        <Text style={styles.addBtnText}>Add commitment</Text>
      </TouchableOpacity>

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
                  <Ionicons name="close" size={22} color={p.inkFaint} />
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
                  placeholderTextColor={p.inkFaint}
                  returnKeyType="done"
                  maxLength={40}
                />

                <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>When?</Text>
                <TimeRangeSlider
                  min={OB_MIN}
                  max={OB_MAX}
                  value={range}
                  onChange={setRange}
                  format={fmtAbs}
                  accent={obligationColor(label)}
                  ticksEvery={180}
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
                <Text style={styles.previewText}>
                  {dayset.size === 0
                    ? 'Pick at least one day.'
                    : `Repeats: ${daysLabel(normDays(WEEKDAY_KEYS.filter((k) => dayset.has(k))))}`}
                </Text>

                {editIndex !== null ? (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => {
                      remove(editIndex);
                      setEditorOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={15} color={p.accent} />
                    <Text style={styles.removeText}>Remove this commitment</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={{ height: 12 }} />
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
                  onPress={save}
                  disabled={!canSave}
                  activeOpacity={0.9}
                >
                  <Text style={styles.saveText}>{editIndex === null ? 'Add' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: spacing.md },
  headIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.inset,
  },
  // Section title carries the serif voice; the deck stays quiet grotesk.
  title: { fontFamily: fonts.serif, fontSize: 18, color: p.ink, letterSpacing: -0.2 },
  sub: { fontFamily: fonts.sans, fontSize: 12.5, color: p.inkFaint, lineHeight: 17, marginTop: 3, letterSpacing: 0.05 },
  empty: {
    backgroundColor: p.inset,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  emptyText: { fontFamily: fonts.sans, fontSize: 12.5, color: p.inkFaint, lineHeight: 18, letterSpacing: 0.05 },
  list: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: p.rule,
  },
  rowBar: { width: 3, height: 34, borderRadius: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, color: p.ink, fontFamily: fonts.sansSemiBold, letterSpacing: 0.05 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  rowTime: { fontFamily: fonts.sans, fontSize: 12.5, color: p.inkSoft, letterSpacing: 0.1 },
  rowDaysChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: p.inset,
  },
  rowDaysText: { fontSize: 11, fontFamily: fonts.sansSemiBold, letterSpacing: 0.2 },
  rowDelete: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  // A squared, hairline-ruled "+ add" row — like a blank line on a form.
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.ruleStrong,
    backgroundColor: 'transparent',
  },
  addBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: p.ink, letterSpacing: 0.2 },

  // Sheet
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,22,14,0.40)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: p.page,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: p.ruleStrong,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 21, color: p.ink, letterSpacing: -0.3 },
  fieldLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: p.inkFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  input: {
    backgroundColor: p.inset,
    borderRadius: radius.sm,
    paddingVertical: 13,
    paddingHorizontal: 15,
    color: p.ink,
    fontSize: 15.5,
    fontFamily: fonts.sansMedium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.ruleStrong,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.ruleStrong,
  },
  quickChipOn: { backgroundColor: p.ink, borderColor: p.ink },
  quickText: { fontSize: 12.5, fontFamily: fonts.sansMedium, color: p.inkSoft, letterSpacing: 0.1 },
  quickTextOn: { color: p.onAccent, fontFamily: fonts.sansSemiBold },
  dayDotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  dayDot: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.ruleStrong,
  },
  dayDotOn: { backgroundColor: p.ink, borderColor: p.ink },
  dayDotText: { fontSize: 14, fontFamily: fonts.sansSemiBold, color: p.inkSoft },
  dayDotTextOn: { color: p.onAccent },
  previewText: { fontFamily: fonts.sans, fontSize: 12.5, color: p.inkSoft, letterSpacing: 0.1, marginTop: 12 },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: p.accentWash,
  },
  removeText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: p.accent, letterSpacing: 0.1 },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.rule,
  },
  saveBtn: {
    backgroundColor: p.ink,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.4 },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: p.onAccent, letterSpacing: 0.4 },
});
