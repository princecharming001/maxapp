/**
 * toneCopy — deterministic, pure persona microcopy selector.
 *
 * The backend already owns the *coach voice* (persona_prompts.py) for chat and
 * notifications. This is the tiny client-side analogue: pick an on-screen string
 * that matches the user's chosen coach persona, without ever touching the backend
 * persona system. No I/O, no randomness, no time — same inputs → same output.
 *
 * Personas mirror AuthContext `coaching_tone`:
 *   default | hardcore (Goggins) | gentle (Big Daddy) | influencer (Clavicular)
 */

export type PersonaId = 'default' | 'hardcore' | 'gentle' | 'influencer';

export interface ToneVariants {
    /** Required fallback — used for `default` and any unknown/missing persona. */
    default: string;
    gentle?: string;
    hardcore?: string;
    influencer?: string;
}

/** Normalize an arbitrary persona-ish value to a known PersonaId (or 'default'). */
export function normalizePersonaId(personaId: unknown): PersonaId {
    const id = String(personaId ?? '').trim().toLowerCase();
    if (id === 'gentle' || id === 'hardcore' || id === 'influencer') return id;
    return 'default';
}

/**
 * Return the persona-flavored string, falling back to `default` whenever the
 * matching variant is absent or the persona is unknown. Pure + deterministic.
 */
export function toneCopy(personaId: unknown, variants: ToneVariants): string {
    const id = normalizePersonaId(personaId);
    if (id !== 'default') {
        const v = variants[id];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return variants.default;
}
