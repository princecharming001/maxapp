/**
 * DayPlannerScreen — the planner.
 *
 * Direct manipulation first: pick a scope (Every day, or one weekday) with clear
 * labelled pills, then SEE that day as a vertical timeline and tap any block to
 * adjust it. Wake / get-ready / workout / wind-down open the visual range editor;
 * commitments live in their own list right below. Edits auto-save and regenerate
 * the live schedule.
 *
 * A natural-language assistant is still here — demoted to an "or just tell Max in
 * words" panel you can open — so power users can reshape the week by describing
 * it, but it is no longer the thing you meet first.
 *
 * Layout: a flat, single white surface with hairline rules between sections — no
 * stacked cards, no shadows. One restrained green accent marks the workout and
 * the assistant; everything else is monochrome ink.
 */
import React, { useEffect, useRef, useState } from 'react';
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
  Modal,
  Pressable,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';

// Smooth the pill width change (short → full day name) on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, fonts } from '../../theme/dark';
import DayEditorSheet, { ShapeFocus } from '../../components/planner/DayEditorSheet';
import DayTimeline from '../../components/planner/DayTimeline';
import ScheduleGrid from '../../components/planner/ScheduleGrid';
import ObligationsManager, { ObligationsManagerHandle } from '../../components/planner/ObligationsManager';
import {
  DayShape,
  Obligation,
  Scope,
  Weekday,
  WEEKDAYS,
  hydrateDayShape,
  hydrateWeekly,
  hydrateObligations,
  dayShapeToServer,
  serializeWeekly,
  obligationsToServer,
  diffDayShape,
  effectiveDay,
  hasOverride,
} from '../../components/planner/plannerModel';

// One restrained accent for the assistant surface only.
const ACCENT = '#2F6B4E';
const ACCENT_WASH = 'rgba(47,107,78,0.10)';

const CHAT_EXAMPLES = [
  'Wake between 6:30 and 7:30 on weekdays',
  'Sleep in until 10 on weekends',
  'Add gym 6-7pm Mon, Wed, Fri',
  'Work 9-5 on weekdays',
];

// Quick-tap prompts for the change sheet — chip label + the text it prefills.
const SUGGESTIONS: { chip: string; text: string }[] = [
  { chip: 'Wake earlier', text: 'Wake between 6:30 and 7:30 on weekdays' },
  { chip: 'Sleep in weekends', text: 'Sleep in until 10 on weekends' },
  { chip: 'Set work hours', text: 'Work 9-5 on weekdays' },
  { chip: 'Add a workout', text: 'Add gym 6-7pm Mon, Wed, Fri' },
];

