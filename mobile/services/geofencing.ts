/**
 * On-device geofencing (spec 4.8, P2) - expo-location + expo-task-manager.
 *
 * Registers regions for the user's places (iOS 20-region cap -> nearest ~15)
 * and POSTs enter/exit events to /planner/signals (idempotent ids). Events
 * are 3-5 min latent - all dependent copy must tolerate that ("Look like
 * you're at the gym"). Permission ladder: When-In-Use first; Always only
 * after the user turns the feature on explicitly. Web/Android-without-build
 * no-op cleanly; the native binary activates on the next dev/EAS build.
 */
import { Platform } from 'react-native';

import api from './api';

export const GEOFENCE_TASK = 'max-geofence-events';
const MAX_REGIONS = 15;

let taskDefined = false;

function defineTask() {
    if (taskDefined) return;
    let TaskManager: typeof import('expo-task-manager');
    let Location: typeof import('expo-location');
    try {
        TaskManager = require('expo-task-manager');
        Location = require('expo-location');
    } catch {
        return;
    }
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
        if (error || !data) return;
        const { eventType, region } = data;
        const kind =
            eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
        try {
            await api.pushPlannerSignals({
                geofence_events: [
                    {
                        place_id: region?.identifier || null,
                        event_type: kind,
                        occurred_at: new Date().toISOString().slice(0, 19),
                        device_event_id: `${region?.identifier}-${kind}-${Date.now()}`,
                    },
                ],
            });
        } catch {
            // dropped events are fine; geofencing is best-effort by design
        }
    });
    taskDefined = true;
}

export async function startGeofencing(): Promise<{ started: boolean; reason?: string }> {
    if (Platform.OS !== 'ios') return { started: false, reason: 'ios_only' };
    let Location: typeof import('expo-location');
    try {
        Location = require('expo-location');
    } catch {
        return { started: false, reason: 'module_unavailable' };
    }
    try {
        defineTask();
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') return { started: false, reason: 'permission_denied' };
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status !== 'granted') return { started: false, reason: 'background_denied' };

        const { places } = await api.getPlaces();
        const regions = places
            .filter((p: any) => p.lat && p.lng)
            .slice(0, MAX_REGIONS)
            .map((p: any) => ({
                identifier: p.id,
                latitude: p.lat,
                longitude: p.lng,
                radius: p.radius_m || 150,
                notifyOnEnter: true,
                notifyOnExit: true,
            }));
        if (!regions.length) return { started: false, reason: 'no_resolved_places' };

        await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
        return { started: true };
    } catch {
        return { started: false, reason: 'error' };
    }
}

export async function stopGeofencing(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    try {
        const Location = require('expo-location');
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
    } catch {
        // already stopped or module unavailable
    }
}
