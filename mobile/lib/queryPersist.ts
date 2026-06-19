import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, RESILIENCE_BUSTER } from './resilienceKeys';

/**
 * Lightweight React Query cache persistence built on the library's own
 * dehydrate/hydrate (no extra native deps). Goal: a cold start (app killed,
 * phone rebooted, OS evicted the app) shows the user's LAST-KNOWN data
 * immediately instead of an empty/loading/error screen — then revalidates in
 * the background.
 *
 * Design choices:
 *  - Only SUCCESSFUL queries for the core app-shell data are persisted
 *    (schedules, maxes). Forum threads + chat are intentionally excluded: they
 *    are large, change often, have their own loading UX, and chat content
 *    shouldn't sit in unencrypted AsyncStorage.
 *  - A buster + 24h maxAge guard discards stale/incompatible blobs on read so
 *    old data never hydrates into new components and crashes (bump
 *    RESILIENCE_BUSTER when a persisted shape changes).
 *  - Writes are throttled; a corrupt/oversized blob degrades to "start fresh",
 *    never a crash.
 */

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep restored cache at most 24h
const THROTTLE_MS = 1500;

// Persist only these query-key roots — small, central, worth showing instantly
// on cold start. Everything else (forums, chat, search) loads normally.
const PERSIST_KEY_ROOTS = new Set<string>([
    'maxes',
    'schedules',
    'activeSchedules',
    'maxx',
    'maxxSchedule',
]);

type PersistedShape = { buster: string; ts: number; state: unknown; userId?: string };

// The user the cache currently belongs to, set by AuthContext when the user
// resolves. Stamped onto every write so a different user's cold start can
// detect + drop a stale blob (see getPersistedCacheUserId).
let currentUserId: string | null = null;
export function setPersistUserId(id: string | null): void {
    currentUserId = id;
}

/** The userId stamped on the persisted blob (or null). Lets AuthContext drop a
 *  blob that belongs to a different user before their screens render. */
export async function getPersistedCacheUserId(): Promise<string | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.queryCache);
        if (!raw) return null;
        const p = JSON.parse(raw) as PersistedShape;
        return typeof p?.userId === 'string' ? p.userId : null;
    } catch {
        return null;
    }
}

/** Wipe the persisted cache blob. Call on logout / auth-lost so the next user's
 *  cold start can't hydrate the previous user's data (queryClient.clear() only
 *  empties memory, not this AsyncStorage blob). */
export async function clearPersistedQueryCache(): Promise<void> {
    try {
        await AsyncStorage.removeItem(STORAGE_KEYS.queryCache);
    } catch {
        /* ignore */
    }
}

/** Seed the in-memory cache from the persisted blob. Call ONCE at boot, before
 *  the provider tree mounts, and await it. Always resolves (never throws). */
export async function hydrateQueryClient(client: QueryClient): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.queryCache);
        if (!raw) return;
        let parsed: PersistedShape | null = null;
        try {
            parsed = JSON.parse(raw) as PersistedShape;
        } catch {
            parsed = null;
        }
        const fresh =
            !!parsed &&
            parsed.buster === RESILIENCE_BUSTER &&
            typeof parsed.ts === 'number' &&
            Date.now() - parsed.ts <= MAX_AGE_MS;
        if (!fresh) {
            await AsyncStorage.removeItem(STORAGE_KEYS.queryCache).catch(() => undefined);
            return;
        }
        hydrate(client, parsed!.state);
    } catch {
        // Any failure → start with an empty cache rather than blocking boot.
        await AsyncStorage.removeItem(STORAGE_KEYS.queryCache).catch(() => undefined);
    }
}

/** Begin persisting cache changes (throttled). Returns an unsubscribe that also
 *  flushes a final write. Start this only AFTER hydrateQueryClient resolves so
 *  an early empty snapshot can't clobber the stored blob before it's read. */
export function startQueryPersistence(client: QueryClient): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;

    const flush = () => {
        timer = null;
        if (!dirty) return;
        dirty = false;
        try {
            const state = dehydrate(client, {
                shouldDehydrateQuery: (q) =>
                    q.state.status === 'success' &&
                    PERSIST_KEY_ROOTS.has(String((q.queryKey as unknown[])?.[0])),
                // Never persist mutations. Default behaviour serializes PAUSED
                // mutations, which would replay on the next cold start (possibly
                // for a different user) — we only ever want the whitelisted
                // read queries in the blob.
                shouldDehydrateMutation: () => false,
            });
            const payload: PersistedShape = {
                buster: RESILIENCE_BUSTER,
                ts: Date.now(),
                state,
                userId: currentUserId ?? undefined,
            };
            AsyncStorage.setItem(STORAGE_KEYS.queryCache, JSON.stringify(payload)).catch(
                () => undefined,
            );
        } catch {
            /* serialization/storage failure — skip this write, try again next change */
        }
    };

    const schedule = () => {
        dirty = true;
        if (timer) return;
        timer = setTimeout(flush, THROTTLE_MS);
    };

    const unsub = client.getQueryCache().subscribe(schedule);
    return () => {
        unsub();
        if (timer) clearTimeout(timer);
        flush();
    };
}
