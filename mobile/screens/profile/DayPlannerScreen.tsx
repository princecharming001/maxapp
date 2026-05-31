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
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';
import WeekCanvas from '../../components/planner/WeekCanvas';
import DayEditorSheet from '../../components/planner/DayEditorSheet';
import {
  DayShape,
  Scope,
  Weekday,
  hydrateDayShape,
  hydrateWeekly,
  dayShapeToServer,
  serializeWeekly,
  diffDayShape,
  effectiveDay,
  hasOverride,
} from '../../components/planner/plannerModel';

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
      weekly_timings: Object.keys(weeklyOut).length ? weeklyOut : null,
    };
  };

  const persist = async (
    nd: DayShape,
    nw: Partial<Record<Weekday, Partial<DayShape>>>,
  ) => {
    setSaving(true);
    try {
      await api.saveOnboarding(buildOnboarding(nd, nw) as any);
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
      persist(day, weekly);
      return;
    }
    const partial = diffDayShape(defaults, day);
    const nextWeekly: Partial<Record<Weekday, Partial<DayShape>>> = { ...weekly };
    if (Object.keys(partial).length) nextWeekly[scope] = partial;
    else delete nextWeekly[scope];
    setWeekly(nextWeekly);
    persist(defaults, nextWeekly);
  };

  const resetScope = (day: Weekday) => {
    const nextWeekly = { ...weekly };
    delete nextWeekly[day];
    setWeekly(nextWeekly);
    persist(defaults, nextWeekly);
  };

  const applyServerState = (
    d?: Record<string, any> | null,
    wk?: Record<string, any> | null,
  ) => {
    setDefaults(hydrateDayShape(d || {}));
    setWeekly(hydrateWeekly(wk || {}));
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatLoading(true);
    setChatReply(null);
    try {
      // Flush the current canvas first so the assistant reasons over — and never
      // discards — exactly what's on screen, then re-hydrate from its result.
      await api.saveOnboarding(buildOnboarding(defaults, weekly) as any);
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
          : error?.message || 'Could not update your plan — try rephrasing.';
      setChatReply(msg);
    } finally {
      setChatLoading(false);
    }
  };

  const openEditor = (scope: Scope) => {
    setEditScope(scope);
    setSheetVisible(true);
  };

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
          <Text style={styles.subhead}>
            Your whole week at a glance. Tap any day to shape its rhythm.
          </Text>

          <View style={styles.card}>
            <WeekCanvas defaults={defaults} weekly={weekly} onEditScope={openEditor} />
          </View>

          {/* Assistant. */}
          <View style={[styles.card, styles.chatCard]}>
            <View style={styles.chatHead}>
              <View style={styles.chatIconWrap}>
                <Ionicons name="sparkles" size={15} color={colors.background} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatTitle}>Ask Max to rearrange</Text>
                <Text style={styles.chatSub}>
                  Describe a change in plain words and Max updates the right days.
                </Text>
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
                placeholder="e.g. wake between 6 and 7 on weekdays"
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
  savingSlot: { width: 40, alignItems: 'flex-end', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  subhead: {
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 19,
    letterSpacing: 0.05,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0a0a0b',
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        }
      : { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }),
  },
  // Assistant card.
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
  chatTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.foreground,
    letterSpacing: 0.1,
  },
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
});