export default function DayPlannerScreen({ embedded = false }: { embedded?: boolean }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const ob = (user?.onboarding || {}) as Record<string, any>;

  const [defaults, setDefaults] = useState<DayShape>(() => hydrateDayShape(ob));
  const [weekly, setWeekly] = useState<Partial<Record<Weekday, Partial<DayShape>>>>(
    () => hydrateWeekly(ob.weekly_timings),
  );
  const [obligations, setObligations] = useState<Obligation[]>(() => hydrateObligations(ob));

  // The day the timeline + editor act on. "Every day" edits the base; a weekday
  // edits just that day (a minimal override diffed against the base).
  const [scope, setScope] = useState<Scope>('all');
  // Agenda list vs. Timepage-style hour grid.
  const [planView, setPlanView] = useState<'list' | 'grid'>('list');

  // Editor sheet: keep the scope set across the close animation to avoid a flash.
  const [editScope, setEditScope] = useState<Scope>('all');
  const [editFocus, setEditFocus] = useState<ShapeFocus | undefined>(undefined);
  const [sheetVisible, setSheetVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  // Assistant (demoted): hidden behind a floating button, opened only on demand.
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  // Rotate the examples through the input's own placeholder (no chips, no
  // dropdown — the bar IS the affordance).
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    if (chatInput) return;
    const id = setInterval(() => setPhIdx((i) => (i + 1) % CHAT_EXAMPLES.length), 3500);
    return () => clearInterval(id);
  }, [chatInput]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);
  // Reply tone drives ONLY the bubble styling: 'success' shows the green check,
  // 'warn' is used for failures and no-op replies so they never look applied.
  const [chatReplyTone, setChatReplyTone] = useState<'success' | 'warn'>('success');
  const chatRef = useRef<TextInput>(null);
  const obligationsRef = useRef<ObligationsManagerHandle>(null);

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
  };

  // Full onboarding payload from a (defaults, weekly) snapshot. Spreads the
  // existing onboarding so required fields (goals, experience_level, …) ride
  // along untouched and only the planner fields are rewritten.
  const buildOnboarding = (
    nd: DayShape,
    nw: Partial<Record<Weekday, Partial<DayShape>>>,
    no: Obligation[],
  ): Record<string, any> => {
    const base = { ...(user?.onboarding || {}) } as Record<string, any>;
    const tz =
      base.timezone ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    const weeklyOut = serializeWeekly(nw);
    return {
      ...base,
      completed: true,
      timezone: tz,
      ...dayShapeToServer(nd),
      // Work is just an obligation now — drop the legacy work block so the
      // scheduler never double-books it alongside the migrated "Work" obligation.
      obligations: obligationsToServer(no),
      work_schedule: null,
      work_start: null,
      work_end: null,
      weekly_timings: Object.keys(weeklyOut).length ? weeklyOut : null,
    };
  };

  const persist = async (
    nd: DayShape,
    nw: Partial<Record<Weekday, Partial<DayShape>>>,
    no: Obligation[],
  ) => {
    setSaving(true);
    try {
      await api.saveOnboarding(buildOnboarding(nd, nw, no) as any);
      await refreshUser();
      invalidateSchedules();
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

  // Commit one scope's edits: defaults for "All days", else a minimal per-weekday
  // override (diffed against defaults so editing back to base clears it).
  const commitScope = (s: Scope, day: DayShape) => {
    if (s === 'all') {
      setDefaults(day);
      persist(day, weekly, obligations);
      return;
    }
    const partial = diffDayShape(defaults, day);
    const nextWeekly: Partial<Record<Weekday, Partial<DayShape>>> = { ...weekly };
    if (Object.keys(partial).length) nextWeekly[s] = partial;
    else delete nextWeekly[s];
    setWeekly(nextWeekly);
    persist(defaults, nextWeekly, obligations);
  };

  const resetScope = (day: Weekday) => {
    const nextWeekly = { ...weekly };
    delete nextWeekly[day];
    setWeekly(nextWeekly);
    persist(defaults, nextWeekly, obligations);
  };

  const changeObligations = (next: Obligation[]) => {
    setObligations(next);
    persist(defaults, weekly, next);
  };

  const applyServerState = (
    d?: Record<string, any> | null,
    wk?: Record<string, any> | null,
  ) => {
    setDefaults(hydrateDayShape(d || {}));
    setWeekly(hydrateWeekly(wk || {}));
    setObligations(hydrateObligations(d || {}));
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatLoading(true);
    setChatReply(null);
    setChatReplyTone('success');
    try {
      // Flush the current canvas first so the assistant reasons over — and never
      // discards — exactly what's on screen, then re-hydrate from its result.
      await api.saveOnboarding(buildOnboarding(defaults, weekly, obligations) as any);
      const res = await api.plannerChat(text);
      applyServerState(res.defaults, res.weekly_timings);
      // A no-op result ("couldn't tell which day you meant") must not read as a
      // success, so flag the bubble as a warning when nothing changed.
      setChatReplyTone(res.changed === false ? 'warn' : 'success');
      setChatReply(res.summary || res.message || 'Updated your plan.');
      setChatInput('');
      await refreshUser();
      invalidateSchedules();
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Couldn\'t update your plan. Try rephrasing.';
      setChatReplyTone('warn');
      setChatReply(msg);
    } finally {
      setChatLoading(false);
    }
  };

  const openEditor = (s: Scope, focus?: ShapeFocus) => {
    setEditScope(s);
    setEditFocus(focus);
    setSheetVisible(true);
  };

  const sendDisabled = !chatInput.trim() || chatLoading;

  const scopeLabel =
    scope === 'all' ? 'Every day' : WEEKDAYS.find((w) => w.key === scope)?.long ?? 'Day';
  const scopeOverridden = scope !== 'all' && hasOverride(weekly, scope);
  const dayForScope = effectiveDay(defaults, weekly, scope);

  return (
    <View style={styles.container}>
      {/* Minimal top nav: navigation + transient saving status only. */}
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
        <View style={styles.savingSlot}>
          {saving ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Masthead */}
          <View style={styles.masthead}>
            <Text style={styles.title}>Your week</Text>
            <Text style={styles.subhead}>
              Tap anything to adjust it. Max fits your routines into the open time around it.
            </Text>
          </View>

          {/* Scope selector — which day you're shaping. Clear labels (no cryptic
              dots); a marked pill means that day differs from your every-day. */}
          <View style={styles.scopeBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scopeScroll}
            >
              <ScopePill label="Every day" active={scope === 'all'} onPress={() => setScope('all')} />
              {WEEKDAYS.map((w) => (
                <ScopePill
                  key={w.key}
                  label={w.short}
                  expandedLabel={w.long}
                  active={scope === w.key}
                  edited={hasOverride(weekly, w.key)}
                  onPress={() => setScope(w.key)}
                />
              ))}
            </ScrollView>
          </View>

          {/* The day, as a tappable timeline. */}
          <View style={styles.section}>
            <View style={styles.scopeHead}>
              <Text style={styles.scopeTitle}>{scopeLabel}</Text>
              <View style={styles.scopeHeadRight}>
                {scopeOverridden ? (
                  <TouchableOpacity
                    onPress={() => resetScope(scope as Weekday)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.resetLink}>Reset</Text>
                  </TouchableOpacity>
                ) : null}
                {/* List ↔ grid view toggle */}
                <View style={styles.viewToggle}>
                  {(['list', 'grid'] as const).map((m) => {
                    const active = planView === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setPlanView(m)}
                        style={[styles.viewToggleBtn, active && styles.viewToggleBtnActive]}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={m === 'list' ? 'Agenda view' : 'Grid view'}
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons
                          name={m === 'list' ? 'list-outline' : 'grid-outline'}
                          size={16}
                          color={active ? colors.background : colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {planView === 'list' ? (
              <DayTimeline
                day={dayForScope}
                obligations={obligations}
                scope={scope}
                onEditShape={(focus) => openEditor(scope, focus)}
                onEditObligation={(i) => obligationsRef.current?.openEdit(i)}
              />
            ) : (
              <ScheduleGrid
                day={dayForScope}
                obligations={obligations}
                scope={scope}
                onEditShape={(focus) => openEditor(scope, focus)}
                onEditObligation={(i) => obligationsRef.current?.openEdit(i)}
              />
            )}
          </View>

          {/* Commitments — the global, day-scoped obligations list. */}
          <View style={styles.section}>
            <ObligationsManager ref={obligationsRef} obligations={obligations} onChange={changeObligations} />
          </View>

          <View style={{ height: 96 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating button, bottom-right — opens the change sheet on demand. */}
      {!chatOpen ? (
        <View style={[styles.fabShadow, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.8}
            onPress={() => setChatOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Change your week — tell Max"
          >
            {/* Frosted glass: a blur of the page behind, a soft light tint, and a
                top highlight for the glassy sheen. */}
            <BlurView intensity={32} tint="light" style={StyleSheet.absoluteFill} />
            <View style={styles.fabTint} />
            <View style={styles.fabSheen} />
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Minimal "tell Max" change sheet — serif prompt + quick chips + a clean
          borderless composer. Opened only from the floating button. */}
      <Modal
        visible={chatOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setChatOpen(false)}
        onShow={() => setTimeout(() => chatRef.current?.focus(), 60)}
      >
        <View style={styles.chatRoot}>
          <Pressable style={styles.chatBackdrop} onPress={() => setChatOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.chatSheetWrap}
          >
            <View style={[styles.chatSheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
              <View style={styles.grabber} />
              <Text style={styles.chatHeadline}>What should change?</Text>

              {chatReply ? (
                <View style={[styles.chatReply, chatReplyTone === 'warn' && styles.chatReplyWarn]}>
                  <View style={[styles.chatReplyIcon, chatReplyTone === 'warn' && styles.chatReplyIconWarn]}>
                    <Ionicons name={chatReplyTone === 'warn' ? 'alert' : 'checkmark'} size={13} color="#fff" />
                  </View>
                  <Text style={styles.chatReplyText}>{chatReply}</Text>
                </View>
              ) : (
                <View style={styles.suggRow}>
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s.chip}
                      style={styles.suggChip}
                      activeOpacity={0.7}
                      onPress={() => { setChatInput(s.text); chatRef.current?.focus(); }}
                    >
                      <Text style={styles.suggText}>{s.chip}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.composer}>
                <TextInput
                  ref={chatRef}
                  style={styles.composerInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder={chatLoading ? 'Reshaping your week…' : 'Tell Max in plain words…'}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  returnKeyType="send"
                  blurOnSubmit
                  onSubmitEditing={sendChat}
                  editable={!chatLoading}
                />
                <TouchableOpacity
                  onPress={sendChat}
                  activeOpacity={0.85}
                  disabled={sendDisabled}
                  style={[styles.composerSend, sendDisabled && styles.composerSendOff]}
                >
                  {chatLoading ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color={sendDisabled ? colors.textMuted : colors.background} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <DayEditorSheet
        visible={sheetVisible}
        scope={editScope}
        initial={effectiveDay(defaults, weekly, editScope)}
        overridden={editScope !== 'all' && hasOverride(weekly, editScope)}
        focus={editFocus}
        onClose={() => setSheetVisible(false)}
        onCommit={commitScope}
        onReset={resetScope}
      />
    </View>
  );
}

function ScopePill({
  label,
  expandedLabel,
  active,
  edited,
  onPress,
}: {
  label: string;
  expandedLabel?: string;
  active: boolean;
  edited?: boolean;
  onPress: () => void;
}) {
  // Drive every visual off one spring so the selected pill lifts, scales and
  // fills with ink in a single gesture — the "tap to expand" feel.
  const p = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(p, {
      toValue: active ? 1 : 0,
      useNativeDriver: false,
      friction: 7,
      tension: 120,
    }).start();
  }, [active, p]);

  const backgroundColor = p.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.foreground] });
  const borderColor = p.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.foreground] });
  const color = p.interpolate({ inputRange: [0, 1], outputRange: [colors.textSecondary, '#fff'] });
  const scale = p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  // The active weekday opens up to its full name; "Every day" has no expansion.
  const shownLabel = active && expandedLabel ? expandedLabel : label;

  return (
    <TouchableOpacity
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
        onPress();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${active && expandedLabel ? expandedLabel : label}${edited ? ', customized' : ''}`}
    >
      <Animated.View
        style={[
          styles.scopePill,
          active && styles.scopePillActiveElev,
          { backgroundColor, borderColor, transform: [{ scale }, { translateY }] },
        ]}
      >
        <Animated.Text
          style={[styles.scopePillText, active && styles.scopePillTextActiveWeight, { color }]}
          numberOfLines={1}
        >
          {shownLabel}
        </Animated.Text>
      </Animated.View>
      {edited && !active ? <View style={styles.editedDot} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Warm cream canvas, matching every other page.
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  backButton: { padding: 4, width: 40 },
  savingSlot: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  // Masthead — the page's hero.
  masthead: { paddingTop: spacing.xs, paddingBottom: spacing.md },
  kicker: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    color: colors.foreground,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  subhead: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 19,
    letterSpacing: 0.05,
  },

  // Scope selector.
  scopeBar: { marginHorizontal: -spacing.lg },
  // Extra vertical room so the active pill can scale + lift without clipping.
  scopeScroll: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: 8 },
  scopePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 38,
  },
  // Soft drop shadow that reads as the selected pill floating above the rest.
  scopePillActiveElev: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  scopePillText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.textSecondary, letterSpacing: 0.1 },
  scopePillTextActiveWeight: { fontFamily: fonts.sansSemiBold },
  // A small corner marker (top-right) for a weekday that differs from every-day.
  editedDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: colors.background,
  },

  // Content sections, separated by hairline rules instead of card edges.
  section: {
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scopeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scopeTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.foreground, letterSpacing: -0.2 },
  scopeHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resetLink: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: ACCENT, letterSpacing: 0.05 },
  viewToggle: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 999, padding: 2,
  },
  viewToggleBtn: {
    width: 34, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  viewToggleBtnActive: { backgroundColor: colors.foreground },

  sectionKicker: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  sectionNote: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: spacing.md,
    letterSpacing: 0.05,
  },

  // Assistant — one plain input bar.
  chatReply: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: ACCENT_WASH,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  chatReplyIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  chatReplyWarn: { backgroundColor: 'rgba(180,120,20,0.10)' },
  chatReplyIconWarn: { backgroundColor: '#B47814' },
  chatReplyText: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.foreground, lineHeight: 19, letterSpacing: 0.05 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 18,
    color: colors.foreground,
    fontFamily: fonts.sans,
    fontSize: 15,
    letterSpacing: 0.05,
  },
  chatSendWrap: { width: 48, height: 48 },
  chatSend: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendOn: { backgroundColor: ACCENT },
  chatSendOff: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },

  // Floating button (bottom-right) + the minimal on-demand change sheet.
  // Outer wrapper carries the soft drop shadow — kept off the clipped circle so
  // `overflow: hidden` (needed to round the blur) doesn't mask the shadow away.
  fabShadow: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#3A352B',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  // The frosted glass disc: blur fills it, a hairline gives it an edge.
  fab: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  fabTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(247,240,234,0.22)',
  },
  fabSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  chatRoot: { flex: 1, justifyContent: 'flex-end' },
  chatBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,26,23,0.38)' },
  chatSheetWrap: { width: '100%' },
  chatSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  chatHeadline: {
    fontFamily: fonts.serif,
    fontSize: 25,
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  suggRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  suggChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  suggText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textSecondary, letterSpacing: 0.1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  composerInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    color: colors.foreground,
    paddingVertical: 8,
    maxHeight: 120,
    letterSpacing: 0.05,
  },
  composerSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendOff: { backgroundColor: colors.surface },
});
