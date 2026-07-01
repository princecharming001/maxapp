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
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
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
import { Alert, InAppAlertHost } from '../InAppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme/dark';
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

const fmtAbs = (m: number) => fmt12Compact(minToHHMM(m));

const MF: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const SS: Weekday[] = ['saturday', 'sunday'];

// ── Onboarding-matched palette (Cal AI × Stoic) ────────────────────────────
// The editor sheet mirrors the onboarding day-shape screen one-to-one: a soft
// canvas, white soft-shadow cards, ink-fill selection, and the same wheel time
// picker — so a commitment never reads as a different app than the flow that
// first set the user's schedule.
const INK = '#111113';
const ON_INK = '#FFFFFF';
const SHEET_BG = '#F1F1EF'; // Stoic soft off-white canvas
const CARD = '#FFFFFF';
const SUB = '#6B6B6B';
const MUTE = '#9A9A9A';
const HAIR = 'rgba(0,0,0,0.06)';
const WASH = 'rgba(0,0,0,0.05)';
const SOFT = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// ── Stoic wheel time picker (lifted from onboarding so they match exactly) ──
const ITEM_H = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

function decompose(min: number) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const p = h24 >= 12 ? 1 : 0;
  const h12 = h24 % 12 || 12;
  return { h: h12 - 1, m, p };
}
function compose(hIdx: number, m: number, p: number) {
  const h12 = hIdx + 1;
  const base = h12 % 12;
  const h24 = p === 1 ? base + 12 : base;
  return ((h24 * 60) + m) % 1440;
}

