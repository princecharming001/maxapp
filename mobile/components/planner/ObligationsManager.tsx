/**
 * ObligationsManager — the headless add/edit editor for the planner's single,
 * GLOBAL list of recurring commitments (work, classes, a commute, pickups…).
 * Work/school is just an obligation here; there is no separate "work schedule".
 *
 * The visible list lives on the planner screen (commitments sheet + timeline);
 * this component owns only the editor sheet, driven via ref (openAdd/openEdit)
 * so one always-mounted instance serves every entry point.
 *
 * Speaks the SAME language as the day editor + onboarding day-shape flow: a soft
 * canvas, a white soft-shadow card, tappable Starts/Ends rows opening the shared
 * drum-wheel picker (WheelTime), sentence-case labels, underline recurrence
 * tabs, hairline day toggles, and a footer of live summary + right-sized save.
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
import { Alert, InAppAlertHost } from '../InAppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing } from '../../theme/dark';
import { WheelTimeOverlay, WheelTimeRow, WT, CARD_SOFT } from './WheelTime';
import {
  Obligation,
  DayRecurrence,
  Weekday,
  WEEKDAYS,
  WEEKDAY_KEYS,
  normDays,
  daysLabel,
  fmt12,
  minToHHMM,
  toMin,
} from './plannerModel';

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

// Minimal underline tabs — the app's segmented device (active = ink text + 2px
// ink underline), matching DayEditorSheet.
function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (k: T) => void;
}) {
  return (
    <View style={tabs.wrap}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            style={[tabs.item, on && tabs.itemOn]}
            activeOpacity={0.8}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[tabs.text, on && tabs.textOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export type ObligationsManagerHandle = {
  openEdit: (index: number) => void;
  /** Open the blank editor; `initial` prefills the window (e.g. a tapped
   *  empty timeline slot). */
  openAdd: (initial?: { start: number; end: number }) => void;
};

type PickerTarget = 'from' | 'to' | null;

const ObligationsManager = forwardRef<
  ObligationsManagerHandle,
  {
    obligations: Obligation[];
    onChange: (next: Obligation[]) => void;
  }
