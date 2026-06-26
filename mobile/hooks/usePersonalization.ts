/**
 * usePersonalization — the single safe source of on-screen personalization.
 *
 * Exposes only *safe, derived* values from AuthContext (name, time-of-day
 * greeting, chosen coach persona, goals, scan archetype, streak, experience).
 * It NEVER reads constraints (conditions/injuries/medications) or inferred
 * negatives — see lib/personalization.ts for the guardrails. Everything is
 * optional and falls back to undefined → generic copy, so cold start renders
 * exactly like today.
 */

import { useMemo } from 'react';

import { useAuth } from '../context/AuthContext';
import {
    derivePersonalization,
    type Personalization,
    type PersonalizationUserLike,
} from '../lib/personalization';

export type { Personalization } from '../lib/personalization';

export function usePersonalization(): Personalization {
    const { user } = useAuth();
    // Recompute when the user identity/fields change. The hour is read once per
    // mount; a long-lived screen crossing a time boundary is acceptable (the
    // greeting is cosmetic) and keeps this deterministic within a render tree.
    const hour = new Date().getHours();
    return useMemo(
        () => derivePersonalization(user as PersonalizationUserLike | null, hour),
        [user, hour],
    );
}
