/**
 * DayPlannerScreen — the week planner.
 *
 * The whole week is visible at once as a Google-Calendar-style canvas (no
 * tab-switching between days). Tap any day to open a visual editor: drag
 * sliders to set wake/sleep as a RANGE or an EXACT time, set workouts, work
 * hours and obligations. Edits auto-save and regenerate the live schedule.
 *
 * A natural-language assistant lets you reshape the week by describing the
 * change ("sleep in on weekends", "gym 6-7pm Mon Wed Fri"); the backend
 * translates it into the same structured plan and re-hydrates the canvas.
 *
 * Layout note: this is a flat, single-surface page (white throughout) with the
 * masthead and content separated by hairline rules — no stacked rounded cards,
 * no drop shadows. One restrained accent (a deep green) marks the assistant and
 * its replies; everything else is monochrome ink so the canvas reads as the
 * subject, not the chrome.
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
import ObligationsManager from '../../components/planner/ObligationsManager';
import {
  DayShape,
  Obligation,
  Scope,
  Weekday,
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
  'Add gym 6–7pm Mon, Wed, Fri',
  'Work 9–5 on weekdays',
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

  // Editor sheet: keep the scope set across the close animation to avoid a flash.
  const [editScope, setEditScope] = useState<Scope>('all');
  const [sheetVisible, setSheetVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  // Assistant state.
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);
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
  const commitScope = (scope: Scope, day: DayShape) => {
    if (scope === 'all') {
      setDefaults(day);
      persist(day, weekly, obligations);
      return;
    }
    const partial = diffDayShape(defaults, day);
    const nextWeekly: Partial<Record<Weekday, Partial<DayShape>>> = { ...weekly };
    if (Object.keys(partial).length) nextWeekly[scope] = partial;
    else delete nextWeekly[scope];
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
    try {
      // Flush the current canvas first so the assistant reasons over — and never
      // discards — exactly what's on screen, then re-hydrate from its result.
      await api.saveOnboarding(buildOnboarding(defaults, weekly, obligations) as any);
      const res = await api.plannerChat(text);
      applyServerState(res.defaults, res.weekly_timings);
      setChatReply(res.summary || res.message || 'Updated your plan.');
      setChatInput('');
      await refreshUser();
      invalidateSchedules();
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Couldn\'t update your plan. Try rephrasing.';
      setChatReply(msg);
    } finally {
      setChatLoading(false);
    }
  };

  const openEditor = (scope: Scope) => {
    setEditScope(scope);
    setSheetVisible(true);
  };

  const sendDisabled = !chatInput.trim() || chatLoading;

  return (
    <View style={styles.container}>
      {/* Minimal top nav: navigation + transient saving status only. The page
          title lives in the masthead below, where it can carry real weight. */}
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
              Your real week: sleep, work, and plans. Tap any day to shape it, and Max fits your
              routines into the open time.
            </Text>
          </View>

          {/* Week canvas */}
          <View style={styles.section}>
            <WeekCanvas
              defaults={defaults}
              weekly={weekly}
              obligations={obligations}
              onEditScope={openEditor}
            />
          </View>

          {/* Commitments — the global, day-scoped obligations list. */}
          <View style={styles.section}>
            <ObligationsManager obligations={obligations} onChange={changeObligations} />
          </View>

          {/* Assistant — the one accented surface on the page. */}
          <View style={styles.section}>
            <View style={styles.chatHead}>
              <View style={styles.chatMark}>
                <Ionicons name="sparkles" size={15} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatTitle}>Ask Max to rearrange</Text>
                <Text style={styles.chatSub}>
                  Describe a change in plain words. Max updates the right days for you.
                </Text>
              </View>
            </View>

            {chatReply ? (
              <View style={styles.chatReply}>
                <View style={styles.chatReplyIcon}>
                  <Ionicons name="checkmark" size={13} color="#fff" />
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

  // Masthead — the page's hero. Kicker + heavy headline + standfirst.
  masthead: { paddingTop: spacing.xs, paddingBottom: spacing.lg },
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

  // Content sections, separated by hairline rules instead of card edges.
  section: {
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // Assistant.
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: spacing.md },
  chatMark: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  chatTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15.5,
    color: colors.foreground,
    letterSpacing: 0.1,
  },
  chatSub: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 2,
    letterSpacing: 0.05,
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
