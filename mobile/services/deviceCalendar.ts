/**
 * On-device calendar reader (spec 4.8, Calendar v1) - iOS EventKit.
 *
 * The DEVICE reads events and POSTs busy projections to /planner/signals;
 * no tokens, no server-side fetch, raw titles truncated. Web and Android
 * no-op cleanly. Requires the native binary (expo-calendar) - present in
 * package.json, activates on the next dev/EAS build; until then every call
 * resolves {synced: 0, reason}.
 */
import { Platform } from 'react-native';

import api from './api';

const WINDOW_DAYS = 14;

export async function syncDeviceCalendar(): Promise<{ synced: number; reason?: string }> {
    if (Platform.OS !== 'ios') {
        return { synced: 0, reason: 'ios_only' };
    }
    let Calendar: typeof import('expo-calendar');
    try {
        Calendar = require('expo-calendar');
    } catch {
        return { synced: 0, reason: 'module_unavailable' };
    }

    try {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (status !== 'granted') {
            return { synced: 0, reason: 'permission_denied' };
        }

        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const ids = calendars.map((c) => c.id);
        if (!ids.length) return { synced: 0, reason: 'no_calendars' };

        const from = new Date();
        from.setDate(from.getDate() - 1);
        const to = new Date();
        to.setDate(to.getDate() + WINDOW_DAYS);

        const events = await Calendar.getEventsAsync(ids, from, to);

        // Project to busy blocks: LOCAL wall-clock ISO (no offset), titles
        // truncated. Declined/transparent events are skipped.
        const wallIso = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
            `T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

        const projections = events
            .filter((e) => e.availability !== 'free' && e.status !== 'canceled')
            .slice(0, 200)
            .map((e) => ({
                external_event_id: String(e.id),
                title: (e.title || 'Busy').slice(0, 80),
                starts_at: wallIso(new Date(e.startDate)),
                ends_at: wallIso(new Date(e.endDate)),
                all_day: !!e.allDay,
                is_busy: true,
            }));

        await api.pushPlannerSignals({
            calendar: {
                provider: 'ios_eventkit',
                events: projections,
                window_from: wallIso(from),
                window_to: wallIso(to),
            },
        });
        return { synced: projections.length };
    } catch (e) {
        return { synced: 0, reason: 'error' };
    }
}
