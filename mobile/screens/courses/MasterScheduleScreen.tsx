import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import { colors, spacing, borderRadius, typography, fonts } from '../../theme/dark';
import {
  buildMaxxMaps,
  mergeSchedules,
  aggregateRoutineParts,
  type MergedScheduleTask,
  type RoutinePart,
} from '../../utils/scheduleAggregation';
import RoutineReviewSheet from '../../components/RoutineReviewSheet';
import TimeRangeSlider from '../../components/planner/TimeRangeSlider';
import { useMaxxesQuery, useActiveSchedulesFullQuery } from '../../hooks/useAppQueries';
import { queryKeys } from '../../lib/queryClient';
import { useAuth } from '../../context/AuthContext';
import { getItemAsync, setItemAsync } from '../../services/storage';
import {
  ensureAppNotificationPermission,
  scheduleScheduleReminder,
  cancelScheduleReminder,
} from '../../services/localScheduleNotifications';
import { StreakFireBadge } from '../../components/StreakFireBadge';
import MaxLoadingView from '../../components/MaxLoadingView';
import NavMigrationCard from '../../components/NavMigrationCard';
import { useFlag } from '../../constants/featureFlags';

function formatTimeTo12Hour(time24: string) {
  if (!time24 || typeof time24 !== 'string' || !time24.includes(':')) return time24 || '';
  try {
    const [hoursStr, minutesStr] = time24.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    if (isNaN(hours) || isNaN(minutes)) return time24;
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch {
    return time24;
  }
}

/** Avoid showing “Skinmax” twice when the title already starts with the module label. */
/** Short, calm copy for schedule API failures (hides raw SQLAlchemy / pool noise). */
function scheduleErrorSubtitle(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Could not load your schedule. Check your connection and try again.';
  const lower = s.toLowerCase();
  if (
    lower.includes('queuepool') ||
    lower.includes('connection timed out') ||
    lower.includes('maxclients') ||
    lower.includes('timeout')
  ) {
    return 'We could not load your data in time. Check your connection and try again.';
  }
  if (s.length > 160) {
    return `${s.slice(0, 157).trim()}…`;
  }
  return s;
}

function stripDuplicateModulePrefix(title: string, moduleLabel: string): string {
  const t = (title || '').trim();
  const m = (moduleLabel || '').trim();
  if (!m || !t) return t;
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*([·•|\\-–:]\\s*)?`, 'i');
  const stripped = t.replace(re, '').trim();
  return stripped.length > 0 ? stripped : t;
}

function parseTimeToHHMM(time: string): { hh: number; mm: number } | null {
  const s = (time || '').trim();
  if (!s) return null;
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m24) return null;
  const hh = parseInt(m24[1], 10);
  const mm = parseInt(m24[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

/** "HH:MM" → minutes since midnight (defaults to 7 AM on a bad value). */
function hhmmToMinutes(time: string): number {
  const p = parseTimeToHHMM(time);
  return p ? p.hh * 60 + p.mm : 7 * 60;
}

/** minutes since midnight → zero-padded "HH:MM". */
function minutesToHHMM(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 45, Math.round(min)));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

type ActiveSchedulesFullCache = {
  schedules: any[];
  schedule_streak?: unknown;
  today_date?: string;
};

/** Patch active/full schedules cache so checklist toggles feel instant (merged view updates from schedules[].days[].tasks). */
function patchSchedulesFullTaskStatus(
  data: ActiveSchedulesFullCache | undefined,
  scheduleId: string,
  taskId: string,
  nextStatus: 'completed' | 'pending',
): ActiveSchedulesFullCache | undefined {
  if (!data?.schedules?.length) return data;
  return {
    ...data,
    schedules: data.schedules.map((s) => {
      if (s.id !== scheduleId) return s;
      const days = (s.days || []).map((day: { tasks?: any[]; [k: string]: unknown }) => ({
        ...day,
        tasks: (day.tasks || []).map((t: any) => {
          if (t.task_id !== taskId) return t;
          if (nextStatus === 'completed') {
            return { ...t, status: 'completed', completed_at: new Date().toISOString() };
          }
          const { completed_at: _c, ...rest } = t;
          return { ...rest, status: 'pending' };
        }),
      }));
      return { ...s, days };
    }),
  };
}

/** Optimistically drop a whole recurring part (every day's instance) from the
 *  active/full cache so the routine review feels instant. Matches by catalog_id
 *  when present (the recurring identity), else falls back to the single task. */
function removeSeriesFromSchedulesFullCache(
  data: ActiveSchedulesFullCache | undefined,
  scheduleId: string,
  catalogId: string | undefined,
  taskId: string,
): ActiveSchedulesFullCache | undefined {
  if (!data?.schedules?.length) return data;
  return {
    ...data,
    schedules: data.schedules.map((s) => {
      if (s.id !== scheduleId) return s;
      const days = (s.days || []).map((day: { tasks?: any[]; [k: string]: unknown }) => ({
        ...day,
        tasks: (day.tasks || []).filter((t: any) =>
          catalogId ? t.catalog_id !== catalogId : t.task_id !== taskId,
        ),
      }));
      return { ...s, days };
    }),
  };
}

/** Optimistically re-time a recurring part (every day's instance) in the
 *  active/full cache so an inline time move feels instant. Matches by
 *  catalog_id when present (the recurring identity), else the single task. */
function setSeriesTimeInSchedulesFullCache(
  data: ActiveSchedulesFullCache | undefined,
  scheduleId: string,
  catalogId: string | undefined,
  taskId: string,
  time: string,
): ActiveSchedulesFullCache | undefined {
  if (!data?.schedules?.length) return data;
  return {
    ...data,
    schedules: data.schedules.map((s) => {
      if (s.id !== scheduleId) return s;
      const days = (s.days || []).map((day: { tasks?: any[]; [k: string]: unknown }) => ({
        ...day,
        tasks: (day.tasks || []).map((t: any) =>
          (catalogId ? t.catalog_id === catalogId : t.task_id === taskId)
            ? { ...t, time }
            : t,
        ),
      }));
      return { ...s, days };
    }),
  };
}

function mergeScheduleStreakFromToggleResponse(
  data: ActiveSchedulesFullCache | undefined,
  res: { schedule_streak?: { current?: number; today_date?: string; last_perfect_date?: string | null } },
): ActiveSchedulesFullCache | undefined {
  if (!data || !res?.schedule_streak) return data;
  const streak = res.schedule_streak;
  return {
    ...data,
    schedule_streak: streak,
    today_date: streak.today_date ?? data.today_date,
  };
}

function getTaskIcon(type: string) {
  switch (type) {
    case 'exercise':
      return 'barbell-outline';
    case 'routine':
      return 'refresh-outline';
    case 'reminder':
      return 'notifications-outline';
    case 'checkpoint':
      return 'flag-outline';
    default:
      return 'ellipse-outline';
  }
}

export default function MasterScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const newNav = useFlag('newNav');
  const queryClient = useQueryClient();
  const isTab = route.name === 'MasterScheduleTab';
  const { user } = useAuth();
  const appNotificationsOptIn = user?.onboarding?.app_notifications_opt_in !== false;
  const skipLocalBecauseServerPush =
    Platform.OS === 'ios' && appNotificationsOptIn && user?.has_apns_token === true;

  const notifIdMapRef = useRef<Record<string, string>>({});
  const taskToggleInFlightRef = useRef<Set<string>>(new Set());
  const notifStorageKey = 'max_local_schedule_reminder_notif_map_v1';

  const maxesQuery = useMaxxesQuery();
  const schedulesQuery = useActiveSchedulesFullQuery();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  // Inline "move time" editor — which task row is open + the working minute value.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editMinutes, setEditMinutes] = useState<number>(7 * 60);

  const schedules = schedulesQuery.data?.schedules ?? [];
  const maxxes = maxesQuery.data?.maxes ?? [];
  const loading =
    (maxesQuery.isPending && !maxesQuery.data) || (schedulesQuery.isPending && !schedulesQuery.data);

  const loadError = useMemo(() => {
    if (schedulesQuery.isError && schedulesQuery.error) {
      const e = schedulesQuery.error as { response?: { data?: { detail?: string } }; message?: string };
      return String(e?.response?.data?.detail || e?.message || 'Could not load schedules.');
    }
    return null;
  }, [schedulesQuery.isError, schedulesQuery.error]);

  const scheduleStreak = useMemo(
    () => ({ current: schedulesQuery.data?.schedule_streak?.current ?? 0 }),
    [schedulesQuery.data?.schedule_streak?.current],
  );

  const calendarTodayKey = useMemo(
    () =>
      schedulesQuery.data?.today_date ||
      schedulesQuery.data?.schedule_streak?.today_date ||
      '',
    [schedulesQuery.data?.today_date, schedulesQuery.data?.schedule_streak?.today_date],
  );

  const { labels: maxxLabels, colors: maxxColorMap } = useMemo(() => buildMaxxMaps(maxxes), [maxxes]);

  const merged = useMemo(
    () => mergeSchedules(schedules, maxxLabels, maxxColorMap),
    [schedules, maxxLabels, maxxColorMap],
  );

  // --- Plain-language routine review (#50) -------------------------------
  // The schedule is generated lazily by the coach, so the first time a fresh
  // (not-yet-reviewed) schedule shows up here we walk the user through it in
  // human terms and let them prune parts that don't fit. "Reviewed" is tracked
  // per schedule id so a brand-new Maxx later re-surfaces just its new parts.
  const reviewStorageKey = user?.id ? `@routine_reviewed_schedule_ids_v1:${user.id}` : '';
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewedLoaded, setReviewedLoaded] = useState(false);
  const [reviewActive, setReviewActive] = useState(false);
  const reviewShownRef = useRef(false);

  const activeScheduleIds = useMemo(
    () => schedules.map((s: any) => String(s.id)).filter(Boolean),
    [schedules],
  );
  const routineParts = useMemo(() => aggregateRoutineParts(merged.byDate), [merged.byDate]);

  useEffect(() => {
    if (!reviewStorageKey) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItemAsync(reviewStorageKey);
        const arr = raw ? JSON.parse(raw) : [];
        if (!cancelled) setReviewedIds(new Set(Array.isArray(arr) ? arr.map(String) : []));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReviewedLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewStorageKey]);

  useEffect(() => {
    if (reviewShownRef.current) return;
    if (!reviewedLoaded || loading) return;
    if (!user?.is_paid) return;
    if (activeScheduleIds.length === 0 || routineParts.length === 0) return;
    if (activeScheduleIds.some((id) => !reviewedIds.has(id))) {
      reviewShownRef.current = true;
      setReviewActive(true);
    }
  }, [reviewedLoaded, loading, user?.is_paid, activeScheduleIds, routineParts.length, reviewedIds]);

  const handleRemovePart = useCallback(
    (part: RoutinePart) => {
      const previous = queryClient.getQueryData(queryKeys.schedulesActiveFull) as
        | ActiveSchedulesFullCache
        | undefined;
      queryClient.setQueryData(queryKeys.schedulesActiveFull, (old) =>
        removeSeriesFromSchedulesFullCache(
          old as ActiveSchedulesFullCache | undefined,
          part.scheduleId,
          part.catalogId,
          part.taskId,
        ),
      );
      void (async () => {
        try {
          await api.deleteScheduleTask(part.scheduleId, part.taskId, 'series');
        } catch (e) {
          console.error('remove routine part', e);
          queryClient.setQueryData(queryKeys.schedulesActiveFull, previous);
        }
      })();
    },
    [queryClient],
  );

  // Inline routine editing — direct, not gated behind chat. Both operate at
  // the routine (series) level when the task is a recurring part (has a
  // catalog_id), matching how users think about "my morning skincare". The
  // backend durably re-pins moved times + keeps removed parts gone across
  // re-expansions, so these edits stick.
  const handleMoveTaskTime = useCallback(
    (task: MergedScheduleTask, newTime: string) => {
      if (task.scheduleId === 'life' || !newTime || newTime === task.time) return;
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const scope: 'instance' | 'series' = task.catalog_id ? 'series' : 'instance';
      const previous = queryClient.getQueryData(queryKeys.schedulesActiveFull) as
        | ActiveSchedulesFullCache
        | undefined;
      queryClient.setQueryData(queryKeys.schedulesActiveFull, (old) =>
        setSeriesTimeInSchedulesFullCache(
          old as ActiveSchedulesFullCache | undefined,
          task.scheduleId,
          task.catalog_id,
          task.task_id,
          newTime,
        ),
      );
      void (async () => {
        try {
          await api.editScheduleTask(task.scheduleId, task.task_id, { time: newTime }, scope);
        } catch (e) {
          console.error('move routine task time', e);
          queryClient.setQueryData(queryKeys.schedulesActiveFull, previous);
        }
      })();
    },
    [queryClient],
  );

  const handleRemoveTask = useCallback(
    (task: MergedScheduleTask) => {
      if (task.scheduleId === 'life') return;
      const scope: 'instance' | 'series' = task.catalog_id ? 'series' : 'instance';
      const cleanTitle = stripDuplicateModulePrefix(task.title, task.moduleLabel);
      Alert.alert(
        'Remove from your routine?',
        scope === 'series'
          ? `This takes "${cleanTitle}" off every day.`
          : `This removes "${cleanTitle}".`,
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const previous = queryClient.getQueryData(queryKeys.schedulesActiveFull) as
                | ActiveSchedulesFullCache
                | undefined;
              queryClient.setQueryData(queryKeys.schedulesActiveFull, (old) =>
                removeSeriesFromSchedulesFullCache(
                  old as ActiveSchedulesFullCache | undefined,
                  task.scheduleId,
                  task.catalog_id,
                  task.task_id,
                ),
              );
              setExpandedTaskId(null);
              setEditingTaskId(null);
              void (async () => {
                try {
                  await api.deleteScheduleTask(task.scheduleId, task.task_id, scope);
                } catch (e) {
                  console.error('remove routine task', e);
                  queryClient.setQueryData(queryKeys.schedulesActiveFull, previous);
                }
              })();
            },
          },
        ],
      );
    },
    [queryClient],
  );

  const handleDoneReview = useCallback(() => {
    setReviewActive(false);
    if (!reviewStorageKey) return;
    const next = new Set(reviewedIds);
    for (const id of activeScheduleIds) next.add(id);
    setReviewedIds(next);
    void setItemAsync(reviewStorageKey, JSON.stringify(Array.from(next))).catch(() => undefined);
  }, [reviewStorageKey, reviewedIds, activeScheduleIds]);

  // "Change with Max" — anything beyond a clean cut (move it, swap it, make it
  // easier) is a conversation, so hand the part to the coach instead of
  // building a parallel editor.
  const handleTweakPart = useCallback(
    (part: RoutinePart) => {
      setReviewActive(false);
      const cleanTitle = stripDuplicateModulePrefix(part.title, part.moduleLabel);
      const initQuestion = `can you change "${cleanTitle}" in my routine?`;
      const initContext = `task_help:${part.scheduleId}:${part.taskId}`;
      if (isTab) {
        navigation.navigate('Chat', { initQuestion, initContext });
      } else {
        navigation.navigate('Main', { screen: 'Chat', params: { initQuestion, initContext } });
      }
    },
    [isTab, navigation],
  );

  const refetchAll = useCallback(async () => {
    await Promise.all([maxesQuery.refetch(), schedulesQuery.refetch()]);
  }, [maxesQuery, schedulesQuery]);

  useEffect(() => {
    if (merged.dates.length === 0) {
      setSelectedDate('');
      return;
    }
    setSelectedDate((d) => {
      if (d && merged.dates.includes(d)) return d;
      const today = calendarTodayKey || new Date().toISOString().split('T')[0];
      return merged.dates.includes(today) ? today : merged.dates[0];
    });
  }, [merged.dates, calendarTodayKey]);

  // When iOS has a server-registered APNs token, rely on backend push — skip duplicate local reminders.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!skipLocalBecauseServerPush) return;

    let cancelled = false;
    (async () => {
      try {
        const stored = await getItemAsync(notifStorageKey);
        let notifMap: Record<string, string> = {};
        if (stored) {
          try {
            notifMap = JSON.parse(stored) || {};
          } catch {
            notifMap = {};
          }
        }
        if (cancelled) return;
        for (const id of Object.values(notifMap)) {
          if (id) await cancelScheduleReminder(id);
        }
        notifIdMapRef.current = {};
        await setItemAsync(notifStorageKey, JSON.stringify({}));
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skipLocalBecauseServerPush, notifStorageKey]);

  // App notifications: schedule local reminder notifications for upcoming pending tasks.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (skipLocalBecauseServerPush) return;
    if (!appNotificationsOptIn) return;
    if (!user?.is_paid) return;
    if (loading) return;
    if (!merged.dates.length) return;

    let cancelled = false;
    (async () => {
      try {
        const granted = await ensureAppNotificationPermission();
        if (!granted || cancelled) return;

        const stored = await getItemAsync(notifStorageKey);
        let notifMap: Record<string, string> = {};
        if (stored) {
          try {
            notifMap = JSON.parse(stored) || {};
          } catch {
            notifMap = {};
          }
        }
        notifIdMapRef.current = notifMap;

        const schedulePrefsById = new Map<string, any>();
        for (const s of schedules) schedulePrefsById.set(s.id, s.preferences || {});

        const pendingKeys = new Set<string>();
        const pendingEntries: Record<string, { fireDate: Date; title: string; body: string }> = {};

        const nowMs = Date.now();
        const datesToConsider = merged.dates.slice(0, 14); // keep it bounded
        const MAX_NOTIFICATIONS = 120;

        for (const dateStr of datesToConsider) {
          const dayTasks = merged.byDate[dateStr] || [];
          for (const task of dayTasks) {
            if (task.status !== 'pending') continue;
            const parts = parseTimeToHHMM(task.time);
            if (!parts) continue;

            const key = `${task.scheduleId}:${task.task_id}`;
            if (pendingKeys.size >= MAX_NOTIFICATIONS) break;

            const hh = String(parts.hh).padStart(2, '0');
            const mm = String(parts.mm).padStart(2, '0');
            const scheduledAt = new Date(`${dateStr}T${hh}:${mm}:00`);
            const prefs = schedulePrefsById.get(task.scheduleId) || {};
            const offsetMin = prefs.notification_minutes_before ?? 5;
            const fireDate = new Date(scheduledAt.getTime() - offsetMin * 60 * 1000);

            // Skip anything already in the past (including notification lead-time).
            if (fireDate.getTime() <= nowMs) continue;

            pendingKeys.add(key);
            pendingEntries[key] = {
              fireDate,
              title: task.moduleLabel ? `Max (${task.moduleLabel})` : 'Max',
              body: task.description ? `${task.title}\n${task.description}` : task.title,
            };
          }
        }

        // Cancel notifications no longer pending.
        const existingKeys = Object.keys(notifMap);
        for (const key of existingKeys) {
          if (!pendingKeys.has(key)) {
            const existingId = notifMap[key];
            if (existingId) await cancelScheduleReminder(existingId);
            delete notifMap[key];
          }
        }

        // Schedule new notifications.
        for (const key of pendingKeys) {
          if (notifMap[key]) continue;
          const entry = pendingEntries[key];
          if (!entry) continue;
          const id = await scheduleScheduleReminder({
            title: entry.title,
            body: entry.body,
            fireDate: entry.fireDate,
          });
          notifMap[key] = id;
        }

        notifIdMapRef.current = notifMap;
        await setItemAsync(notifStorageKey, JSON.stringify(notifMap));
      } catch (e) {
        // Best-effort only: don't block schedule UI if scheduling fails.
        console.error('Local notification scheduling failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appNotificationsOptIn,
    skipLocalBecauseServerPush,
    user?.id,
    user?.is_paid,
    loading,
    merged,
    schedules,
  ]);

  // If the user opted out, cancel any previously scheduled local reminders.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (appNotificationsOptIn) return;

    let cancelled = false;
    (async () => {
      try {
        const stored = await getItemAsync(notifStorageKey);
        let notifMap: Record<string, string> = {};
        if (stored) {
          try {
            notifMap = JSON.parse(stored) || {};
          } catch {
            notifMap = {};
          }
        }
        if (cancelled) return;

        const ids = Object.values(notifMap);
        for (const id of ids) {
          if (id) await cancelScheduleReminder(id);
        }

        notifIdMapRef.current = {};
        await setItemAsync(notifStorageKey, JSON.stringify({}));
      } catch {
        // Best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appNotificationsOptIn]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [refetchAll]);

  const goHome = () => {
    if (isTab) navigation.navigate('Home');
    else navigation.navigate('Main', { screen: 'Home' });
  };

  const headerBack = () => {
    if (isTab) return;
    if (navigation.canGoBack()) navigation.goBack();
  };

  const tasksForDay = selectedDate ? merged.byDate[selectedDate] || [] : [];

  const goToChatForTask = (task: MergedScheduleTask) => {
    // User-visible seed is intentionally short — just names the task. The
    // verbose "give me numbered steps, no fluff" framing now lives in
    // initContext (task_help:...) so the backend's chat path knows to
    // respond with practical how-to copy without it cluttering the user's
    // chat thread. Result: tap "Ask Max" → user sees one clean line, bot
    // jumps straight to the answer.
    const cleanTitle = stripDuplicateModulePrefix(task.title, task.moduleLabel);
    const initQuestion = `how do i do "${cleanTitle}"?`;
    const initContext = `task_help:${task.scheduleId}:${task.task_id}`;
    if (isTab) {
      navigation.navigate('Chat', { initQuestion, initContext });
    } else {
      navigation.navigate('Main', { screen: 'Chat', params: { initQuestion, initContext } });
    }
  };

  const toggleTaskComplete = async (task: MergedScheduleTask) => {
    const key = `${task.scheduleId}-${task.task_id}`;
    if (taskToggleInFlightRef.current.has(key)) return;
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Life tasks (work / sleep) — local-only toggle. No server schedule
    // backs them; persist to AsyncStorage and bail out before the API call.
    if (task.scheduleId === 'life') {
      const m = /^life-(work|sleep|ob)-(.+)$/.exec(task.task_id);
      if (m) toggleLifeChecked(`${m[1]}-${m[2]}`);
      return;
    }

    const nextStatus: 'completed' | 'pending' = task.status === 'completed' ? 'pending' : 'completed';
    const previous = queryClient.getQueryData(queryKeys.schedulesActiveFull) as ActiveSchedulesFullCache | undefined;
    queryClient.setQueryData(queryKeys.schedulesActiveFull, (old) =>
      patchSchedulesFullTaskStatus(old as ActiveSchedulesFullCache | undefined, task.scheduleId, task.task_id, nextStatus),
    );

    taskToggleInFlightRef.current.add(key);
    try {
      const res =
        nextStatus === 'completed'
          ? await api.completeScheduleTask(task.scheduleId, task.task_id)
          : await api.uncompleteScheduleTask(task.scheduleId, task.task_id);

      queryClient.setQueryData(queryKeys.schedulesActiveFull, (old) =>
        mergeScheduleStreakFromToggleResponse(old as ActiveSchedulesFullCache | undefined, res),
      );

      if (nextStatus === 'completed') {
        const notifKey = `${task.scheduleId}:${task.task_id}`;
        const notifId = notifIdMapRef.current[notifKey];
        if (notifId) {
          void (async () => {
            try {
              await cancelScheduleReminder(notifId);
              delete notifIdMapRef.current[notifKey];
              await setItemAsync(notifStorageKey, JSON.stringify(notifIdMapRef.current));
            } catch {
              // Best-effort.
            }
          })();
        }
      }
    } catch (e) {
      console.error('toggle task complete', e);
      queryClient.setQueryData(queryKeys.schedulesActiveFull, previous);
    } finally {
      taskToggleInFlightRef.current.delete(key);
    }
  };

  /**
   * Local checked-state for the work + sleep "life tasks". They aren't
   * persisted to the server (no schedule row backs them) so we keep
   * status in AsyncStorage keyed by `${kind}-${date}`. Reset implicitly
   * each new day because the key changes.
   */
  const [lifeChecked, setLifeChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    AsyncStorage.getItem('@life_task_checked_v1').then((s) => {
      if (s) {
        try { setLifeChecked(JSON.parse(s)); } catch { /* ignore */ }
      }
    });
  }, []);
  const toggleLifeChecked = useCallback((key: string) => {
    setLifeChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void AsyncStorage.setItem('@life_task_checked_v1', JSON.stringify(next));
      return next;
    });
  }, []);

  // "Maxxes only" — hide the life/day-shape items (wake, work, meals, sleep…)
  // and show just the looksmaxxing tasks. Preference persists across sessions.
  const [maxxesOnly, setMaxxesOnly] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('@maxxes_only_v1').then((s) => {
      if (s === '1') setMaxxesOnly(true);
    });
  }, []);
  const toggleMaxxesOnly = useCallback(() => {
    setMaxxesOnly((prev) => {
      const next = !prev;
      void AsyncStorage.setItem('@maxxes_only_v1', next ? '1' : '0');
      return next;
    });
  }, []);

  /**
   * Build pseudo-tasks for the user's work + sleep windows so they
   * render inline with regular tasks (same row component, sorted by
   * time). Pulled from onboarding (wake_time, sleep_time,
   * work_schedule, work_start, work_end).
   */
  const lifeTasks = useMemo(() => {
    const ob = (user?.onboarding || {}) as Record<string, any>;
    const date = selectedDate || '';
    const out: MergedScheduleTask[] = [];
    const push = (task_id: string, time: string, title: string, checkKey: string) => {
      out.push({
        task_id,
        time: String(time),
        title,
        description: '',
        task_type: 'life',
        duration_minutes: 0,
        status: lifeChecked[checkKey] ? 'completed' : 'pending',
        scheduleId: 'life',
        moduleLabel: '',
        moduleColor: colors.foreground,
      });
    };

    // Weekday/weekend, so weekday-only obligations don't show on weekends.
    let isWeekday = true;
    try {
      const dow = (date ? new Date(`${date}T12:00:00`) : new Date()).getDay();
      isWeekday = dow >= 1 && dow <= 5;
    } catch {
      /* default to weekday */
    }

    // Obligations the user set in onboarding (work / school + anything else)
    // live in an `obligations` array: [{ label, start, end, days }].
    const obligations: any[] = Array.isArray(ob.obligations) ? ob.obligations : [];
    let hasWorkOb = false;
    obligations.forEach((o, i) => {
      if (!o || !o.start) return;
      if (o.days === 'weekdays' && !isWeekday) return;
      const label = String(o.label || 'Busy').trim().toLowerCase();
      const isWork = label.includes('work') || label.includes('school');
      if (isWork) hasWorkOb = true;
      const name = isWork ? 'work / school' : label;
      const title = o.end ? `${name} - until ${formatTime12(String(o.end))}` : name;
      push(`life-ob-${i}-${date}`, o.start, title, `ob-${i}-${date}`);
    });

    // Legacy top-level work fields (older accounts) if obligations didn't cover it.
    if (!hasWorkOb && ob.work_schedule === 'fixed' && ob.work_start && ob.work_end && isWeekday) {
      push(`life-work-${date}`, ob.work_start, `work / school - until ${formatTime12(String(ob.work_end))}`, `work-${date}`);
    }

    // Day-shape from onboarding / the planner: wake, get-ready, meals, the
    // workout window and wind-down. These are the "life" scaffold the
    // looksmaxxing tasks slot around — toggleable off via "Maxxes only".
    if (ob.wake_time) push(`life-wake-${date}`, ob.wake_time, 'wake up', `wake-${date}`);

    const grw = Array.isArray(ob.get_ready_window) ? ob.get_ready_window : null;
    if (grw && grw[0]) {
      push(`life-getready-${date}`, grw[0], grw[1] ? `get ready - until ${formatTime12(String(grw[1]))}` : 'get ready', `getready-${date}`);
    } else if (ob.get_ready_time) {
      push(`life-getready-${date}`, ob.get_ready_time, 'get ready', `getready-${date}`);
    }

    const skippedMeals: string[] = Array.isArray(ob.meals_skipped)
      ? ob.meals_skipped.map((m: any) => String(m).toLowerCase())
      : [];
    if (ob.breakfast_time && !skippedMeals.includes('breakfast')) push(`life-breakfast-${date}`, ob.breakfast_time, 'breakfast', `breakfast-${date}`);
    if (ob.lunch_time && !skippedMeals.includes('lunch')) push(`life-lunch-${date}`, ob.lunch_time, 'lunch', `lunch-${date}`);
    if (ob.dinner_time && !skippedMeals.includes('dinner')) push(`life-dinner-${date}`, ob.dinner_time, 'dinner', `dinner-${date}`);

    const ww = Array.isArray(ob.preferred_workout_window)
      ? ob.preferred_workout_window
      : (Array.isArray(ob.workout_window) ? ob.workout_window : null);
    if (ww && ww[0]) push(`life-workout-${date}`, ww[0], ww[1] ? `workout - until ${formatTime12(String(ww[1]))}` : 'workout', `workout-${date}`);

    const wdw = Array.isArray(ob.wind_down_window) ? ob.wind_down_window : null;
    if (wdw && wdw[0]) push(`life-winddown-${date}`, wdw[0], wdw[1] ? `wind down - until ${formatTime12(String(wdw[1]))}` : 'wind down', `winddown-${date}`);

    if (ob.sleep_time && ob.wake_time) {
      push(`life-sleep-${date}`, ob.sleep_time, `sleep - until ${formatTime12(String(ob.wake_time))}`, `sleep-${date}`);
    }
    return out;
  }, [user?.onboarding, selectedDate, lifeChecked]);

  /** Single chronological task list — no Morning/Midday/Evening
   *  buckets. Regular tasks + work/sleep pseudo-tasks merged + sorted
   *  by HH:MM. Reads as one fluid timeline. */
  const orderedTasks = useMemo(() => {
    const all = [...tasksForDay, ...lifeTasks];
    return all.sort((a, b) => {
      const ah = parseTimeToHHMM(a.time);
      const bh = parseTimeToHHMM(b.time);
      const am = ah ? ah.hh * 60 + ah.mm : 9999;
      const bm = bh ? bh.hh * 60 + bh.mm : 9999;
      return am - bm;
    });
  }, [tasksForDay, lifeTasks]);

  // "Maxxes only" filters the life/day-shape scaffold out of the timeline.
  const visibleTasks = useMemo(
    () => (maxxesOnly ? orderedTasks.filter((t) => t.scheduleId !== 'life') : orderedTasks),
    [orderedTasks, maxxesOnly],
  );
  const hiddenLifeCount = useMemo(
    () => orderedTasks.filter((t) => t.scheduleId === 'life').length,
    [orderedTasks],
  );

  const HeaderChrome = ({
    title,
    headerRight,
  }: {
    title: string;
    headerRight?: ReactNode;
  }) => (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      {!isTab && (
        <TouchableOpacity onPress={headerBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
      )}
      <View style={styles.headerTextCol}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {headerRight}
    </View>
  );

  const headerStreakRight = <StreakFireBadge streakDays={scheduleStreak.current} />;

  if (loading) {
    return <MaxLoadingView />;
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <HeaderChrome title={newNav ? 'Today' : 'Schedule'} headerRight={headerStreakRight} />
        <View style={[styles.emptyStateMinimal, styles.center]}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="pulse-outline" size={22} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitleMinimal}>Schedule unavailable</Text>
          <Text style={styles.emptySubtitleMinimal}>{scheduleErrorSubtitle(loadError)}</Text>
          <TouchableOpacity
            style={styles.minimalBtn}
            onPress={() => void refetchAll()}
            activeOpacity={0.65}
          >
            <Text style={styles.minimalBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (schedules.length === 0 || merged.dates.length === 0) {
    return (
      <View style={styles.container}>
        <HeaderChrome
          title={newNav ? 'Today' : 'Schedule'}
          headerRight={headerStreakRight}
        />
        <View style={[styles.emptyStateMinimal, styles.center]}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitleMinimal}>No schedules yet</Text>
          <Text style={styles.emptySubtitleMinimal}>
            {newNav
              ? 'Pick your programs in Explore. Your day shows up here.'
              : "Start a plan from a Maxx on Home. It shows up here once it's active."}
          </Text>
          <TouchableOpacity
            style={styles.minimalBtn}
            onPress={newNav ? () => (navigation as any).navigate('Explore') : goHome}
            activeOpacity={0.65}
          >
            <Text style={styles.minimalBtnText}>{newNav ? 'Go to Explore' : 'Go to Home'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {!isTab && (
          <TouchableOpacity onPress={headerBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
        )}
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{newNav ? 'Today' : 'Schedule'}</Text>
        </View>
        <StreakFireBadge streakDays={scheduleStreak.current} />
      </View>

      <View style={styles.bodyBelowHeader}>
        {selectedDate ? (
          <Text style={styles.monthLabel}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayStripScroll}
          contentContainerStyle={styles.daySelectorContainer}
        >
          {merged.dates.map((dateStr) => {
            const isSelected = dateStr === selectedDate;
            const date = new Date(dateStr + 'T00:00:00');
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();
            const dayTasks = merged.byDate[dateStr] || [];
            const dayDone = dayTasks.length > 0 && dayTasks.every((t) => t.status === 'completed');
            return (
              <TouchableOpacity
                key={dateStr}
                style={styles.dayPill}
                onPress={() => setSelectedDate(dateStr)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Select ${dayName} ${dayNum}`}
              >
                <Text style={[styles.dayPillLabel, isSelected && styles.dayPillLabelActive]}>{dayName}</Text>
                <Text style={[styles.dayPillNumber, isSelected && styles.dayPillNumberActive]}>{dayNum}</Text>
                {isSelected && <View style={styles.dayUnderline} />}
                {!isSelected && dayDone && <View style={styles.dayCompleteDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {hiddenLifeCount > 0 ? (
          <View style={styles.filterRow}>
            <MaxxesToggle on={maxxesOnly} onToggle={toggleMaxxesOnly} />
          </View>
        ) : null}

        <ScrollView
          style={styles.taskList}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />
          }
        >
          <NavMigrationCard />
          {/* Single fluid timeline — no Morning/Midday/Evening buckets.
              Regular tasks + work/sleep pseudo-tasks merged + sorted by
              time. Life tasks render with the EXACT same row markup as
              regular tasks (no different format/color); only difference
              is they toggle local-only state instead of hitting the
              server, and the accent stripe defaults to foreground when
              there's no module color. */}
          {visibleTasks.map((task, index) => {
            const isDone = task.status === 'completed';
            const isExpanded = expandedTaskId === task.task_id;
            const isLife = task.scheduleId === 'life';
            const isEditing = editingTaskId === task.task_id;
            return (
              <View key={`${task.scheduleId}-${task.task_id}`}>
                {index > 0 && <View style={styles.taskDivider} />}
                <TouchableOpacity
                  style={[styles.taskRow, isDone && styles.taskRowDone]}
                  onPress={() => {
                    if (isLife) return;   // life tasks have no expand-detail
                    setExpandedTaskId((prev) => (prev === task.task_id ? null : task.task_id));
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} details for ${stripDuplicateModulePrefix(task.title, task.moduleLabel)}`}
                >
                  <View style={[styles.scheduleTaskAccent, { backgroundColor: task.moduleColor }]} />
                  <TouchableOpacity
                    style={[styles.taskCheck, isDone && styles.taskCheckDone]}
                    onPress={(e) => { e.stopPropagation(); void toggleTaskComplete(task); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="checkbox"
                    accessibilityLabel={
                      isDone
                        ? `Mark task not done: ${task.title}`
                        : `Mark task done: ${task.title}`
                    }
                    accessibilityState={{ checked: isDone }}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark" size={11} color={colors.buttonText} />
                    ) : null}
                  </TouchableOpacity>
                  <View style={styles.taskContent}>
                    <View style={styles.taskTopLine}>
                      <Text style={[styles.taskTime, isDone && styles.taskTimeDone]}>
                        {formatTimeTo12Hour(task.time)}
                      </Text>
                      <Text
                        style={[styles.taskTitle, isDone && styles.taskTitleDone]}
                        numberOfLines={isExpanded ? undefined : 1}
                      >
                        {stripDuplicateModulePrefix(task.title, task.moduleLabel)}
                      </Text>
                    </View>
                    {isExpanded && !isLife && (
                      <>
                        <Text style={styles.taskMeta} numberOfLines={1}>
                          {task.moduleLabel}{task.duration_minutes ? `  -  ${task.duration_minutes}m` : ''}
                        </Text>
                        {task.description ? (
                          <Text style={styles.taskDescription}>
                            {task.description}
                          </Text>
                        ) : null}

                        {isEditing ? (
                          <View
                            style={styles.timeEditor}
                            // Claim stray taps (label / padding) so they don't
                            // bubble to the row press and collapse it mid-edit.
                            onStartShouldSetResponder={() => true}
                          >
                            <Text style={styles.timeEditorLabel}>
                              Move to{task.catalog_id ? '  -  applies every day' : ''}
                            </Text>
                            <TimeRangeSlider
                              single
                              min={0}
                              max={23 * 60 + 45}
                              step={15}
                              value={[editMinutes, editMinutes]}
                              onChange={(v) => setEditMinutes(v[0])}
                              format={(m) => formatTimeTo12Hour(minutesToHHMM(m))}
                              accent={task.moduleColor || colors.foreground}
                            />
                            <View style={styles.timeEditorActions}>
                              <TouchableOpacity
                                style={styles.editorCancelBtn}
                                onPress={(e) => { e.stopPropagation(); setEditingTaskId(null); }}
                                activeOpacity={0.75}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel time change"
                              >
                                <Text style={styles.editorCancelText}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.editorSaveBtn}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleMoveTaskTime(task, minutesToHHMM(editMinutes));
                                  setEditingTaskId(null);
                                }}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel="Save new time"
                              >
                                <Text style={styles.editorSaveText}>Save</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View
                            style={styles.taskActionRow}
                            onStartShouldSetResponder={() => true}
                          >
                            <TouchableOpacity
                              style={styles.taskActionChip}
                              onPress={(e) => {
                                e.stopPropagation();
                                setEditMinutes(hhmmToMinutes(task.time));
                                setEditingTaskId(task.task_id);
                              }}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel={`Move time for ${stripDuplicateModulePrefix(task.title, task.moduleLabel)}`}
                            >
                              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                              <Text style={styles.taskActionLabel}>Move time</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.taskActionChip}
                              onPress={(e) => { e.stopPropagation(); goToChatForTask(task); }}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel={`Ask Max about ${stripDuplicateModulePrefix(task.title, task.moduleLabel)}`}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textSecondary} />
                              <Text style={styles.taskActionLabel}>Ask Max</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.taskActionChip}
                              onPress={(e) => { e.stopPropagation(); handleRemoveTask(task); }}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${stripDuplicateModulePrefix(task.title, task.moduleLabel)} from your routine`}
                            >
                              <Ionicons name="trash-outline" size={13} color={colors.error} />
                              <Text style={[styles.taskActionLabel, { color: colors.error }]}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                  {!isLife ? (
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.textMuted}
                    />
                  ) : null}
                </TouchableOpacity>
              </View>
            );
          })}
          {maxxesOnly && visibleTasks.length === 0 ? (
            <View style={styles.maxxesEmpty}>
              <Text style={styles.maxxesEmptyText}>
                No looksmaxxing tasks today. Start a max in Explore, or switch off “Maxxes only” to see your full day.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <RoutineReviewSheet
        visible={reviewActive}
        parts={routineParts}
        totalDays={merged.dates.length}
        onRemovePart={handleRemovePart}
        onTweakPart={handleTweakPart}
        onDone={handleDoneReview}
      />
    </View>
  );
}

/** "07:00" → "7:00 AM". Used by the Work / Sleep blocks. */
function formatTime12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = m[2];
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${period}`;
}

// A bespoke slim toggle — editorial label + a custom switch in the Craft
// palette (ink track, cream knob). No icon, no filled pill: minimal + ownable.
function MaxxesToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const a = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: on ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [on, a]);
  const trackBg = a.interpolate({ inputRange: [0, 1], outputRange: ['rgba(28,26,23,0)', colors.foreground] });
  const knobX = a.interpolate({ inputRange: [0, 1], outputRange: [3, 19] });
  const knobBg = a.interpolate({ inputRange: [0, 1], outputRange: [colors.textMuted, colors.background] });
  return (
    <TouchableOpacity
      style={styles.toggle}
      activeOpacity={0.7}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Maxxes only"
    >
      <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>Maxxes only</Text>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackBg, borderColor: on ? colors.foreground : colors.border }]}>
        <Animated.View style={[styles.toggleKnob, { backgroundColor: knobBg, transform: [{ translateX: knobX }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  headerTextCol: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: -0.4,
    color: colors.foreground,
  },
  daySelectorContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: 20,
    flexGrow: 1,
    alignItems: 'center',
  },
  dayPill: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    minWidth: 40,
  },
  dayPillLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  dayPillLabelActive: { color: colors.foreground, fontWeight: '700' },
  dayPillNumber: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  dayPillNumberActive: { color: colors.foreground, fontWeight: '700' },
  dayUnderline: {
    width: 16,
    height: 2,
    backgroundColor: colors.foreground,
    borderRadius: 1,
    marginTop: 5,
  },
  dayCompleteDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary,
    marginTop: 5,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  timeGroupLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  groupSpacer: {
    height: spacing.md,
  },
  bodyBelowHeader: {
    flex: 1,
    minHeight: 0,
  },
  dayStripScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  taskList: { flex: 1, minHeight: 0, paddingHorizontal: spacing.lg },
  filterRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  toggleLabel: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textMuted, letterSpacing: 0.1 },
  toggleLabelOn: { color: colors.foreground, fontFamily: fonts.sansSemiBold },
  toggleTrack: { width: 38, height: 22, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth },
  toggleKnob: { position: 'absolute', top: 3, left: 0, width: 16, height: 16, borderRadius: 8 },
  maxxesEmpty: { paddingVertical: spacing.xl, paddingHorizontal: spacing.sm },
  maxxesEmptyText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  /* Life rows (work / sleep) — same shape as a regular taskRow but
     painted in the foreground (black) so the user reads them as part
     of the timeline, not floating chrome. Bleeds full-width like
     taskRow does, accent stripe + checkbox slot + time + title in the
     same positions as a task. The 'check' is a filled square with the
     life-icon to signal 'context, not toggleable'. */
  lifeRow: {
    backgroundColor: colors.foreground,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  lifeCheck: {
    backgroundColor: colors.foreground,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifeTitle: {
    color: colors.background,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  lifeTime: {
    color: colors.background,
    opacity: 0.6,
  },
  taskDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.lg,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 10,
  },
  taskRowDone: { opacity: 0.45 },
  scheduleTaskAccent: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
    opacity: 0.85,
    marginTop: 2,
  },
  taskCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  taskCheckDone: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  taskContent: { flex: 1, minWidth: 0 },
  taskTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskTime: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    minWidth: 62,
  },
  taskTimeDone: { textDecorationLine: 'line-through' },
  taskTitle: { fontSize: 15, fontWeight: '500', color: colors.foreground, flex: 1 },
  taskTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  taskMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    marginLeft: 62 + spacing.sm,
  },
  taskDescription: {
    ...typography.bodySmall,
    marginTop: 8,
    lineHeight: 20,
    color: colors.textSecondary,
    marginLeft: 62 + spacing.sm,
  },
  taskActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginLeft: 62 + spacing.sm,
  },
  taskActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  taskActionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  timeEditor: {
    marginTop: 12,
    marginLeft: 62 + spacing.sm,
    marginRight: spacing.sm,
  },
  timeEditorLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 10,
  },
  timeEditorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  editorCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  editorCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  editorSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.foreground,
  },
  editorSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.background,
  },
  emptyState: { flex: 1, paddingHorizontal: spacing.xl },
  emptyStateMinimal: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: spacing.xxl,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  emptyTitleMinimal: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
    color: colors.foreground,
    textAlign: 'center',
  },
  emptySubtitleMinimal: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  minimalBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.foreground,
    backgroundColor: 'transparent',
  },
  minimalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 0.15,
  },
  emptyTitle: { ...typography.h2, marginTop: spacing.lg, marginBottom: spacing.sm, textAlign: 'center' },
  emptySubtitle: { ...typography.bodySmall, textAlign: 'center', marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.foreground,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.foreground,
  },
  primaryBtnText: { ...typography.button },
});