import { QueryClient } from '@tanstack/react-query';

/** Shared server-state cache: avoids duplicate maxes / schedule fetches across Home + Master Schedule. */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // 5min staleTime: most screens don't need sub-minute freshness, and this
            // cuts focus-refetch storms when users tab between screens.
            staleTime: 5 * 60 * 1000,
            // 24h GC so persisted/restored cache (lib/queryPersist, maxAge 24h)
            // isn't evicted from memory before it can be re-shown — gcTime must
            // be >= the persister's maxAge or restored data gets dropped.
            gcTime: 24 * 60 * 60 * 1000,
            // Don't retry auth errors (401/403) — the axios interceptor already tried
            // a refresh; retrying here just multiplies the request storm when the
            // session is permanently dead.
            retry: (failureCount, error) => {
                const status = (error as any)?.response?.status;
                if (status === 401 || status === 403) return false;
                return failureCount < 2;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            // Refetch on mount IF data is stale. With staleTime=5min the
            // cache still trumps for fresh data, so this doesn't cause a
            // refetch storm — but it does mean that screens (Master
            // Schedule, Home) which were invalidated while the user was
            // chatting actually pick up the new data the moment they're
            // remounted, instead of showing stale state until manual pull.
            refetchOnMount: true,
            // Foreground revalidation: focusManager is wired to AppState in
            // App.tsx, so on RN this fires ONLY when the whole app returns to
            // the foreground (not on screen/tab switches — those don't blur the
            // app), and only refetches queries already past staleTime (5min).
            // That self-heals data after a background/kill without refetch
            // storms.
            refetchOnWindowFocus: true,
            // RN: also refetch when the network reconnects.
            refetchOnReconnect: true,
        },
    },
});

export const queryKeys = {
    maxes: ['maxes'] as const,
    schedulesActiveFull: ['schedules', 'active', 'full'] as const,
    maxx: (id: string) => ['maxx', id] as const,
    maxxSchedule: (id: string) => ['maxxSchedule', id] as const,
    activeSchedulesSummary: ['activeSchedules', 'summary'] as const,
    /** Forums channel list; `q` is trimmed search (empty = full list). */
    channels: (q: string) => ['channels', q] as const,
    forumV2Categories: ['forumV2', 'categories'] as const,
    forumV2Subforums: (categoryId: string | null) => ['forumV2', 'subforums', categoryId ?? 'all'] as const,
    forumV2Threads: (subforumId: string, sort: string, q: string, tag: string) =>
        ['forumV2', 'threads', subforumId, sort, q, tag] as const,
    forumV2Posts: (threadId: string, sort: string) => ['forumV2', 'posts', threadId, sort] as const,
    forumV2Search: (q: string) => ['forumV2', 'search', q] as const,
    forumV2Notifications: (unreadOnly: boolean) => ['forumV2', 'notifications', unreadOnly ? 'unread' : 'all'] as const,
    chatHistory: ['chat', 'history'] as const,
    chatHistoryByConv: (conversationId: string | null) =>
        ['chat', 'history', conversationId ?? 'default'] as const,
    chatConversations: ['chat', 'conversations'] as const,
    profileProgressPhotos: ['profile', 'progressPhotos'] as const,
    profileAchievements: ['profile', 'achievements'] as const,
    profileScanHistory: ['profile', 'scanHistory'] as const,
};
