/**
 * ObligationsManager — the headless add/edit editor for the planner's single,
 * GLOBAL list of recurring commitments (work, classes, a commute, pickups…).
 * Work/school is just an obligation here; there is no separate "work schedule".
 *
 * The visible list lives on the planner screen (commitments sheet + timeline);
 * this component owns only the editor sheet, driven via ref (openAdd/openEdit)
 * so one always-mounted instance serves every entry point.
 *
 * Editorial sheet, matching DayEditorSheet one-to-one: white sheet, serif
 * title, hairline-defined fields (no filled gray boxes), the shared horizontal
 * TimePicker rails as the planner's ONE way to change a time (never the stock
 * iOS drum wheel), sentence-case labels, underline recurrence tabs, an
 * understated destructive text action, and a footer of live summary +
 * right-sized save.
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
  fmt12Compact,
  minToHHMM,
  toMin,
} from './plannerModel';

const fmtAbs = (m: number) => fmt12Compact(minToHHMM(m));

const MF: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const SS: Weekday[] = ['saturday', 'sunday'];

// Commitments live on the same clock as everything else in the planner.
const OB_MIN = 240;   // 4:00 AM — earliest start
const OB_MAX = 1425;  // 11:45 PM — latest end
const OB_STEP = 15;

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

// Minimal underline tabs — the same segmented device DayEditorSheet uses
// (active = ink text + 2px ink underline; inactive = muted), instead of the
// filled-pill segmented control.
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

  const clampRange = (r: [number, number]): [number, number] => [
    Math.max(OB_MIN, Math.min(r[0], OB_MAX - OB_STEP)),
    Math.max(OB_MIN + OB_STEP, Math.min(r[1], OB_MAX)),
  ];

  const openAdd = (initial?: { start: number; end: number }) => {
    setEditIndex(null);
    setLabel('');
    setRange(clampRange(initial ? [initial.start, initial.end] : [540, 1020]));
    setDayset(new Set(MF));
    setEditorOpen(true);
  };

  const openEdit = (idx: number) => {
    const o = obligations[idx];
    if (!o) return;
    setEditIndex(idx);
    setLabel(o.label);
    setRange(clampRange([toMin(o.start), toMin(o.end)]));
    setDayset(daysToSet(o.days));
    setEditorOpen(true);
  };

  // Let the timeline / commitments sheet drive this same editor by ref.
  useImperativeHandle(ref, () => ({ openEdit, openAdd }));

  const remove = (idx: number) => onChange(obligations.filter((_, i) => i !== idx));

  // Confirm before deleting so a stray tap on "Remove" never wipes a
  // commitment instantly. Runs `after` (e.g. close the editor) once removed.
  // Alert.alert's button callbacks don't fire on react-native-web, so fall back
  // to window.confirm there — otherwise removal silently does nothing on web.
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
              {/* What — one borderless field over a hairline. */}
              <TextInput
                style={styles.labelInput}
                value={label}
                onChangeText={setLabel}
                placeholder="Work, class, commute…"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                maxLength={40}
              />
              <View style={styles.hairline} />

              {/* When — the shared From/To rails. */}
              <Text style={styles.sectionLabel}>When</Text>
              <TimePicker
                min={OB_MIN}
                max={OB_MAX}
                step={OB_STEP}
                value={range}
                onChange={(v) => setRange(v)}
                format={fmtAbs}
                accent={colors.foreground}
              />

              {/* Which days — underline tabs over an exact 7-day set. */}
              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Which days</Text>
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
                <Text style={[styles.saveText, !canSave && styles.saveTextOff]}>
                  {editIndex === null ? 'Add' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Host inside this editor Modal so the "Remove commitment?" confirm
            renders ABOVE the sheet (iOS won't present the root host's modal
            over this one), so Remove actually works from the open editor. */}
        <InAppAlertHost />
      </View>
    </Modal>
  );
});

export default ObligationsManager;

const tabs = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', rowGap: 8 },
  item: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  itemOn: { borderBottomColor: colors.foreground },
  text: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.textMuted, letterSpacing: 0.1 },
  textOn: { fontFamily: fonts.sansSemiBold, color: colors.foreground },
});

const styles = StyleSheet.create({
  // ── Editor sheet — editorial (white, serif title, hairline fields) ──
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
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.foreground,
    letterSpacing: -0.4,
    marginBottom: 6,
  },

  // Sentence-case section labels — never ALL-CAPS letter-spaced gray.
  sectionLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.foreground,
    letterSpacing: 0.1,
    marginTop: spacing.lg,
    marginBottom: 2,
  },

  // Borderless label field over a hairline (no filled gray box).
  labelInput: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 0,
    color: colors.foreground,
    fontSize: 17,
    fontFamily: fonts.sansSemiBold,
    letterSpacing: -0.2,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  // Exact 7-day toggles — quiet hairline circles, ink fill when selected.
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: 2,
  },
  dayDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.14)',
  },
  dayDotOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  dayDotText: { fontSize: 13.5, fontFamily: fonts.sansMedium, color: colors.textSecondary },
  dayDotTextOn: { color: colors.background, fontFamily: fonts.sansSemiBold },

  // Understated destructive text action — no pink box, no red slab.
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 10,
  },
  removeText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.error, letterSpacing: 0.1 },

  // Footer — live summary beside a right-sized save.
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  footerSummary: { flex: 1, minWidth: 0 },
  summaryText: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.foreground,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  summaryDays: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textMuted, marginTop: 2, letterSpacing: 0.1 },
  saveBtn: {
    backgroundColor: colors.foreground,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 96,
    alignItems: 'center',
  },
  saveBtnOff: { backgroundColor: colors.surface },
  saveText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.background, letterSpacing: 0.1 },
  saveTextOff: { color: colors.textMuted },
});