>(function ObligationsManager({ obligations, onChange }, ref) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetMaxH = Math.round(winH * 0.9);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [range, setRange] = useState<[number, number]>([540, 1020]); // 9 AM–5 PM
  const [dayset, setDayset] = useState<Set<Weekday>>(() => new Set(MF));
  const [picker, setPicker] = useState<PickerTarget>(null);

  const openAdd = (initial?: { start: number; end: number }) => {
    setEditIndex(null);
    setLabel('');
    setRange(initial ? [initial.start, initial.end] : [540, 1020]);
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

  // Confirm before deleting so a stray tap never wipes a commitment instantly.
  // Alert.alert's button callbacks don't fire on react-native-web, so fall back
  // to window.confirm there.
  const confirmRemove = (idx: number, after?: () => void) => {
    const name = obligations[idx]?.label || 'this commitment';
    const doRemove = (deferAfter: boolean) => {
      remove(idx);
      // `after` dismisses the editor <Modal>. From the native path the confirm
      // is a nested <Modal>; closing both in one frame is the iOS two-modal
      // deadlock — defer a tick so the alert tears down first.
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

  // Confirm a wheel pick, keeping start < end (15-min min span).
  const confirmTime = (target: Exclude<PickerTarget, null>, v: number) => {
    setRange((r) => (target === 'from'
      ? [v, v + 15 > r[1] ? Math.min(1425, v + 15) : r[1]]
      : [v - 15 < r[0] ? Math.max(0, v - 15) : r[0], v]));
    setPicker(null);
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

  const closeSheet = () => {
    if (picker) { setPicker(null); return; }
    setEditorOpen(false);
  };

  return (
    <Modal
      visible={editorOpen}
      transparent
      animationType="slide"
      onRequestClose={closeSheet}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
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
              {/* What + when — one white card: a borderless label field over a
                  hairline, then the two tappable time rows. */}
              <View style={styles.card}>
                <TextInput
                  style={styles.labelInput}
                  value={label}
                  onChangeText={setLabel}
                  placeholder="Work, class, commute…"
                  placeholderTextColor={WT.MUTE}
                  returnKeyType="done"
                  maxLength={40}
                />
                <View style={styles.hair} />
                <WheelTimeRow
                  label="Starts"
                  display={fmt12(minToHHMM(range[0]))}
                  onPress={() => setPicker('from')}
                />
                <View style={styles.hair} />
                <WheelTimeRow
                  label="Ends"
                  display={fmt12(minToHHMM(range[1]))}
                  onPress={() => setPicker('to')}
                />
              </View>

              {/* Which days — underline tabs over an exact 7-day set. */}
              <Text style={styles.sectionLabel}>Which days</Text>
              <Tabs
                options={[
                  { key: 'all', label: 'Every day' },
                  { key: 'weekdays', label: 'Weekdays' },
                  { key: 'weekends', label: 'Weekends' },
                ]}
                value={activeQuick}
                onChange={(k) => applyQuick(k as Quick)}
              />
              <View style={styles.dayRow}>
                {WEEKDAYS.map((w) => {
                  const on = dayset.has(w.key);
                  return (
                    <TouchableOpacity
                      key={w.key}
                      style={[styles.dayDot, on && styles.dayDotOn]}
                      activeOpacity={0.8}
                      onPress={() => toggleDay(w.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={w.long}
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
                  <Ionicons name="trash-outline" size={14} color="#C0452C" />
                  <Text style={styles.removeText}>Remove commitment</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 12 }} />
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
              <View style={styles.footerSummary}>
                <Text style={styles.summaryText} numberOfLines={1}>
                  {canSave
                    ? `${fmt12(minToHHMM(range[0]))} – ${fmt12(minToHHMM(range[1]))}`
                    : 'Pick a start, end and a day'}
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
                <Text style={[styles.saveText, !canSave && styles.saveTextOff]}>
                  {editIndex === null ? 'Add' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Drum-wheel picker — in-sheet overlay within THIS modal (never a
            second <Modal> → avoids the two-modals-at-once iOS freeze). */}
        {picker ? (
          <WheelTimeOverlay
            title={picker === 'from' ? 'Starts' : 'Ends'}
            value={picker === 'from' ? range[0] : range[1]}
            onClose={() => setPicker(null)}
            onConfirm={(v) => confirmTime(picker, v)}
          />
        ) : null}

        {/* Host inside this editor Modal so the "Remove commitment?" confirm
            renders ABOVE the sheet. */}
        <InAppAlertHost />
      </View>
    </Modal>
  );
});

export default ObligationsManager;

const tabs = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', rowGap: 8 },
  item: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  itemOn: { borderBottomColor: WT.INK },
  text: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: WT.MUTE, letterSpacing: 0.1 },
  textOn: { fontFamily: fonts.sansSemiBold, color: WT.INK },
});

const styles = StyleSheet.create({
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
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 12,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: WT.INK,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 16,
  },

  // White soft-shadow card holding the label + the two time rows.
  card: {
    backgroundColor: WT.CARD,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    ...CARD_SOFT,
  },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: WT.HAIR },
  labelInput: {
    paddingVertical: 17,
    paddingHorizontal: 0,
    color: WT.INK,
    fontSize: 17,
    fontFamily: fonts.sansSemiBold,
  },

  sectionLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: WT.INK,
    letterSpacing: 0.1,
    marginTop: 26,
    marginBottom: 12,
    marginLeft: 4,
  },

  // Exact 7-day toggles — quiet hairline circles, ink fill when selected.
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  dayDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
  },
  dayDotOn: { backgroundColor: WT.INK, borderColor: WT.INK },
  dayDotText: { fontSize: 14, fontFamily: fonts.sansMedium, color: WT.SUB },
  dayDotTextOn: { color: WT.ON_INK, fontFamily: fonts.sansSemiBold },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 12,
  },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#C0452C', letterSpacing: 0.1 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: WT.HAIR,
  },
  footerSummary: { flex: 1, minWidth: 0 },
  summaryText: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: WT.INK,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  summaryDays: { fontFamily: fonts.sans, fontSize: 12.5, color: WT.MUTE, marginTop: 2, letterSpacing: 0.1 },
  saveBtn: {
    backgroundColor: WT.INK,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 15,
    paddingHorizontal: 30,
    minWidth: 104,
    alignItems: 'center',
    ...CARD_SOFT,
  },
  saveBtnOff: { backgroundColor: '#DAD9D6', shadowOpacity: 0 },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: WT.ON_INK, letterSpacing: 0.2 },
  saveTextOff: { color: '#8A8A86' },
});
