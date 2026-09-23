import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const DRAFT_DIR = `${FileSystem.documentDirectory ?? ''}face-scan-draft`;
const META_KEY = '@max_face_scan_draft_meta_v1';
const PENDING_KEY = '@max_face_scan_pending_submit_v1';
const UPLOAD_FAILED_KEY = '@max_face_scan_upload_failed_v1';
// An in-flight scan upload + analysis resolves in well under this. A pending
// flag older than this is orphaned (recovery never cleared it after some edge
// case) and must not haunt the user forever — treat it as expired.
const PENDING_TTL_MS = 30 * 60 * 1000;
// Clock slack when deciding whether a server row belongs to THIS submit: the
// phone's clock and the server's can disagree by a little, and the row is
// stamped server-side after the multipart body has fully arrived.
const SUBMIT_MATCH_SLACK_MS = 60 * 1000;

type DraftMeta = {
    v: 1;
    userId: string;
    stepIndex: number;
    /** Which slots have a saved file on disk */
    has: [boolean, boolean, boolean];
};

export type PendingFaceScanSubmit = {
    userId: string;
    /** ISO timestamp of the Analyze tap — null only for a legacy flag. */
    at: string | null;
};

function slotUri(i: number): string {
    return `${DRAFT_DIR}/${i}.jpg`;
}

/**
 * Parse a server timestamp to epoch ms. The API serializes `created_at` from
 * a tz-aware column ("…+00:00"), but a naive ISO string (no zone) would be
 * read as LOCAL time by Date.parse — treat it as UTC so a comparison against
 * the phone's own clock can't drift by the timezone offset.
 */
export function parseServerDate(raw: unknown): number {
    if (typeof raw !== 'string' || !raw) return NaN;
    const s = raw.trim();
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    return Date.parse(hasZone ? s : `${s}Z`);
}

/**
 * Did a scan row (its server `created_at`) come from a submit flagged at
 * `pendingAt`? Recovery used to answer this with `first_scan_completed`,
 * which is true for every repeat scan — so a killed repeat upload was declared
 * a success, the photos were deleted and YESTERDAY's scan was shown as new.
 * Only a row created at or after the submit (minus clock slack) counts. A
 * legacy flag without a timestamp can't be matched — it's treated as landed,
 * exactly the old behaviour, so we never trap a user on a spinner over it.
 */
export function scanLandedAfterSubmit(
    createdAt: unknown,
    pendingAt: string | null | undefined,
    slackMs: number = SUBMIT_MATCH_SLACK_MS,
): boolean {
    if (!pendingAt) return true;
    const pendingMs = Date.parse(pendingAt);
    if (!Number.isFinite(pendingMs)) return true;
    const createdMs = parseServerDate(createdAt);
    if (!Number.isFinite(createdMs)) return false;
    return createdMs >= pendingMs - slackMs;
}

export async function setPendingFaceScanSubmit(userId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ userId, at: new Date().toISOString() }));
}

export async function clearPendingFaceScanSubmit(): Promise<void> {
    await AsyncStorage.removeItem(PENDING_KEY);
}

export async function getPendingFaceScanSubmit(): Promise<PendingFaceScanSubmit | null> {
    try {
        const raw = await AsyncStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as { userId?: string; at?: string };
        // TTL guard: a flag older than a plausible analysis window is orphaned;
        // clear it and report "nothing pending" so recovery doesn't loop on it.
        if (o.at) {
            const ageMs = Date.now() - new Date(o.at).getTime();
            // Unparseable timestamp (NaN) is treated as expired too — a corrupt
            // flag must not become immortal and defeat the orphan cleanup.
            if (!Number.isFinite(ageMs) || ageMs > PENDING_TTL_MS) {
                await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
                return null;
            }
        }
        if (typeof o.userId !== 'string') return null;
        return { userId: o.userId, at: typeof o.at === 'string' ? o.at : null };
    } catch {
        return null;
    }
}

