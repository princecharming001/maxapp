/**
 * Parse a referral code out of a deep link (RALPH_REFERRAL Phase 5).
 * Accepts: maxapp://referral/CODE, https://<host>/referral/CODE,
 * and either form with ?code=CODE / ?ref=CODE. Returns the uppercased code or
 * null. Pure + deterministic so it can be unit-tested without navigation.
 */
export function parseReferralCode(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    // Query param first (?code= / ?ref=).
    const q = url.match(/[?&](?:code|ref)=([^&#\s]+)/i);
    if (q && q[1]) return cleanCode(q[1]);
    // Path form: .../referral/<CODE>
    const p = url.match(/referral\/([^/?#\s]+)/i);
    if (p && p[1]) return cleanCode(p[1]);
    return null;
}

function cleanCode(raw: string): string | null {
    let s = raw;
    try {
        s = decodeURIComponent(raw);
    } catch {
        /* keep raw */
    }
    const code = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length ? code : null;
}
