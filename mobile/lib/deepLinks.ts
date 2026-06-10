/**
 * Typed deep-link table (single module - spec 3.1).
 *
 * Every push/notification tap routes through here so the mapping from
 * "kind of link" to "where the app goes" lives in ONE place. Back always
 * returns to the tab root, never exits the app: we navigate to the tab
 * first, then push any detail on top.
 */
import { navigationRef } from './navigationRef';

export type DeepLink =
    | { kind: 'task_nudge'; taskId?: string }
    | { kind: 'weekly_review' }
    | { kind: 'marketplace_item'; itemId: string }
    | { kind: 'coach' }
    | { kind: 'you' };

// The shared ref is untyped (no RootParamList); route names here are the
// stable contract (MasterScheduleTab / Explore / Chat / YouTab under Main).
const nav = navigationRef as unknown as {
    isReady: () => boolean;
    navigate: (name: string, params?: object) => void;
};

export function openDeepLink(link: DeepLink): boolean {
    if (!nav.isReady()) return false;
    switch (link.kind) {
        case 'task_nudge':
            // Today with the task focused (focus param consumed by Today v2).
            nav.navigate('Main', {
                screen: 'MasterScheduleTab',
                params: link.taskId ? { focusTaskId: link.taskId } : undefined,
            });
            return true;
        case 'weekly_review':
            nav.navigate('WeeklyReview');
            return true;
        case 'marketplace_item':
            nav.navigate('Main', { screen: 'Explore', params: { itemId: link.itemId } });
            return true;
        case 'coach':
            nav.navigate('Main', { screen: 'Chat' });
            return true;
        case 'you':
            nav.navigate('Main', { screen: 'YouTab' });
            return true;
        default:
            return false;
    }
}

/** Parse the `link` payload APNs custom data carries into a typed DeepLink. */
export function parseDeepLink(data: Record<string, unknown> | undefined): DeepLink | null {
    const kind = String(data?.link_kind ?? '');
    switch (kind) {
        case 'task_nudge':
            return { kind, taskId: data?.task_id ? String(data.task_id) : undefined };
        case 'weekly_review':
            return { kind };
        case 'marketplace_item':
            return data?.item_id ? { kind, itemId: String(data.item_id) } : null;
        case 'coach':
        case 'you':
            return { kind };
        default:
            return null;
    }
}
