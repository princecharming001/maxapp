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
import React, { useRef, useState } from 'react';
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
import { colors, spacing, fonts } from '../../theme/dark';
import WeekCanvas from '../../components/planner/WeekCanvas';
import DayEditorSheet from '../../components/planner/DayEditorSheet';
import DayTimeline from '../../components/planner/DayTimeline';
import ObligationsManager from '../../components/planner/ObligationsManager';
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

  // Editor sheet: keep the scope set across the close animation to avoid a flash.
  const [editScope, setEditScope] = useState<Scope>('all');
  const [sheetVisible, setSheetVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  // Assistant (demoted): collapsed until asked for.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);
  // Reply tone drives ONLY the bubble styling: 'success' shows the green check,
  // 'warn' is used for failures and no-op replies so they never look applied.
  const [chatReplyTone, setChatReplyTone] = useState<'success' | 'warn'>('success');
  const chatRef = useRef<TextInput>(null);

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

  const openEditor = (s: Scope) => {
    setEditScope(s);
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
            <Text style={styles.kicker}>PLANNER</Text>
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
              {scopeOverridden ? (
                <TouchableOpacity
                  onPress={() => resetScope(scope as Weekday)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.resetLink}>Reset to every day</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.scopeHint}>Tap a block to adjust</Text>
              )}
            </View>

            <DayTimeline
              day={dayForScope}
              obligations={obligations}
              scope={scope}
              onEditShape={() => openEditor(scope)}
            />
          </View>

          {/* Commitments — the global, day-scoped obligations list. */}
          <View style={styles.section}>
            <ObligationsManager obligations={obligations} onChange={changeObligations} />
          </View>

          {/* Week at a glance — secondary overview. Tapping a day jumps the scope
              there and opens the editor. */}
          <View style={styles.section}>
            <Text style={styles.sectionKicker}>WEEK AT A GLANCE</Text>
            <Text style={styles.sectionNote}>Tap any day to shape it.</Text>
            <WeekCanvas
              defaults={defaults}
              weekly={weekly}
              obligations={obligations}
              onEditScope={(s) => {
                setScope(s);
                openEditor(s);
              }}
            />
          </View>

          {/* Assistant — demoted. Open it to reshape the week in plain words. */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.assistToggle}
              activeOpacity={0.7}
              onPress={() => setAssistantOpen((o) => !o)}
            >
              <View style={styles.chatMark}>
                <Ionicons name="sparkles" size={14} color="#fff" />
              </View>
              <Text style={styles.assistToggleText}>Or just tell Max in words</Text>
              <Ionicons
                name={assistantOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            {assistantOpen ? (
              <View style={{ marginTop: spacing.md }}>
                {chatReply ? (
                  <View style={[styles.chatReply, chatReplyTone === 'warn' && styles.chatReplyWarn]}>
                    <View
                      style={[styles.chatReplyIcon, chatReplyTone === 'warn' && styles.chatReplyIconWarn]}
                    >
                      <Ionicons
                        name={chatReplyTone === 'warn' ? 'alert' : 'checkmark'}
                        size={13}
                        color="#fff"
                      />
                    </View>
                    <Text style={styles.chatReplyText}>{chatReply}</Text>
                  </View>
                ) : (
                  <View style={styles.suggestWrap}>
                    <Text style={styles.suggestLabel}>TRY ASKING</Text>
                    <View style={styles.chipsWrap}>
                      {CHAT_EXAMPLES.map((ex) => (
                        <TouchableOpacity
                          key={ex}
                          style={styles.exChip}
                          activeOpacity={0.7}
                          onPress={() => {
                            setChatInput(ex);
                            chatRef.current?.focus();
                          }}
                        >
                          <Ionicons name="sparkles-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.exChipText}>{ex}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.chatInputRow}>
                  <TextInput
                    ref={chatRef}
                    style={styles.chatInput}
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="e.g. wake between 6 and 7 on weekdays"
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
                    style={styles.chatSendWrap}
                  >
                    <View style={[styles.chatSend, sendDisabled ? styles.chatSendOff : styles.chatSendOn]}>
                      {chatLoading ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : (
                        <Ionicons
                          name="arrow-up"
                          size={18}
                          color={sendDisabled ? colors.textMuted : '#fff'}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ height: 120 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DayEditorSheet
        visible={sheetVisible}
        scope={editScope}
        initial={effectiveDay(defaults, weekly, editScope)}
        overridden={editScope !== 'all' && hasOverride(weekly, editScope)}
        onClose={() => setSheetVisible(false)}
        onCommit={commitScope}
        onReset={resetScope}
      />
    </View>
  );
}

function ScopePill({
  label,
  active,
  edited,
  onPress,
}: {
  label: string;
  active: boolean;
  edited?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.scopePill, active && styles.scopePillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}${edited ? ', customized' : ''}`}
    >
      <Text style={[styles.scopePillText, active && styles.scopePillTextActive]}>{label}</Text>
      {edited && !active ? <View style={styles.editedDot} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Single white surface, top to bottom — no page/card contrast.
  container: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
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
  scopeScroll: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: 4 },
  scopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 38,
  },
  scopePillActive: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  scopePillText: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.textSecondary, letterSpacing: 0.1 },
  scopePillTextActive: { color: '#fff' },
  editedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ACCENT },

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
  scopeHint: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, letterSpacing: 0.05 },
  resetLink: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: ACCENT, letterSpacing: 0.05 },

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

  // Assistant (demoted).
  assistToggle: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  assistToggleText: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
    color: colors.foreground,
    letterSpacing: 0.05,
  },
  chatMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  suggestWrap: { marginBottom: spacing.md },
  suggestLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  exChipText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary, letterSpacing: 0.05 },
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
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 13,
    paddingBottom: 13,
    paddingHorizontal: 15,
    color: colors.foreground,
    fontFamily: fonts.sans,
    fontSize: 15,
    letterSpacing: 0.05,
  },
  chatSendWrap: { width: 46, height: 46 },
  chatSend: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendOn: { backgroundColor: ACCENT },
  chatSendOff: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