// ── Funnel upload failure flag ──────────────────────────────────────────────
// In the V4 funnel the upload runs BEHIND the quiz (fire-and-forget). When it
// fails for good (three attempts, or a 4xx) the results gate had no way to
// learn that the row will never appear and sat on the analyzing spinner for
// two minutes before offering Retry/Back — neither of which reached the
// capture screen. The capture screen records the failure here; the gate polls
// it and fails fast into "Retake photos / Skip scan". User-scoped like the
// pending flag, same TTL.

export type FaceScanUploadFailure = { userId: string; message: string; at: string };

export async function setFaceScanUploadFailed(userId: string, message: string): Promise<void> {
    try {
        await AsyncStorage.setItem(
            UPLOAD_FAILED_KEY,
            JSON.stringify({ userId, message, at: new Date().toISOString() }),
        );
    } catch {
        /* best-effort — the gate's own timeout still applies */
    }
}

export async function clearFaceScanUploadFailed(): Promise<void> {
    await AsyncStorage.removeItem(UPLOAD_FAILED_KEY).catch(() => undefined);
}

/** The recorded failure for THIS user, or null. A stale/foreign entry is dropped. */
export async function getFaceScanUploadFailed(userId: string): Promise<FaceScanUploadFailure | null> {
    try {
        const raw = await AsyncStorage.getItem(UPLOAD_FAILED_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Partial<FaceScanUploadFailure>;
        const ageMs = o.at ? Date.now() - new Date(o.at).getTime() : NaN;
        if (!Number.isFinite(ageMs) || ageMs > PENDING_TTL_MS || o.userId !== userId) {
            await AsyncStorage.removeItem(UPLOAD_FAILED_KEY).catch(() => undefined);
            return null;
        }
        return {
            userId: o.userId,
            message: typeof o.message === 'string' ? o.message : '',
            at: o.at as string,
        };
    } catch {
        return null;
    }
}

/** Persist captured angles to app documents + metadata (survives app restart). */
export async function saveFaceScanDraft(userId: string, stepIndex: number, uris: (string | null)[]): Promise<void> {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
    await FileSystem.makeDirectoryAsync(DRAFT_DIR, { intermediates: true }).catch(() => undefined);

    const has: [boolean, boolean, boolean] = [false, false, false];

    for (let i = 0; i < 3; i++) {
        const u = uris[i];
        const dest = slotUri(i);
        if (!u) {
            const info = await FileSystem.getInfoAsync(dest);
            if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
            continue;
        }
        if (u === dest) {
            const info = await FileSystem.getInfoAsync(dest);
            if (info.exists) {
                has[i] = true;
                continue;
            }
        }
        await FileSystem.copyAsync({ from: u, to: dest });
        has[i] = true;
    }

    const meta: DraftMeta = { v: 1, userId, stepIndex, has };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function loadFaceScanDraft(userId: string): Promise<{ stepIndex: number; uris: (string | null)[] } | null> {
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return null;
    try {
        const raw = await AsyncStorage.getItem(META_KEY);
        if (!raw) return null;
        const meta = JSON.parse(raw) as DraftMeta;
        if (meta.v !== 1 || meta.userId !== userId) return null;

        const uris: (string | null)[] = [null, null, null];
        for (let i = 0; i < 3; i++) {
            if (!meta.has?.[i]) continue;
            const p = slotUri(i);
            const info = await FileSystem.getInfoAsync(p);
            if (info.exists) uris[i] = p;
        }
        return { stepIndex: meta.stepIndex, uris };
    } catch {
        return null;
    }
}

export async function clearFaceScanDraft(): Promise<void> {
    await AsyncStorage.removeItem(META_KEY);
    if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;
    const info = await FileSystem.getInfoAsync(DRAFT_DIR);
    if (info.exists) await FileSystem.deleteAsync(DRAFT_DIR, { idempotent: true });
}
