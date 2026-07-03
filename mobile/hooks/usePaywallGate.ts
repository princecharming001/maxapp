/**
 * usePaywallGate — the free-tier action gate.
 *
 * Free users (isFreeTier) can SEE the app but not USE it: call `gate()` at the
 * top of any action handler (start a plan, send a chat message, …). For an
 * unpaid user it routes to the Payment screen and returns true (= blocked);
 * for paid / scan-comp users it returns false and the handler proceeds.
 *
 *   const gate = usePaywallGate();
 *   const onPress = () => {
 *       if (gate()) return;
 *       …the real action…
 *   };
 *
 * Client-side UX only — paid endpoints stay gated server-side regardless.
 */
import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { track } from '../lib/analytics';
import { navigationRef } from '../lib/navigationRef';

export function usePaywallGate(): (source?: string) => boolean {
    const { isPaid, isScanUser } = useAuth();

    return useCallback(
        (source?: string) => {
            if (isPaid || isScanUser) return false;
            track('paywall_view', { from: source ?? 'gate' });
            if (navigationRef.isReady()) {
                (navigationRef as any).navigate('Payment');
            }
            return true;
        },
        [isPaid, isScanUser],
    );
}
