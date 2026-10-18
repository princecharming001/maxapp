/**
 * One clock style in chat: "8:00 AM", "7:30 PM".
 *
 * The backend writes times as 24-hour "HH:MM" and the coach's prose mixes in
 * "8am" / "7:30pm", so one reply could read "16:15", "4pm" and "4:15 PM". The
 * chat renders assistant text through `normalizeChatTimes` and structured
 * time fields (plan card rows) through `formatTime12`.
 *
 * Pure and dependency-free (unit-tested in __tests__/chatTimes.test.ts).
 */

/** 0-23 h, 0-59 m → "7:30 PM". */
export function clock12(hours: number, minutes: number): string {
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
}

const SUFFIX_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i;
const H24_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * A structured time field → "7:30 PM". Accepts "19:30", "7:30", "7pm",
 * "7:30 p.m."; anything else (empty, "evening", a range) passes through.
 * A bare "H:MM" here is a data field, so it is read as 24-hour.
 */
export function formatTime12(value: unknown): string {
    const t = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (!t) return '';
    let m = SUFFIX_RE.exec(t);
    if (m) {
        const h = Number(m[1]);
        const min = m[2] ? Number(m[2]) : 0;
        if (h < 1 || h > 12 || min > 59) return t;
        const pm = m[3].toLowerCase() === 'p';
        return clock12((h % 12) + (pm ? 12 : 0), min);
    }
    m = H24_RE.exec(t);
    if (m) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (h > 23 || min > 59) return t;
        return clock12(h, min);
    }
    return t;
}

// Spans we never touch: fenced code, inline code, URLs.
const PROTECTED_RE = /```[\s\S]*?```|`[^`\n]*`|\bhttps?:\/\/[^\s)\]]+|\bwww\.[^\s)\]]+/gi;

// "8am", "8 am", "7:30pm", "7:30 p.m.", "11 PM". The hour must not be glued to
// a preceding digit/colon/word char (checked in the callback: no lookbehind,
// to stay safe on every JS engine the app runs on).
const SUFFIXED_RE = /(\d{1,2})(?::([0-5]\d))?\s?([ap])(\.?)m(\.?)(?![a-z0-9])/gi;
// "16:15", "07:00", "10:30" with no am/pm after it (checked in the callback).
const BARE_RE = /(\d{1,2}):([0-5]\d)(?![\d:])/g;
const AFTER_IS_SUFFIX_RE = /^\s?[ap]\.?m\b/i;

/** The token is part of something bigger ("T16:00", "1.10:30", "v2:30", "100am"). */
function gluedBefore(s: string, offset: number): boolean {
    return offset > 0 && /[\w:.\/]/.test(s[offset - 1]);
}

function normalizePlain(seg: string): string {
    // Only read a bare "10:30"/"11:00"/"12:15" as 24-hour when the text is
    // clearly in 24-hour style already (it has a leading-zero hour or 13-23
    // somewhere). Otherwise "lights out at 10:30" stays as written instead of
    // becoming 10:30 AM. Single-digit bare hours ("6:30") are always left alone:
    // the backend zero-pads, so those are the coach's own words.
    let twentyFourHourText = false;
    seg.replace(BARE_RE, (whole, hh: string, _mm: string, offset: number) => {
        if (gluedBefore(seg, offset)) return whole;
        if (AFTER_IS_SUFFIX_RE.test(seg.slice(offset + whole.length))) return whole;
        const h = Number(hh);
        if (hh.length === 2 && (hh[0] === '0' || (h >= 13 && h <= 23))) twentyFourHourText = true;
        return whole;
    });

    let out = seg.replace(SUFFIXED_RE, (whole, hh: string, mm: string | undefined, ap: string, dot1: string, dot2: string, offset: number, full: string) => {
        if (gluedBefore(full, offset)) return whole;
        const h = Number(hh);
        if (h < 1 || h > 12) return whole;
        const min = mm ? Number(mm) : 0;
        const label = clock12((h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0), min);
        // "at 5 a.m." closing a sentence: keep the sentence's full stop.
        const rest = full.slice(offset + whole.length);
        const endsSentence = !!dot1 && !!dot2 && (rest === '' || /^\s+[A-Z]/.test(rest) || /^\s*\n/.test(rest));
        // "7:30am." — that dot was the sentence's, not part of the token.
        if (!dot1) return label + dot2;
        return endsSentence ? `${label}.` : label;
    });

    out = out.replace(BARE_RE, (whole, hh: string, mm: string, offset: number, full: string) => {
        if (gluedBefore(full, offset)) return whole;
        // Already followed by AM/PM (e.g. we just wrote "4:15 PM").
        if (AFTER_IS_SUFFIX_RE.test(full.slice(offset + whole.length))) return whole;
        const h = Number(hh);
        const min = Number(mm);
        if (hh.length !== 2 || h > 23 || min > 59) return whole;
        const unambiguous = hh[0] === '0' || h >= 13;
        if (!unambiguous && !twentyFourHourText) return whole;
        return clock12(h, min);
    });
    return out;
}

/**
 * Rewrite every clock time in assistant prose to "8:00 AM" style. Code
 * blocks, inline code and URLs are left exactly as they are.
 */
export function normalizeChatTimes(text: string): string {
    if (!text || typeof text !== 'string' || !/\d/.test(text)) return text;
    let out = '';
    let last = 0;
    PROTECTED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROTECTED_RE.exec(text))) {
        out += normalizePlain(text.slice(last, m.index)) + m[0];
        last = m.index + m[0].length;
    }
    out += normalizePlain(text.slice(last));
    return out;
}
