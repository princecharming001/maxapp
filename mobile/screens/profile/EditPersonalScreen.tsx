import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import OnairosConnectModal from '../../components/OnairosConnectModal';
import { colors, spacing, borderRadius, typography, fonts } from '../../theme/dark';
import { maxHomeMaxxesForUser } from '../../utils/maxxLimits';
import { getMaxxDisplayDescription, getMaxxDisplayLabel } from '../../utils/maxxDisplay';
import { resolveMaxxBrand } from '../../utils/maxxBrand';
import { useMaxxesQuery } from '../../hooks/useAppQueries';
import { MaxxProgramRow } from '../../components/MaxxProgramRow';
import {
  PRIORITY_LABELS,
  type PriorityKey,
  APPEARANCE_OPTIONS,
  SKIN_CONCERNS,
  SCREEN_TIME_BANDS,
  TIME_OPTIONS,
  mapSkinConcernToType,
  mapTrainingToExperience,
  mapEquipmentToList,
  formatTime12h,
  hhmm,
  heavyScreenFromBand,
  inferScreenBand,
  normalizePriorityOrder,
  inferFitEquipmentFromOnboarding,
} from '../../constants/profileLifestyleQuestionnaire';

const GOALS = [
  { id: 'bonemax', label: 'Bonemax', icon: 'body-outline' },
  { id: 'heightmax', label: 'Heightmax', icon: 'resize-outline' },
  { id: 'skinmax', label: 'Skinmax', icon: 'sparkles-outline' },
  { id: 'hairmax', label: 'Hairmax', icon: 'cut-outline' },
  { id: 'fitmax', label: 'Fitmax', icon: 'fitness-outline' },
];

const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Little to no exercise' },
  { id: 'light', label: 'Light', desc: '1-3 days/week' },
  { id: 'moderate', label: 'Moderate', desc: '3-5 days/week' },
  { id: 'active', label: 'Active', desc: '6-7 days/week' },
];

function hydrateFromOnboarding(ob: Record<string, any>) {
  // Mirrors the live onboarding flow — only the 5 questions we ask there
  // (gender + age + body + schedule + priority). Older fields like
  // appearance_concerns / skin / hair / training / screen-time are kept
  // in user.onboarding as-is on save (via {...base} spread) so notification
  // engines and schedule generators that still depend on them keep working,
  // but we no longer surface those edits in the UI.
  return {
    priorityRanking: Array.isArray(ob.priority_ranking)
      ? [...ob.priority_ranking]
      : normalizePriorityOrder(ob.priority_order),
    wakeTime: ob.wake_time || '07:00',
    sleepTime: ob.sleep_time || '23:00',
    workSchedule: (ob.work_schedule as 'fixed' | 'flexible' | undefined) || null,
    workStart: ob.work_start || '09:00',
    workEnd: ob.work_end || '17:00',
  };
}