// A single snapping column — uncontrolled after its initial scroll; reports the
// centred index up via onChange (fires on scroll, so it works on web too).
function Wheel({
  values,
  initialIndex,
  onChange,
  width = 62,
}: {
  values: string[];
  initialIndex: number;
  onChange: (i: number) => void;
  width?: number;
}) {
  const ref = useRef<ScrollView>(null);
  const inited = useRef(false);
  const [active, setActive] = useState(initialIndex);

  const settle = (y: number) => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_H)));
    if (i !== active) {
      setActive(i);
      onChange(i);
    }
  };

  return (
    <View style={{ width, height: ITEM_H * VISIBLE }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onLayout={() => {
          if (!inited.current) {
            inited.current = true;
            ref.current?.scrollTo({ y: initialIndex * ITEM_H, animated: false });
          }
        }}
        onScroll={(e) => settle(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {values.map((v, i) => (
          <View key={i} style={styles.wheelItem}>
            <Text style={[styles.wheelText, i === active && styles.wheelTextActive]}>{v}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function WheelTimeSheet({
  title,
  value,
  onClose,
  onConfirm,
}: {
  title: string;
  value: number;
  onClose: () => void;
  onConfirm: (v: number) => void;
}) {
  const init = decompose(value);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [p, setP] = useState(init.p);

  // Rendered as an in-sheet absolute overlay INSIDE the editor Modal — NOT a
  // second <Modal>. Two stacked transparent RN Modals (editor + this picker)
  // present as separate iOS windows; a botched dismiss leaves an orphan overlay
  // that swallows every tap (the "stuck planner"). Keeping the picker in the
  // same modal tree avoids the two-modals-at-once deadlock entirely.
  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={styles.wheelBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.wheelSheet} activeOpacity={1} onPress={() => {}}>
          <Text style={styles.wheelSheetTitle}>{title}</Text>
          <View style={styles.wheelRow}>
            <View style={styles.wheelBand} pointerEvents="none" />
            <Wheel values={HOURS} initialIndex={init.h} onChange={setH} />
            <Wheel values={MINUTES} initialIndex={init.m} onChange={setM} />
            <Wheel values={PERIODS} initialIndex={init.p} onChange={setP} width={56} />
          </View>
          <TouchableOpacity
            style={styles.wheelDone}
            activeOpacity={0.9}
            onPress={() => onConfirm(compose(h, m, p))}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.wheelDoneText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

// A Stoic notification-style row: small label left, big time + chevron right.
function TimeRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.timeRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${fmtAbs(value)}`}
    >
      <Text style={styles.timeRowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.timeRowValue}>{fmtAbs(value)}</Text>
      <Ionicons name="chevron-forward" size={18} color={MUTE} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

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
  const [range, setRange] = useState<[number, number]>([540, 1020]); // 9 AM–5 PM
  const [dayset, setDayset] = useState<Set<Weekday>>(() => new Set(MF));
  // Which time field the wheel sheet is editing (null = closed).
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);

  // Show the list chronologically (by start time), but remember each item's real
  // index in the source array so edit / delete target the right one.
  const ordered = obligations
    .map((o, idx) => ({ o, idx }))
    .sort((a, b) => toMin(a.o.start) - toMin(b.o.start) || a.idx - b.idx);

  const openAdd = () => {
    setEditIndex(null);
    setLabel('');
    setRange([540, 1020]); // 9 AM–5 PM
    setDayset(new Set(MF));
    setPicker(null);
    setEditorOpen(true);
  };

  const openEdit = (idx: number) => {
    const o = obligations[idx];
    if (!o) return;
    setEditIndex(idx);
    setLabel(o.label);
    setRange([toMin(o.start), toMin(o.end)]);
    setDayset(daysToSet(o.days));
    setPicker(null);
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
    const doRemove = (deferAfter: boolean) => {
      remove(idx);
      // `after` (e.g. () => setEditorOpen(false)) dismisses the editor <Modal>.
      // When the confirm comes from the native path it lives in a nested <Modal>
      // stacked on the editor; closing both in the same frame is the iOS
      // two-modal deadlock (taps freeze app-wide → restart). Defer a tick so the
      // alert modal tears down first. The web path has no nested RN Modal, so it
      // runs `after` synchronously.
      if (after) deferAfter ? setTimeout(after, 0) : after();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window === 'undefined' ||
        // eslint-disable-next-line no-alert
        window.confirm(`Remove "${name}"? This takes it off your week.`);
      if (ok) doRemove(false);
      return;
    }
    Alert.alert(
      'Remove commitment?',
      `This takes "${name}" off your week.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => doRemove(true) },
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
              <Text style={styles.sheetTitle}>
                {editIndex === null ? 'New commitment' : 'Edit commitment'}
              </Text>

              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: spacing.md }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* What + when, grouped into one white soft-shadow card */}
                <View style={styles.card}>
                  <TextInput
                    style={styles.labelInput}
                    value={label}
                    onChangeText={setLabel}
                    placeholder="What is it? Work, class, commute…"
                    placeholderTextColor={MUTE}
                    returnKeyType="done"
                    maxLength={40}
                  />
                  <View style={styles.hair} />
                  <TimeRow label="Starts" value={range[0]} onPress={() => setPicker('from')} />
                  <View style={styles.hair} />
                  <TimeRow label="Ends" value={range[1]} onPress={() => setPicker('to')} />
                </View>

                {/* Which days — segmented quick-pick over an exact 7-day set */}
                <Text style={styles.groupLabel}>WHICH DAYS</Text>
                <View style={styles.seg}>
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
                        style={[styles.segItem, on && styles.segItemActive]}
                        activeOpacity={0.85}
                        onPress={() => applyQuick(q.k)}
                      >
                        <Text style={[styles.segText, on && styles.segTextActive]}>{q.label}</Text>
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
                        activeOpacity={0.85}
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
                    <Text style={styles.removeText}>Remove commitment</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={{ height: 12 }} />
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
                <View style={styles.footerSummary}>
                  <Text style={styles.summaryText} numberOfLines={1}>
                    {canSave
                      ? `${fmtAbs(range[0])} – ${fmtAbs(range[1])}`
                      : 'Pick a start, end and at least one day'}
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
                  <Text style={styles.saveText}>{editIndex === null ? 'Add' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>

          {/* Wheel time picker — an in-sheet overlay within THIS editor modal,
              NEVER a second <Modal> (avoids the two-modals-at-once iOS freeze).
              Full-screen so a tap anywhere outside the wheel closes just it. */}
          {picker ? (
            <WheelTimeSheet
              title={picker === 'from' ? 'Starts' : 'Ends'}
              value={picker === 'from' ? range[0] : range[1]}
              onClose={() => setPicker(null)}
              onConfirm={(v) => {
                setRange((r) => (picker === 'from' ? [v, r[1]] : [r[0], v]));
                setPicker(null);
              }}
            />
          ) : null}
          {/* Host inside this editor Modal so the "Remove commitment?" confirm
              renders ABOVE the sheet (iOS won't present the root host's modal
              over this one), so the × actually works on a dirty editor. */}
          <InAppAlertHost />
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

  // ── Editor sheet — onboarding-matched (soft canvas, white cards, ink) ──
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: INK,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 18,
  },

  // White soft-shadow card holding the label + the two time rows
  card: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    ...SOFT,
  },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: HAIR },
  labelInput: {
    paddingVertical: 17,
    paddingHorizontal: 0,
    color: INK,
    fontSize: 17,
    fontFamily: fonts.sansSemiBold,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  timeRowLabel: { fontFamily: fonts.sansMedium, fontSize: 15.5, color: SUB },
  timeRowValue: { fontFamily: fonts.sansSemiBold, fontSize: 19, color: INK, letterSpacing: -0.3 },

  // Group label above the day controls
  groupLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: MUTE,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 12,
    marginLeft: 4,
  },

  // Segmented quick-pick — ink thumb on a white soft-shadow track
  seg: {
    flexDirection: 'row',
    padding: 5,
    gap: 5,
    backgroundColor: CARD,
    borderRadius: 18,
    borderCurve: 'continuous',
    ...SOFT,
  },
  segItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 13, borderCurve: 'continuous' },
  segItemActive: { backgroundColor: INK },
  segText: { fontFamily: fonts.sansMedium, fontSize: 14, color: SUB },
  segTextActive: { color: ON_INK, fontFamily: fonts.sansSemiBold },

  // Exact 7-day toggle dots
  dayDotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 2 },
  dayDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    ...SOFT,
  },
  dayDotOn: { backgroundColor: INK, shadowOpacity: 0 },
  dayDotText: { fontSize: 14, fontFamily: fonts.sansMedium, color: SUB },
  dayDotTextOn: { color: ON_INK, fontFamily: fonts.sansSemiBold },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 12,
  },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.error, letterSpacing: 0.1 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIR,
  },
  footerSummary: { flex: 1, minWidth: 0 },
  summaryText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: INK, letterSpacing: 0.1 },
  summaryDays: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2, letterSpacing: 0.1 },
  saveBtn: {
    backgroundColor: INK,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 15,
    paddingHorizontal: 30,
    minWidth: 104,
    alignItems: 'center',
    ...SOFT,
  },
  saveBtnOff: { backgroundColor: '#DAD9D6', shadowOpacity: 0 },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: ON_INK, letterSpacing: 0.2 },

  // ── Wheel time picker (matches onboarding exactly) ──
  wheelItem: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontFamily: fonts.sansMedium, fontSize: 21, color: MUTE },
  wheelTextActive: { fontFamily: fonts.sansSemiBold, color: INK },
  wheelBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  wheelSheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingTop: 22,
    paddingBottom: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  wheelSheetTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: INK, marginBottom: 8 },
  wheelRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_H * VISIBLE, position: 'relative' },
  wheelBand: { position: 'absolute', left: 12, right: 12, top: ITEM_H * 2, height: ITEM_H, borderRadius: 12, backgroundColor: WASH },
  wheelDone: {
    marginTop: 18,
    height: 52,
    minWidth: 200,
    paddingHorizontal: 48,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    ...SOFT,
  },
  wheelDoneText: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: ON_INK, letterSpacing: 0.2 },
});
