import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { COMPLETE_TASK_ACTION_ID, TASK_REMINDER_CATEGORY_ID } from '../lib/notificationDeepLink';

const DEFAULT_CHANNEL_ID = 'max-schedule-reminders';

if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

// NOTE: there is deliberately no "ensure permission" helper here any more. The
// iOS prompt may only be shown from an explicit user tap — see
// services/registerIosPushToken.requestIosPushPermissionAndToken.

/**
 * iOS action buttons for server pushes. Task reminders arrive with
 * aps.category = "TASK_REMINDER"; registering the category is what makes iOS
 * show a "Mark done" button on them (handled in App.tsx). Idempotent — call on
 * every app start. Best-effort: without it the push still arrives, just
 * without the button.
 */
export async function registerNotificationCategories(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    try {
        await Notifications.setNotificationCategoryAsync(TASK_REMINDER_CATEGORY_ID, [
            {
                identifier: COMPLETE_TASK_ACTION_ID,
                buttonTitle: 'Mark done',
                options: { opensAppToForeground: true },
            },
        ]);
    } catch {
        /* native module unavailable (web / Expo Go quirk) — ignore */
    }
}

export async function ensureAndroidNotificationChannel() {
    // Android channels are required for scheduled notifications to show reliably.
    // Safe no-op on iOS.
    try {
        await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
            name: 'Schedule reminders',
            importance: Notifications.AndroidImportance.MAX,
            sound: false,
        } as any);
    } catch {
        // Ignore if channel cannot be created (older clients / web).
    }
}

export async function scheduleScheduleReminder(params: {
    title: string;
    body: string;
    fireDate: Date;
}): Promise<string> {
    await ensureAndroidNotificationChannel();
    const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: params.title,
            body: params.body,
            sound: false,
        },
        trigger: params.fireDate,
    });
    return String(id);
}

export async function cancelScheduleReminder(notificationId: string): Promise<void> {
    if (!notificationId) return;
    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
        // Best-effort cancellation.
    }
}