export default function EditPersonalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const { user, refreshUser } = useAuth();
  const maxxesQuery = useMaxxesQuery();
  const [loading, setLoading] = useState(false);
  // Onairos modal — opens from the "external personalization" card.
  // Connecting refreshes user data; coaching_service picks up the new
  // traits on the next chat turn (no client-side cache to bust).
  const [onairosVisible, setOnairosVisible] = useState(false);

  const onlyGoals = route.params?.onlyGoals === true;

  const maxesById = useMemo(() => {
    const m = new Map<string, { id?: string; label?: string; color?: string; icon?: string; description?: string }>();
    for (const x of maxxesQuery.data?.maxes ?? []) {
      const id = String(x.id || '').toLowerCase();
      if (id) m.set(id, x);
    }
    return m;
  }, [maxxesQuery.data?.maxes]);

  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>((user?.onboarding?.unit_system as any) || 'imperial');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(user?.onboarding?.goals || []);
  const [gender, setGender] = useState(user?.onboarding?.gender || '');
  const [age, setAge] = useState(user?.onboarding?.age?.toString() || '');

  const getInitialValues = () => {
    let h = '', hFt = '', hIn = '', w = '';
    const ob = user?.onboarding;
    if (ob) {
      if (unitSystem === 'imperial') {
        w = ob.weight ? Number(ob.weight).toFixed(1) : '';
        if (ob.height) {
          const totalInches = Number(ob.height);
          hFt = Math.floor(totalInches / 12).toString();
          hIn = Math.round(totalInches % 12).toString();
        }
      } else {
        h = ob.height?.toString() || '';
        w = ob.weight?.toString() || '';
      }
    }
    return { h, hFt, hIn, w };
  };

  const initial = getInitialValues();
  const [height, setHeight] = useState(initial.h);
  const [heightFt, setHeightFt] = useState(initial.hFt);
  const [heightIn, setHeightIn] = useState(initial.hIn);
  const [weight, setWeight] = useState(initial.w);

  const [activityLevel, setActivityLevel] = useState(user?.onboarding?.activity_level || 'moderate');

  const v2 = hydrateFromOnboarding((user?.onboarding || {}) as Record<string, any>);
  const [priorityRanking, setPriorityRanking] = useState<string[]>(v2.priorityRanking);
  const [wakeTime, setWakeTime] = useState(v2.wakeTime);
  const [sleepTime, setSleepTime] = useState(v2.sleepTime);
  const [workSchedule, setWorkSchedule] = useState<'fixed' | 'flexible' | null>(v2.workSchedule);
  const [workStart, setWorkStart] = useState(v2.workStart);
  const [workEnd, setWorkEnd] = useState(v2.workEnd);
  const [openTimePicker, setOpenTimePicker] = useState<'wake' | 'sleep' | 'workStart' | 'workEnd' | null>(null);

  const movePriority = useCallback((index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= priorityRanking.length) return;
    const next = [...priorityRanking];
    [next[index], next[j]] = [next[j], next[index]];
    setPriorityRanking(next);
  }, [priorityRanking]);

  useEffect(() => {
    if (!user?.onboarding) return;
    const ob = user.onboarding;
    setUnitSystem((ob.unit_system as any) || 'imperial');
    const maxG = maxHomeMaxxesForUser(user);
    const g = (ob.goals || []) as string[];
    setSelectedGoals(g.slice(0, maxG));
    setGender(ob.gender || '');
    setAge(ob.age?.toString() || '');
    setActivityLevel(ob.activity_level || 'moderate');

    const u = (ob.unit_system as any) || 'imperial';
    if (u === 'imperial') {
      if (ob.weight) setWeight(Number(ob.weight).toFixed(1));
      if (ob.height) {
        const totalInches = Number(ob.height);
        setHeightFt(Math.floor(totalInches / 12).toString());
        setHeightIn(Math.round(totalInches % 12).toString());
        setHeight('');
      }
    } else {
      setHeight(ob.height?.toString() || '');
      setWeight(ob.weight?.toString() || '');
      setHeightFt('');
      setHeightIn('');
    }

    const h = hydrateFromOnboarding(ob as Record<string, any>);
    setPriorityRanking(h.priorityRanking);
    setWakeTime(h.wakeTime);
    setSleepTime(h.sleepTime);
    setWorkSchedule(h.workSchedule);
    setWorkStart(h.workStart);
    setWorkEnd(h.workEnd);
  }, [user]);

  const handleSave = async () => {
    setLoading(true);

    let finalHeight: number | undefined;
    let finalWeight: number | undefined;
    if (unitSystem === 'imperial') {
      const ft = parseInt(heightFt, 10) || 0;
      const inch = parseInt(heightIn, 10) || 0;
      if (ft > 0 || inch > 0) finalHeight = ft * 12 + inch;
      if (weight && parseFloat(weight) > 0) finalWeight = parseFloat(weight);
    } else {
      if (height && parseFloat(height) > 0) finalHeight = parseFloat(height);
      if (weight && parseFloat(weight) > 0) finalWeight = parseFloat(weight);
    }

    const base = { ...(user?.onboarding || {}) } as Record<string, any>;
    const tz =
      base.timezone ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');

    if (onlyGoals) {
      const maxG = maxHomeMaxxesForUser(user);
      const onboardingData = {
        ...base,
        goals: (selectedGoals || []).slice(0, maxG),
        timezone: tz,
        completed: true,
      };
      try {
        await api.saveOnboarding(onboardingData as any);
        await refreshUser();
        Alert.alert('Success', 'Your Maxxes were updated.');
        navigation.goBack();
      } catch (error: any) {
        Alert.alert('Error', error?.response?.data?.detail || 'Could not save changes.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Spread `base` so any older onboarding keys (skin/hair/training/etc.)
    // saved by previous app versions persist for downstream services that
    // still reference them. We only OVERWRITE the keys this screen now
    // controls — gender/age/body + the schedule anchors the chatbot uses.
    const onboardingData: Record<string, any> = {
      ...base,
      completed: true,
      timezone: tz,
      unit_system: unitSystem,
      priority_ranking: [...priorityRanking],
      wake_time: hhmm(wakeTime),
      sleep_time: hhmm(sleepTime),
      work_schedule: workSchedule || null,
      work_start: workSchedule === 'fixed' ? hhmm(workStart) : null,
      work_end: workSchedule === 'fixed' ? hhmm(workEnd) : null,
    };

    if (gender) onboardingData.gender = gender;
    if (age && !Number.isNaN(parseInt(age, 10)) && parseInt(age, 10) > 0) onboardingData.age = parseInt(age, 10);
    if (finalHeight !== undefined && finalHeight > 0) onboardingData.height = Math.round(finalHeight * 10) / 10;
    if (finalWeight !== undefined && finalWeight > 0) onboardingData.weight = Math.round(finalWeight * 10) / 10;

    try {
      await api.saveOnboarding(onboardingData as any);
      await refreshUser();
      // Lifestyle edits feed the chatbot's USER CONTEXT (wake/sleep/work
      // hours, priority) and may change downstream schedule state. Force
      // refetch so every screen sees the new data on next mount.
      queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSchedulesSummary, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: queryKeys.maxes, refetchType: 'all' });
      Alert.alert('Success', 'Profile updated successfully.');
      navigation.goBack();
    } catch (error: any) {
      const msg =
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : error?.message || 'Could not save changes.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const timeRow = (
    label: string,
    which: 'wake' | 'sleep' | 'workStart' | 'workEnd',
    value: string,
    setter: (s: string) => void,
  ) => (
    <View style={styles.timeBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.timeTrigger}
        activeOpacity={0.85}
        onPress={() => setOpenTimePicker((p) => (p === which ? null : which))}
      >
        <Text style={styles.timeTriggerText}>{formatTime12h(value)}</Text>
        <Ionicons name={openTimePicker === which ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {openTimePicker === which ? (
        <View style={styles.timeDropdown}>
          <ScrollView nestedScrollEnabled style={styles.timeDropdownScroll} keyboardShouldPersistTaps="handled">
            {TIME_OPTIONS.map((t) => {
              const active = t === value;
              return (
                <TouchableOpacity
                  key={`${which}-${t}`}
                  style={[styles.timeOption, active && styles.timeOptionOn]}
                  onPress={() => {
                    setter(t);
                    setOpenTimePicker(null);
                  }}
                >
                  <Text style={[styles.timeOptionText, active && styles.timeOptionTextOn]}>{formatTime12h(t)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  const sectionKicker = (t: string) => <Text style={styles.kicker}>{t}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{onlyGoals ? 'Your Maxxes' : 'Edit lifestyle'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          scrollEnabled
          contentContainerStyle={[
            styles.content,
            isWide && styles.contentWide,
            onlyGoals && styles.onlyGoalsContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!onlyGoals ? (
            <Text style={styles.lead}>Update what you shared at signup — chatbot context updates as you save.</Text>
          ) : null}

          {/* "Your Maxxes" header is intentionally hidden on the edit-lifestyle
              path — that picker lives on the Profile → "Your Maxxes" screen
              (onlyGoals=true), so showing it here was duplicate UX. */}
          {onlyGoals && (
            <Text style={styles.goalsLimitHint}>
              Up to {maxHomeMaxxesForUser(user)} on your home screen
              {user?.is_paid && (user?.subscription_tier || '').toLowerCase() === 'premium'
                ? ' (Premium)'
                : user?.is_paid
                  ? ' (Basic)'
                  : ' (free)'}
            </Text>
          )}
          {onlyGoals && (
            <View
              style={[
                styles.goalsListBleed,
                isWide ? { marginHorizontal: -spacing.xxl } : { marginHorizontal: -spacing.xl },
              ]}
            >
            {GOALS.map((goal, idx) => {
              const selected = selectedGoals.includes(goal.id);
              const maxG = maxHomeMaxxesForUser(user);
              const apiMax = maxesById.get(goal.id);
              const merged = { id: goal.id, label: goal.label, ...apiMax };
              const brand = resolveMaxxBrand(goal.id, apiMax?.color);
              const label = getMaxxDisplayLabel(merged);
              const desc = getMaxxDisplayDescription(merged) ?? apiMax?.description;

              const onPress = () =>
                setSelectedGoals((prev) => {
                  if (prev.includes(goal.id)) return prev.filter((g) => g !== goal.id);
                  if (prev.length >= maxG) {
                    Alert.alert(
                      'Limit reached',
                      `Your plan allows up to ${maxG} Maxxes on Home. Remove one to add another.`,
                    );
                    return prev;
                  }
                  return [...prev, goal.id];
                });

              // "Your Maxxes" — same editorial row pattern as ModuleSelect:
              // unselected = no chrome; selected = subtle accent-tinted card
              // with a filled accent number badge.
              if (onlyGoals) {
                const num = String(idx + 1).padStart(2, '0');
                const onTint = `${brand}1A`; // ~10%
                const onBorder = `${brand}4D`; // ~30%
                return (
                  <TouchableOpacity
                    key={goal.id}
                    onPress={onPress}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    style={[
                      ygStyles.row,
                      selected && { backgroundColor: onTint, borderColor: onBorder },
                    ]}
                  >
                    <View
                      style={[
                        ygStyles.numBadge,
                        selected
                          ? { backgroundColor: brand, borderColor: brand }
                          : { borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          ygStyles.numText,
                          { color: selected ? colors.buttonText : brand },
                        ]}
                      >
                        {num}
                      </Text>
                    </View>
                    <View style={ygStyles.copy}>
                      <Text style={ygStyles.title}>{label}</Text>
                      {!!desc && (
                        <Text style={ygStyles.desc} numberOfLines={2}>
                          {desc}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }

              // Default ("edit lifestyle") — keep the existing MaxxProgramRow.
              return (
                <MaxxProgramRow
                  key={goal.id}
                  tintHex={brand}
                  iconName={(apiMax?.icon || goal.icon) as string}
                  title={label}
                  description={desc}
                  accent="stripe"
                  selected={selected}
                  selectedVariant="brand"
                  brandColor={brand}
                  style={{ marginBottom: spacing.sm }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={onPress}
                  trailing={
                    <View
                      style={[
                        styles.goalRowCheck,
                        selected && { borderColor: brand, backgroundColor: brand },
                      ]}
                    >
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colors.foreground : colors.textMuted}
                      />
                    </View>
                  }
                />
              );
            })}
            </View>
          )}

          {!onlyGoals && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Body</Text>
                <View style={styles.unitToggle}>
                  <TouchableOpacity onPress={() => setUnitSystem('metric')} style={[styles.unitBtn, unitSystem === 'metric' && styles.unitBtnActive]}>
                    <Text style={[styles.unitLabel, unitSystem === 'metric' && styles.unitLabelActive]}>Metric</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setUnitSystem('imperial')} style={[styles.unitBtn, unitSystem === 'imperial' && styles.unitBtnActive]}>
                    <Text style={[styles.unitLabel, unitSystem === 'imperial' && styles.unitLabelActive]}>US</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.inputLabel}>GENDER</Text>
              <View style={styles.chipRow}>
                {['Male', 'Female', 'Other'].map((g) => (
                  <TouchableOpacity key={g} style={[styles.chip, gender === g && styles.chipSelected]} onPress={() => setGender(g)}>
                    <Text style={[styles.chipText, gender === g && styles.chipTextSelected]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>AGE</Text>
                  <TextInput style={styles.field} keyboardType="numeric" value={age} onChangeText={setAge} placeholder="Years" placeholderTextColor={colors.textMuted} />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>WEIGHT ({unitSystem === 'metric' ? 'KG' : 'LBS'})</Text>
                  <TextInput
                    style={styles.field}
                    keyboardType="numeric"
                    value={weight}
                    onChangeText={setWeight}
                    placeholder={unitSystem === 'metric' ? 'kg' : 'lbs'}
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>HEIGHT ({unitSystem === 'metric' ? 'CM' : 'FT/IN'})</Text>
              {unitSystem === 'metric' ? (
                <TextInput style={styles.field} keyboardType="numeric" value={height} onChangeText={setHeight} placeholder="cm" placeholderTextColor={colors.textMuted} />
              ) : (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHalf}>
                    <TextInput style={styles.field} keyboardType="numeric" value={heightFt} onChangeText={setHeightFt} placeholder="ft" placeholderTextColor={colors.textMuted} />
                  </View>
                  <View style={styles.inputHalf}>
                    <TextInput style={styles.field} keyboardType="numeric" value={heightIn} onChangeText={setHeightIn} placeholder="in" placeholderTextColor={colors.textMuted} />
                  </View>
                </View>
              )}

              <View style={styles.card}>
                {sectionKicker('SCHEDULE')}
                <Text style={styles.cardTitle}>When you're busy</Text>
                <Text style={styles.cardHint}>Coach plans routines around your sleep + work hours.</Text>
                {timeRow('Wake', 'wake', wakeTime, setWakeTime)}
                {timeRow('Bed', 'sleep', sleepTime, setSleepTime)}
                <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>WORK / SCHOOL HOURS</Text>
                <View style={[styles.tagWrap, { marginBottom: spacing.md }]}>
                  {[
                    { id: 'fixed' as const, label: 'Fixed' },
                    { id: 'flexible' as const, label: 'Flexible' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.tag, workSchedule === opt.id && styles.tagOn]}
                      onPress={() => setWorkSchedule(opt.id)}
                    >
                      <Text style={[styles.tagText, workSchedule === opt.id && styles.tagTextOn]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {workSchedule === 'fixed' ? (
                  <>
                    {timeRow('Start', 'workStart', workStart, setWorkStart)}
                    {timeRow('End', 'workEnd', workEnd, setWorkEnd)}
                  </>
                ) : null}
              </View>

              {/* Onairos personalization card — let users connect or refresh
                  their cross-app personality/habit data. The chatbot picks up
                  the new traits on the next turn via coaching_service. */}
              {(process.env.EXPO_PUBLIC_ONAIROS_API_KEY || '').trim() ? (
                <View style={styles.card}>
                  {sectionKicker('EXTERNAL PERSONALIZATION')}
                  <Text style={styles.cardTitle}>Connect your apps</Text>
                  <Text style={styles.cardHint}>
                    Pull personality + habit signals from apps you already use,
                    so Max can tailor coaching without another quiz. Re-run any
                    time to refresh.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setOnairosVisible(true)}
                    activeOpacity={0.85}
                    style={styles.onairosBtn}
                  >
                    <Ionicons name="link-outline" size={15} color={colors.background} />
                    <Text style={styles.onairosBtnText}>Connect with Onairos</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {priorityRanking.length > 0 ? (
                <View style={styles.card}>
                  {sectionKicker('PRIORITY')}
                  <Text style={styles.cardTitle}>What matters most</Text>
                  <Text style={styles.cardHint}>Top = strongest signal in coaching + reminders.</Text>
                  {priorityRanking.map((key, i) => (
                    <View key={key} style={styles.rankRow}>
                      <Text style={styles.rankNum}>{i + 1}</Text>
                      <Text style={styles.rankLabel}>{PRIORITY_LABELS[key as PriorityKey] || key}</Text>
                      <View style={styles.rankArrows}>
                        <TouchableOpacity onPress={() => movePriority(i, -1)} disabled={i === 0} style={styles.iconBtn}>
                          <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.border : colors.foreground} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => movePriority(i, 1)}
                          disabled={i === priorityRanking.length - 1}
                          style={styles.iconBtn}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={22}
                            color={i === priorityRanking.length - 1 ? colors.border : colors.foreground}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.saveBtnText}>{onlyGoals ? 'Save Maxxes' : 'Save all changes'}</Text>}
        </TouchableOpacity>
      </View>

      <OnairosConnectModal
        visible={onairosVisible}
        onClose={() => setOnairosVisible(false)}
        onConnected={() => {
          // Refresh user object so any auth-side onairos flag flips, and
          // bust schedules so the next chat turn rebuilds with the new
          // coaching context (which now includes the fresh traits).
          void refreshUser?.();
          queryClient.invalidateQueries({ queryKey: queryKeys.schedulesActiveFull, refetchType: 'all' });
          setOnairosVisible(false);
        }}
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
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: { ...typography.h3, color: colors.foreground },
  backButton: { padding: 4 },
  lead: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  content: { padding: spacing.xl },
  contentWide: { maxWidth: 560, alignSelf: 'center', width: '100%', paddingHorizontal: spacing.xxl },
  kicker: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xs, letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, marginBottom: spacing.xs },
  cardHint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  sectionTitle: { ...typography.h2, fontSize: 20, marginBottom: spacing.sm, marginTop: spacing.lg },
  goalsLimitHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
    marginBottom: spacing.sm,
    opacity: 0.7,
  },
  onlyGoalsContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  /** Cancels scroll horizontal padding so rows span screen width (with inner lg inset). */
  goalsListBleed: {
    paddingHorizontal: spacing.lg,
  },
  goalRowCheckSelectedUniform: {
    borderColor: colors.foreground,
    backgroundColor: colors.surface,
  },
  goalRowCheck: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    flexShrink: 0,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.full },
  unitBtnActive: { backgroundColor: colors.foreground },
  unitLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  unitLabelActive: { color: colors.background },
  inputLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  chipSelected: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  chipText: { ...typography.bodySmall, color: colors.textSecondary },
  chipTextSelected: { color: colors.background, fontWeight: '600' },
  inputGroup: { flexDirection: 'row', gap: spacing.lg },
  inputHalf: { flex: 1 },
  field: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.foreground,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  list: { gap: spacing.md },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  listCardSelected: { backgroundColor: colors.accentMuted, borderColor: colors.foreground },
  listLabel: { ...typography.body, fontWeight: '600', color: colors.foreground },
  listDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rankNum: { width: 28, fontWeight: '700', color: colors.textMuted },
  rankLabel: { flex: 1, fontSize: 16, color: colors.foreground, fontWeight: '600' },
  rankArrows: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  tagText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tagTextOn: { color: colors.background },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayPillOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  dayPillText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  dayPillTextOn: { color: colors.background },
  timeBlock: { marginBottom: spacing.sm },
  timeTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeTriggerText: { fontSize: 17, color: colors.foreground, fontWeight: '600' },
  timeDropdown: {
    marginTop: spacing.xs,
    maxHeight: 200,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  timeDropdownScroll: { maxHeight: 200 },
  timeOption: {
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  timeOptionOn: { backgroundColor: colors.accentMuted },
  timeOptionText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  timeOptionTextOn: { color: colors.foreground },
  /* Onairos card button — same shape as saveBtn but inline in the card. */
  onairosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.foreground,
    borderRadius: borderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  onairosBtnText: {
    color: colors.background,
    fontWeight: '600',
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
  footer: {
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  saveBtn: {
    backgroundColor: colors.foreground,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  saveBtnText: { ...typography.button, color: colors.background },
});

/* "Your Maxxes" editorial row — mirrors ModuleSelect. */
const ygStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  numBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: spacing.md,
    marginTop: 2,
  },
  numText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  copy: {
    flex: 1,
    paddingTop: 1,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.5,
    lineHeight: 30,
    color: colors.foreground,
  },
  desc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 19,
  },
});
