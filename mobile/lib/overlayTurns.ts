/**
 * Overlay turn-taking for Home's full-screen moments.
 *
 * The badge celebration (an RN Modal hosted app-wide) and the reminders primer
 * (an in-screen card on Home) used to be decided independently, so a brand-new
 * user's first visit showed both at once: "First Steps +10 XP" over the
 * "want a ping at 9:30?" card. Each surface now publishes whether it is up (or
 * about to be), and each waits for the other.
 *
 * A tiny external store (no React context, so the app-level host and the Home
 * screen can share it without a provider) read via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';

export type OverlayName = 'celebration' | 'primer';

const state: Record<OverlayName, boolean> = { celebration: false, primer: false };
const listeners = new Set<() => void>();

export function setOverlayUp(name: OverlayName, up: boolean): void {
    if (state[name] === up) return;
    state[name] = up;
    listeners.forEach((l) => {
        try {
            l();
        } catch {
            /* a listener must never break the others */
        }
    });
}

export function isOverlayUp(name: OverlayName): boolean {
    return state[name];
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** True while the named overlay is up or queued. */
export function useOverlayUp(name: OverlayName): boolean {
    return useSyncExternalStore(subscribe, () => state[name], () => false);
}

/** Tests only. */
export function __resetOverlayTurns(): void {
    state.celebration = false;
    state.primer = false;
    listeners.clear();
}
