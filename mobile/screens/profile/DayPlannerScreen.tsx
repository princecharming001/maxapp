/**
 * DayPlannerScreen — the planner.
 *
 * Direct manipulation first: pick a day from a rolling week strip (today leftmost,
 * the next six after it — calendar-day rings mirroring the Weekly Progress screen),
 * then SEE that day as a vertical timeline and tap any block to adjust it. Wake /
 * get-ready / workout / wind-down open the visual range editor. Edits auto-save and
 * regenerate the live schedule.
 *
 * Commitments and the natural-language assistant are merged behind one floating
 * button: it opens a sheet that lists your commitments, lets you add one, and tucks
 * an "or just tell Max in words" chat row at the very bottom.
 *
 * Layout: a warm cream canvas with floating white cards — a serif display title,
 * the day strip, then the day on its own soft-shadow card — matching the "Craft"
 * surface family used across the rest of the app. One restrained green accent marks
 * the workout, today's ring, and the assistant; everything else is monochrome ink.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import { useFlag } from '../../constants/featureFlags';
import { experienceTier } from '../../lib/personalization';
import { colors, spacing, fonts } from '../../theme/dark';
import DayEditorSheet, { ShapeFocus } from '../../components/planner/DayEditorSheet';
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
  obligationColor,
  fmt12Compact,
  daysLabel,
  toMin,
} from '../../components/planner/plannerModel';

// JS Date.getDay() (0=Sun…6=Sat) → our Monday-indexed Weekday keys.
const JS_DAY_TO_KEY: Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

// A rolling 7-day window starting *today* — today is always leftmost, then the
// next six days in order. Each cell maps to a weekday scope so selecting it
// shapes that day.
function buildRollingWeek(): { key: Weekday; short: string; date: number; isToday: boolean }[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out: { key: Weekday; short: string; date: number; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const key = JS_DAY_TO_KEY[d.getDay()];
    const meta = WEEKDAYS.find((w) => w.key === key)!;
    out.push({ key, short: meta.short, date: d.getDate(), isToday: i === 0 });
  }
  return out;
}

// One restrained accent for the assistant surface only.
const ACCENT = '#2F6B4E';
const ACCENT_WASH = 'rgba(47,107,78,0.10)';

// Warm "Craft" palette — shared with Profile and the rest of the app so the
// planner reads as one surface family: a cream canvas with floating white cards
// rather than a flat pure-white sheet.
const BG = '#F1F1EF';   // cream canvas
const PILL = '#EAE9E6'; // warm inset for unselected day circles
const SOFT = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// Quick-tap prompts for the change sheet — chip label + the text it prefills.
type Suggestion = { chip: string; text: string };
const SUGGESTIONS: Suggestion[] = [
  { chip: 'Wake earlier', text: 'Wake between 6:30 and 7:30 on weekdays' },
  { chip: 'Sleep in weekends', text: 'Sleep in until 10 on weekends' },
  { chip: 'Set work hours', text: 'Work 9-5 on weekdays' },
  { chip: 'Add a workout', text: 'Add gym 6-7pm Mon, Wed, Fri' },
];
// Experience-tuned chip sets. Beginners get foundational structure prompts;
// advanced users get prompts that assume the basics are in place. Any other /
// unknown level falls back to SUGGESTIONS (today's four) — cold-start identical.
const SUGGESTIONS_BEGINNER: Suggestion[] = [
  { chip: 'Set a wake time', text: 'Wake between 6:30 and 7:30 on weekdays' },
  { chip: 'Set work hours', text: 'Work 9-5 on weekdays' },
  { chip: 'Wind down nightly', text: 'Wind down from 10pm and sleep by 11' },
  { chip: 'Block a daily slot', text: 'Reserve 30 minutes each evening for my routine' },
];
const SUGGESTIONS_ADVANCED: Suggestion[] = [
  { chip: 'Add a workout', text: 'Add gym 6-7pm Mon, Wed, Fri' },
  { chip: 'Add a second session', text: 'Add a mobility session 7-7:30am on weekdays' },
  { chip: 'Protect deep work', text: 'Block 9-11am on weekdays for focused work' },
  { chip: 'Sleep in weekends', text: 'Sleep in until 10 on weekends' },
];
function suggestionsForTier(tier: 'beginner' | 'intermediate' | 'advanced' | 'unknown'): Suggestion[] {
  if (tier === 'beginner') return SUGGESTIONS_BEGINNER;
  if (tier === 'advanced') return SUGGESTIONS_ADVANCED;
  return SUGGESTIONS;
}

// Frosted-glass top-bar button — a blurred translucent pane with a bright rim,
// a top sheen, and a soft shadow (the shadow rides the un-clipped outer wrapper
// so overflow:hidden on the clip doesn't mask it).
function GlassButton({
  onPress,
  children,
  pill,
  accessibilityLabel,
  hitSlop,
}: {
  onPress: () => void;
  children: React.ReactNode;
  pill?: boolean;
  accessibilityLabel?: string;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
}) {
  return (
    <View style={[styles.glassShadow, pill ? styles.glassShadowPill : styles.glassShadowCircle]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={hitSlop}
        style={[styles.glassClip, pill ? styles.glassClipPill : styles.glassClipCircle]}
      >
        <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.glassTint]} pointerEvents="none" />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.glassSheen}
        />
        {children}
      </TouchableOpacity>
    </View>
  );
}

export default function DayPlannerScreen({ embedded = false }: { embedded?: boolean }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const ob = (user?.onboarding || {}) as Record<string, any>;

  // Experience-tuned quick-tap chips. Off / unknown level → today's four.
  const personalizedUI = useFlag('personalizedUI');
  const suggestions = useMemo(
    () => (personalizedUI ? suggestionsForTier(experienceTier(ob.experience_level)) : SUGGESTIONS),
    [personalizedUI, ob.experience_level],
  );

  const [defaults, setDefaults] = useState<DayShape>(() => hydrateDayShape(ob));
  const [weekly, setWeekly] = useState<Partial<Record<Weekday, Partial<DayShape>>>>(
    () => hydrateWeekly(ob.weekly_timings),
  );
  const [obligations, setObligations] = useState<Obligation[]>(() => hydrateObligations(ob));

  // Rolling week strip — today leftmost. Drives which day the buckets shape.
  const week = useMemo(buildRollingWeek, []);
  const todayKey = week[0].key;

  // The day the timeline + editor act on. Defaults to today; selecting another
  // day edits just that day (a minimal override diffed against the base).
  const [scope, setScope] = useState<Scope>(todayKey);

  // Commitments + chat live behind the floating button now (merged surface).
  const [commitmentsOpen, setCommitmentsOpen] = useState(false);

  // Editor sheet: keep the scope set across the close animation to avoid a flash.
  const [editScope, setEditScope] = useState<Scope>('all');
  const [editFocus, setEditFocus] = useState<ShapeFocus | undefined>(undefined);
  const [sheetVisible, setSheetVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  // Assistant (demoted): hidden behind a floating button, opened only on demand.
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
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

  const scopeOverridden = scope !== 'all' && hasOverride(weekly, scope);
  const dayForScope = effectiveDay(defaults, weekly, scope);

  // Commitments shown in the sheet, chronological (by start time).
  const orderedObligations = obligations
    .map((o, idx) => ({ o, idx }))
    .sort((a, b) => toMin(a.o.start) - toMin(b.o.start) || a.idx - b.idx);

  return (
    <View style={styles.container}>
      {/* Top bar — Today pill (left) + manage / add (right), mirroring the ref. */}
      <View style={[styles.header, { paddingTop: insets.top + 22 }]}>
        {!embedded && navigation.canGoBack() ? (
          <GlassButton onPress={() => navigation.goBack()} accessibilityLabel="Back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </GlassButton>
        ) : (
          <GlassButton pill onPress={() => setScope(todayKey)} accessibilityLabel="Jump to today">
            <Text style={styles.todayPillText}>Today</Text>
          </GlassButton>
        )}
        <View style={styles.headerRight}>
          {saving ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 2 }} /> : null}
          {/* Chatbot — opens the "tell Max" assistant. */}
          <GlassButton onPress={() => setChatOpen(true)} accessibilityLabel="Ask Max">
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.foreground} />
          </GlassButton>
          {/* Commitments — opens the commitments sheet (list + add). */}
          <GlassButton onPress={() => setCommitmentsOpen(true)} accessibilityLabel="Commitments">
            <Ionicons name="add" size={22} color={colors.foreground} />
          </GlassButton>
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
          {/* Masthead — unchanged title. */}
          <View style={styles.masthead}>
            <Text style={styles.title}>
              Your <Text style={styles.titleItalic}>week</Text>
            </Text>
          </View>

          {/* Day strip — rolling week starting today (today leftmost). */}
          <View style={styles.weekStrip}>
            {week.map((d) => (
              <WeekDayPill
                key={d.key}
                short={d.short}
                date={d.date}
                selected={scope === d.key}
                isToday={d.isToday}
                edited={hasOverride(weekly, d.key)}
                onPress={() => setScope(d.key)}
              />
            ))}
          </View>

          {scopeOverridden ? (
            <TouchableOpacity
              onPress={() => resetScope(scope as Weekday)}
              style={styles.resetRow}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="refresh" size={13} color={ACCENT} />
              <Text style={styles.resetLink}>Reset this day to your default</Text>
            </TouchableOpacity>
          ) : null}

          {/* Breathing room between the weekday strip and where the day begins. */}
          <View style={styles.scheduleGap} />

          {/* The day as a calendar — hour gutter + events on the time axis. */}
          <ScheduleGrid
            day={dayForScope}
            obligations={obligations}
            scope={scope}
            isToday={scope === todayKey}
            onEditShape={(focus) => openEditor(scope, focus)}
            onEditObligation={(i) => obligationsRef.current?.openEdit(i)}
          />

          <View style={{ height: 96 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Commitments sheet — opened from the top "+" button. Lists current
          commitments and an add action. */}
      <Modal
        visible={commitmentsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCommitmentsOpen(false)}
      >
        <View style={styles.chatRoot}>
          <Pressable style={styles.chatBackdrop} onPress={() => setCommitmentsOpen(false)} />
          <View style={[styles.commitSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.grabber} />
            <Text style={styles.chatHeadline}>Commitments</Text>
            <Text style={styles.commitSub}>
              Work, classes, a commute — anything that recurs. Max plans your routines around them.
            </Text>

            <ScrollView
              style={styles.commitScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {orderedObligations.length === 0 ? (
                <Text style={styles.commitEmpty}>
                  No commitments yet. Add work, a class or a commute so Max keeps your routines clear
                  of them.
                </Text>
              ) : (
                orderedObligations.map(({ o, idx }) => {
                  const accent = obligationColor(o.label);
                  return (
                    <TouchableOpacity
                      key={`${o.label}-${idx}`}
                      style={styles.commitRow}
                      activeOpacity={0.6}
                      onPress={() => {
                        // Close the sheet first so the editor modal isn't
                        // presented behind it.
                        setCommitmentsOpen(false);
                        setTimeout(() => obligationsRef.current?.openEdit(idx), 280);
                      }}
                    >
                      <View style={[styles.commitBar, { backgroundColor: accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.commitLabel} numberOfLines={1}>
                          {o.label}
                        </Text>
                        <View style={styles.commitMeta}>
                          <Text style={styles.commitTime}>
                            {fmt12Compact(o.start)} - {fmt12Compact(o.end)}
                          </Text>
                          <View style={styles.commitDaysChip}>
                            <Text style={[styles.commitDaysText, { color: accent }]}>
                              {daysLabel(o.days)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.commitAddBtn}
              activeOpacity={0.9}
              onPress={() => {
                // Close this sheet FIRST, then open the editor — two stacked
                // modals present the editor behind this one (looks broken).
                setCommitmentsOpen(false);
                setTimeout(() => obligationsRef.current?.openAdd(), 280);
              }}
            >
              <Text style={styles.commitAddText}>Add a commitment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Always-mounted, headless commitments editor — driven by ref from the day
          timeline and the commitments sheet so its add/edit flow works whether or
          not the sheet is open. */}
      <ObligationsManager
        ref={obligationsRef}
        headless
        obligations={obligations}
        onChange={changeObligations}
      />

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
                  <View style={[styles.chatReplyDot, chatReplyTone === 'warn' && styles.chatReplyDotWarn]} />
                  <Text style={styles.chatReplyText}>{chatReply}</Text>
                </View>
              ) : (
                <View style={styles.suggRow}>
                  {suggestions.map((s) => (
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
                    <Text style={[styles.composerSendText, sendDisabled && styles.composerSendTextOff]}>
                      Send
                    </Text>
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

// One day in the rolling week strip — a calendar-day ring mirroring the Weekly
// Progress design: weekday label above a circle holding the date. Selected fills
// with ink; today (when not selected) is ringed in the accent; a corner dot marks
// a day whose shape differs from the baseline.
function WeekDayPill({
  short,
  date,
  selected,
  isToday,
  edited,
  onPress,
}: {
  short: string;
  date: number;
  selected: boolean;
  isToday: boolean;
  edited?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.dayCell}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${short} ${date}${isToday ? ', today' : ''}${edited ? ', customized' : ''}`}
    >
      <Text style={[styles.dayCellLabel, selected && styles.dayCellLabelSel]} numberOfLines={1}>
        {short}
      </Text>
      <View
        style={[
          styles.dayRing,
          !selected && isToday && styles.dayRingToday,
          selected && styles.dayRingSel,
        ]}
      >
        <Text style={[styles.dayRingNum, selected && styles.dayRingNumSel]}>{date}</Text>
        {edited && !selected ? <View style={styles.dayEditedDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Warm cream canvas, matching every other page.
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: BG,
  },
  // Top-bar controls — frosted-glass buttons. Shadow on the outer wrapper; the
  // blur/tint/rim live on the clipped inner so overflow:hidden keeps clean corners.
  glassShadow: {
    shadowColor: '#3A352B',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  glassShadowCircle: { width: 40, height: 40, borderRadius: 20 },
  glassShadowPill: { borderRadius: 999 },
  glassClip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  glassClipCircle: { width: 40, height: 40, borderRadius: 20 },
  glassClipPill: { flexDirection: 'row', height: 40, paddingHorizontal: 18, borderRadius: 999 },
  glassTint: { backgroundColor: 'rgba(255,255,255,0.32)' },
  glassSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  todayPillText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.foreground, letterSpacing: -0.1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  // Masthead — serif display title (unchanged from the prior version).
  masthead: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: {
    fontFamily: fonts.serif,
    fontSize: 34,
    color: colors.foreground,
    letterSpacing: -0.8,
  },
  titleItalic: { fontFamily: fonts.serifItalic, fontStyle: 'italic' },

  // Rolling-week day strip — seven calendar-day rings across the width.
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 2,
  },
  dayCell: { flex: 1, alignItems: 'center' },
  dayCellLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  dayCellLabelSel: { color: colors.foreground, fontFamily: fonts.sansSemiBold },
  dayRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(17,17,19,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayRingToday: { borderColor: ACCENT },
  dayRingSel: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  dayRingNum: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.foreground },
  dayRingNumSel: { color: '#fff' },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10, marginBottom: 2 },
  // Pushes the day's timeline down so it doesn't crowd the weekday strip.
  scheduleGap: { height: 18 },
  // Corner marker for a day whose shape differs from the baseline.
  dayEditedDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    borderWidth: 1.5,
    borderColor: BG,
  },

  // Content sections are now floating white cards on the cream canvas, matching
  // the card treatment used across the rest of the app.
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    marginTop: spacing.md,
    ...SOFT,
  },
  scopeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scopeTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: colors.foreground, letterSpacing: -0.2 },
  scopeHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resetLink: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: ACCENT, letterSpacing: 0.05 },
  viewTabs: { flexDirection: 'row', gap: 18 },
  viewTab: { paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  viewTabActive: { borderBottomColor: colors.foreground },
  viewTabText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted, letterSpacing: 0.2 },
  viewTabTextActive: { color: colors.foreground, fontFamily: fonts.sansSemiBold },

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
  chatReplyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    marginTop: 6,
  },
  chatReplyWarn: { backgroundColor: 'rgba(180,120,20,0.10)' },
  chatReplyDotWarn: { backgroundColor: '#B47814' },
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
    borderRadius: 24,
    shadowColor: '#3A352B',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  // The frosted glass capsule: blur fills it, a hairline gives it an edge, and a
  // single typographic label names it — no icon.
  fab: {
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  fabLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.foreground,
    letterSpacing: 0.2,
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
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSendOff: { backgroundColor: colors.surface },
  composerSendText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.background, letterSpacing: 0.3 },
  composerSendTextOff: { color: colors.textMuted },

  // Commitments sheet — the merged surface opened from the floating button.
  commitSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    maxHeight: '85%',
  },
  commitSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 6,
    letterSpacing: 0.05,
  },
  commitScroll: { flexShrink: 1, marginTop: 12 },
  commitEmpty: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    paddingVertical: 18,
    letterSpacing: 0.05,
  },
  commitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  commitBar: { width: 4, height: 34, borderRadius: 2, marginRight: 12 },
  commitLabel: { fontSize: 15, color: colors.foreground, fontFamily: fonts.sansSemiBold, letterSpacing: 0.05 },
  commitMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  commitTime: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.textSecondary, letterSpacing: 0.1 },
  commitDaysChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surface },
  commitDaysText: { fontSize: 11, fontFamily: fonts.sansSemiBold, letterSpacing: 0.2 },
  commitAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.foreground,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 16,
  },
  commitAddText: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.background, letterSpacing: 0.1 },
  commitChatRow: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  commitChatText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
    color: colors.textSecondary,
    letterSpacing: 0.05,
    textDecorationLine: 'underline',
    textDecorationColor: colors.border,
  },
});
