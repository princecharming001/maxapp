/**
 * Turn any thrown error into copy a user can act on.
 *
 * Transport and library strings ("Request failed with status code 500",
 * "Network Error", a pydantic 422 array, a Python traceback in a 5xx detail)
 * never reach the screen. A short, plain-text 4xx `detail` from our own
 * backend does — those are written for users.
 */
export function userFacingError(
    e: unknown,
    fallback = 'Something went wrong. Please try again.',
): string {
    const err = e as {
        response?: { status?: number; data?: { detail?: unknown } };
        code?: string;
        message?: string;
    } | null | undefined;
    const status = err?.response?.status;
    const d = err?.response?.data?.detail;
    const detail =
        typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x?.msg).filter(Boolean).join('\n')
              : '';

    if (status === 402) return "Your subscription isn't active. Subscribe to keep using Max.";
    if (status === 401 || status === 403) return "You're signed out. Sign in again to continue.";
    if (status === 408 || status === 504) return 'That took too long. Please try again.';
    if (status === 429) return 'Too many requests right now. Give it a minute and try again.';
    if (status && status >= 500) return 'Max is having trouble right now. Please try again in a moment.';
    if (status && status >= 400 && detail) {
        const looksInternal = /traceback|exception|error code|\bnull\b|undefined|\{|\}/i.test(detail);
        if (detail.length <= 220 && !looksInternal) return detail;
    }
    const msg = String(err?.message || '');
    if (
        err?.code === 'ECONNABORTED' ||
        /network error|timeout|timed out|failed to fetch|socket|econnrefused|enotfound/i.test(msg)
    ) {
        return "Couldn't reach Max. Check your connection and try again.";
    }
    return fallback;
}
