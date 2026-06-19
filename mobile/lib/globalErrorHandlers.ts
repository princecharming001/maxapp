import AsyncStorage from '@react-native-async-storage/async-storage';
import { BOOT_RESTORED_KEYS } from './resilienceKeys';

/**
 * Installs process-level safety nets for errors that React error boundaries
 * CANNOT catch — uncaught errors in async callbacks, event handlers, timers and
 * unhandled promise rejections. Without this, such an error in production can
 * tear down the JS context silently (white screen) and, if it recurs at boot,
 * crash-loop the app.
 *
 * What it does:
 *  - Wraps the global error handler (ErrorUtils) so every uncaught error is
 *    logged and, on a FATAL error (the JS context is about to be torn down and
 *    relaunched), the boot-restored blobs are cleared so the next launch can't
 *    immediately crash again on the same poisoned state.
 *  - Keeps the prior handler in the chain so the dev red-box / native crash
 *    reporting still fires.
 *
 * Safe to call multiple times (idempotent). Call once, as early as possible.
 */
let installed = false;

export function installGlobalErrorHandlers(): void {
    if (installed) return;
    installed = true;

    const g = global as unknown as {
        ErrorUtils?: {
            getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
            setGlobalHandler?: (h: (error: unknown, isFatal?: boolean) => void) => void;
        };
    };

    const EU = g.ErrorUtils;
    if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
        const prior = EU.getGlobalHandler();
        EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
            try {
                const msg = (error as Error)?.message ?? String(error);
                // eslint-disable-next-line no-console
                console.error(`[GlobalError]${isFatal ? ' (fatal)' : ''}`, msg);
            } catch {
                /* never throw from the handler */
            }
            if (isFatal) {
                // Fire-and-forget; the context may die before this resolves, but
                // a force-kill leaves storage intact and the next clean launch
                // still benefits.
                AsyncStorage.multiRemove(BOOT_RESTORED_KEYS).catch(() => undefined);
            }
            // Preserve default behaviour (dev red box / crash reporter).
            try {
                prior?.(error, isFatal);
            } catch {
                /* ignore */
            }
        });
    }

    // Unhandled promise rejections: surface them in logs rather than letting
    // them vanish. RN/Hermes exposes a rejection-tracking hook via the bundled
    // `promise` polyfill; guard everything so a missing API is a no-op.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tracking = require('promise/setimmediate/rejection-tracking');
        if (tracking?.enable) {
            tracking.enable({
                allRejections: true,
                onUnhandled: (id: number, error: unknown) => {
                    try {
                        const msg = (error as Error)?.message ?? String(error);
                        // eslint-disable-next-line no-console
                        console.warn('[UnhandledRejection]', id, msg);
                    } catch {
                        /* ignore */
                    }
                },
                onHandled: () => undefined,
            });
        }
    } catch {
        /* rejection tracking unavailable — non-fatal */
    }
}
