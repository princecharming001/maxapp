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
    // Precise day anchors — null means "auto" (coach derives from wake/sleep).
    // We only ever persist a concrete time when the user explicitly picks one,
    // so users who don't care keep the smart biology-anchored defaults.
    getReadyTime: (ob.get_ready_time as string | undefined) || null,
    workoutTime: (ob.preferred_workout_time as string | undefined) || null,
    workSchedule: (ob.work_schedule as 'fixed' | 'flexible' | undefined) || null,
    workStart: ob.work_start || '09:00',
    workEnd: ob.work_end || '17:00',
  };
}

type TimePickerKey = 'wake' | 'getReady' | 'workout' | 'sleep' | 'workStart' | 'workEnd';

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
  const [getReadyTime, setGetReadyTime] = useState<string | null>(v2.getReadyTime);
  const [workoutTime, setWorkoutTime] = useState<string | null>(v2.workoutTime);
  const [workSchedule, setWorkSchedule] = useState<'fixed' | 'flexible' | null>(v2.workSchedule);
  const [workStart, setWorkStart] = useState(v2.workStart);
  const [workEnd, setWorkEnd] = useState(v2.workEnd);
  const [openTimePicker, setOpenTimePicker] = useState<TimePickerKey | null>(null);

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
    setGetReadyTime(h.getReadyTime);
    setWorkoutTime(h.workoutTime);
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
      // Precise anchors — only persist a concrete time when the user set one;
      // null clears back to auto so the coach derives it from wake/sleep.
      get_ready_time: getReadyTime ? hhmm(getReadyTime) : null,
      preferred_workout_time: workoutTime ? hhmm(workoutTime) : null,
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
    which: TimePickerKey,
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

  // Optional precise anchor (workout / get-ready). null = "Auto": the coach
  // derives it from wake/sleep. Picking a time pins every related routine to
  // it across all maxxes; an "Auto" entry at the top clears back to default.
  const anchorRow = (
    label: string,
    which: TimePickerKey,
    value: string | null,
    setter: (s: string | null) => void,
    autoHint: string,
    iconName: keyof typeof Ionicons.glyphMap,
  ) => (
    <View style={styles.timeBlock}>
      <View style={styles.anchorLabelRow}>
        <Ionicons name={iconName} size={13} color={colors.textMuted} style={{ marginRight: 6 }} />
        <Text style={[styles.inputLabel, { marginTop: 0, marginBottom: 0 }]}>{label}</Text>
      </View>
      <TouchableOpacity
        style={styles.timeTrigger}
        activeOpacity={0.85}
        onPress={() => setOpenTimePicker((p) => (p === which ? null : which))}
      >
        <Text style={[styles.timeTriggerText, !value && styles.timeTriggerAuto]}>
          {value ? formatTime12h(value) : 'Auto'}
        </Text>
        <Ionicons name={openTimePicker === which ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {!value && openTimePicker !== which ? (
        <Text style={styles.anchorAutoHint}>{autoHint}</Text>
      ) : null}
      {openTimePicker === which ? (
        <View style={styles.timeDropdown}>
          <ScrollView nestedScrollEnabled style={styles.timeDropdownScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={[styles.timeOption, !value && styles.timeOptionOn]}
              onPress={() => {
                setter(null);
                setOpenTimePicker(null);
              }}
            >
              <Text style={[styles.timeOptionText, !value && styles.timeOptionTextOn]}>Auto (let coach pick)</Text>
            </TouchableOpacity>
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
                {sectionKicker('DAILY TIMINGS')}
                <Text style={styles.cardTitle}>Your day, hour by hour</Text>
                <Text style={styles.cardHint}>
                  These anchor every routine across your maxxes — workouts, skincare,
                  mewing and stretches all shift to fit your real day. Leave anything
                  on Auto and the coach picks the best time for you.
                </Text>
                {timeRow('Wake', 'wake', wakeTime, setWakeTime)}
                {anchorRow(
                  'Get ready / shower',
                  'getReady',
                  getReadyTime,
                  setGetReadyTime,
                  'Anchors your AM skin, hair & mewing routine.',
                  'water-outline',
                )}
                {anchorRow(
                  'Workout',
                  'workout',
                  workoutTime,
                  setWorkoutTime,
                  'Drives FitMax lifts, HeightMax stretches & post-workout fuel.',
                  'barbell-outline',
                )}
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
  /* Quieter top bar — hairline divider instead of 1px, more breathing room. */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  /* Editorial header title in the same serif as the rest of the app. */
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400',
    color: colors.foreground,
    letterSpacing: -0.4,
  },
  backButton: { padding: 4 },
  lead: {
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 19,
    letterSpacing: 0.05,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  contentWide: { maxWidth: 560, alignSelf: 'center', width: '100%', paddingHorizontal: spacing.xxl },
  /* Tighter, more spaced kicker. Reads as a section divider, not a label. */
  kicker: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
    opacity: 0.7,
  },
  /* Card: drop the heavy 1px border, lift with subtle shadow on iOS,
     plus hairline border on Android so it still has an edge. */
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0a0a0b',
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        }
      : {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }),
  },
  /* Card title in serif — matches the rest of the app's editorial tone. */
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '400',
    color: colors.foreground,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
    letterSpacing: 0.05,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400',
    color: colors.foreground,
    letterSpacing: -0.4,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
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
  /* Field labels: tracked uppercase, smaller — feel like form micro-labels. */
  inputLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: spacing.lg,
    opacity: 0.85,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  /* Modern chip: hairline border, subtle shadow on iOS, tighter padding. */
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#0a0a0b', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }
      : null),
  },
  chipSelected: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.1 },
  chipTextSelected: { color: colors.background, fontWeight: '600' },
  inputGroup: { flexDirection: 'row', gap: spacing.md },
  inputHalf: { flex: 1 },
  /* Soft field — no visible border, just a tinted surface. Feels modern. */
  field: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '500',
  },
  list: { gap: 8 },
  /* List card: hairline border, slightly tighter padding, no internal shadow. */
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  listCardSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.foreground,
  },
  listLabel: {
    fontSize: 14.5,
    fontWeight: '500',
    color: colors.foreground,
    letterSpacing: 0.05,
  },
  listDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.05,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rankNum: {
    width: 26,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  rankLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  rankArrows: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tagOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  tagText: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary, letterSpacing: 0.1 },
  tagTextOn: { color: colors.background, fontWeight: '600' },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayPillOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  dayPillText: { fontSize: 13.5, fontWeight: '500', color: colors.textSecondary },
  dayPillTextOn: { color: colors.background, fontWeight: '600' },
  timeBlock: { marginBottom: 6 },
  /* Soft time row — same surface as fields, no visible border, gentle. */
  timeTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  timeTriggerText: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: '500',
    letterSpacing: 0.05,
  },
  /* Muted style when an optional anchor is on "Auto". */
  timeTriggerAuto: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  anchorLabelRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: 8 },
  anchorAutoHint: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 5,
    marginLeft: 2,
    opacity: 0.8,
  },
  timeDropdown: {
    marginTop: 6,
    maxHeight: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  timeDropdownScroll: { maxHeight: 200 },
  timeOption: {
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  timeOptionOn: { backgroundColor: colors.surface },
  timeOptionText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  timeOptionTextOn: { color: colors.foreground, fontWeight: '600' },
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  /* Modern primary action — full pill, slightly taller. */
  saveBtn: {
    backgroundColor: colors.foreground,
    borderRadius: borderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  saveBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.background,
    letterSpacing: 0.4,
  },
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
