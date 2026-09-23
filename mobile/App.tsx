import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Platform, type AppStateStatus, type ViewStyle } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { CommonActions, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getFlag } from './constants/featureFlags';
import { parseReferralCode } from './lib/referralLink';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './lib/queryClient';
import { FeatureFlagsProvider } from './constants/featureFlags';
import { hydrateQueryClient, startQueryPersistence } from './lib/queryPersist';
import { ensureFirstRunClean } from './lib/firstRunGuard';
import { checkAndApplyUpdate } from './lib/otaUpdates';
import { installGlobalErrorHandlers } from './lib/globalErrorHandlers';
import AppErrorBoundary from './components/AppErrorBoundary';
import { loadRestoredTab, persistActiveTab, extractActiveTab } from './lib/navState';
import { navigationRef } from './lib/navigationRef';
import { consumePostPayPending } from './lib/postPayNav';
import { colors } from './theme/dark';
import MaxLoadingView from './components/MaxLoadingView';
import { StripeProviderGate } from './components/StripeProviderGate';
import {
    claimOtherAccountPrompt,
    connect as iapConnect,
    purchaseCopy,
    reconcileOwnedSubscriptions,
    setIapUser,
    subscribeEntitlementGranted,
    warmProducts,
} from './lib/iapTransactions';
import { consumePostLogoutRoute } from './lib/postLogoutNav';
import { signOutToLogin } from './lib/signOutToLogin';
import { Alert, InAppAlertHost } from './components/InAppAlert';
import DevDrawer from './components/DevDrawer';
import api from './services/api';
import { useFlag } from './constants/featureFlags';
import {
    getPendingFaceScanSubmit,
    clearPendingFaceScanSubmit,
    clearFaceScanDraft,
} from './lib/faceScanDraft';
// Side-effect import: registers expo-notifications handler at cold-start so
// remote pushes arriving while the app is foregrounded show a banner.
import './services/localScheduleNotifications';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Install process-level crash safety nets ASAP (before any provider mounts) so
// uncaught async errors / unhandled rejections can't silently white-screen the
// app or crash-loop it at boot. Idempotent.
installGlobalErrorHandlers();



// Routes a push notification is allowed to deep-link into. Keep this an
// explicit allow-list — we never navigate to an arbitrary route name handed
// to us inside a notification payload. Mirrors backend
// services/notification_copy.DEEP_LINK_ROUTES so every category's push opens
// the right screen (task -> TaskGuide, milestone -> Achievements, etc.).
const NOTIFICATION_DEEP_LINK_ROUTES = new Set<string>([
    'Home',
    'TaskGuide',
    'Achievements',
    'Profile',
    'ProgressArchive',
    // Creator platform: a "new update" push opens that creator's feed; an
    // application decision opens the studio; community/course pushes open the
    // member home. Params still come only from the payload's params object and
    // route names stay allow-listed.
    'CreatorFeed',
    'CreatorStudio',
    'CreatorMaxxHome',
]);

function AppNavigator() {
    const { isAuthenticated, isPaid, refreshUser, user, isScanUser, logout, isAnonymous } = useAuth();
    const faceScanEnabled = useFlag('faceScan');
    const navRef = navigationRef;
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const recoveryRunning = useRef(false);
    // A deep-link target that arrived from a notification tap before the
    // navigator (or the stack screen it points at) was mounted — flushed once
    // navigation is ready. Covers the cold-start-from-tap case.
    const pendingDeepLinkRef = useRef<{ route: string; params?: Record<string, unknown> } | null>(null);

    // Flush a deferred deep link. ONE implementation, used by every flush site:
    // this previously existed twice and the copies diverged — the NavigationContainer
    // onReady copy passed the raw ref object ({ route, params }) to navigate(),
    // which React Navigation rejects ("You need to specify name or key when calling
    // navigate() with an object"). onReady runs BEFORE the parent effect, so every
    // cold start from a notification tap threw before the app rendered.
    const flushPendingDeepLink = useCallback(() => {
        const pending = pendingDeepLinkRef.current;
        if (!pending || !navRef.isReady()) return;
        // Only flush when the MOUNTED stack actually has the target route —
        // dispatching into the wrong stack (e.g. ReferralCode while the guest
        // stack is up) is a dropped action AND loses the parked link. Keep it
        // parked instead; this re-runs on every auth/paid flip, which is
        // exactly when the right stack mounts.
        const names: string[] = (navRef.getRootState()?.routeNames as string[] | undefined) ?? [];
        if (!names.includes(pending.route)) return;
        navRef.dispatch(CommonActions.navigate({ name: pending.route, params: pending.params }));
        pendingDeepLinkRef.current = null;
    }, [navRef]);

    /** Navigate now if the mounted stack has the route, else park for the flush. */
    const navigateOrPark = useCallback((routeName: string, params?: Record<string, unknown>) => {
        const names: string[] = navRef.isReady()
            ? ((navRef.getRootState()?.routeNames as string[] | undefined) ?? [])
            : [];
        if (names.includes(routeName)) {
            navRef.dispatch(CommonActions.navigate({ name: routeName, params }));
        } else {
            pendingDeepLinkRef.current = { route: routeName, params };
        }
    }, [navRef]);

    const goToNotificationData = useCallback(
        (data: unknown) => {
            const d = (data ?? {}) as { route?: unknown; params?: unknown };
            const route = d.route;
            if (typeof route !== 'string' || !NOTIFICATION_DEEP_LINK_ROUTES.has(route)) return;
            const params =
                d.params && typeof d.params === 'object' ? (d.params as Record<string, unknown>) : undefined;
            // Report the tap so the backend's adaptive backoff counts an "open".
            void api.notificationOpened();
            navigateOrPark(route, params);
        },
        [navigateOrPark],
    );

    // Referral deep links (maxapp://referral/<CODE>): pre-fill the code on the
    // paywall. No-op when the `referrals` flag is OFF, so it's inert today.
    useEffect(() => {
        if (!getFlag('referrals')) return;
        let mounted = true;
        const handle = (url: string | null) => {
            const code = parseReferralCode(url);
            if (!code) return;
            const params = { referralCode: code };
            // ReferralCode (not Payment): the paywall no longer hosts the code
            // field — the dedicated page pre-fills + auto-validates initialCode.
            // navigateOrPark: a logged-out user's guest stack doesn't register
            // ReferralCode, so navigating would silently drop the action AND
            // lose the code — park it until the funnel stack mounts instead.
            navigateOrPark('ReferralCode', params);
        };
        const sub = Linking.addEventListener('url', (e) => mounted && handle(e.url));
        void Linking.getInitialURL().then((u) => mounted && handle(u)).catch(() => undefined);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, [navigateOrPark]);

    // Home Screen widget deep links (cannon://today | cannon://home | bare
    // cannon://): open the app to the Home tab. Handles warm foreground taps,
    // cold starts (nav not ready yet), and the first-launch auth flip.
    const widgetHomePendingRef = useRef(false);
    const flushWidgetHome = useCallback(() => {
        if (!widgetHomePendingRef.current) return;
        if (isAuthenticated && navRef.isReady()) {
            navRef.dispatch(CommonActions.navigate({ name: 'Home' }));
            widgetHomePendingRef.current = false;
        }
    }, [isAuthenticated, navRef]);
    useEffect(() => {
        let mounted = true;
        const handle = (url: string | null) => {
            if (!mounted || !url) return;
            if (/^cannon:\/\/(today|home)?\/?$/i.test(url.trim())) {
                widgetHomePendingRef.current = true;
                flushWidgetHome();
            }
        };
        const sub = Linking.addEventListener('url', (e) => handle(e.url));
        void Linking.getInitialURL().then(handle).catch(() => undefined);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, [flushWidgetHome]);
    // Re-attempt once auth resolves — on a cold start the Home tree can mount
    // after the widget URL has already arrived.
    useEffect(() => {
        flushWidgetHome();
    }, [isAuthenticated, flushWidgetHome]);

    // Apply pending OTA updates promptly: check on mount and whenever the app
    // returns to the foreground, then hot-swap the new JS bundle. Without this,
    // fallbackToCacheTimeout:0 means a shipped update only applies on the *next*
    // cold start (effectively two relaunches). Guarded against dev/web/loops.
    useEffect(() => {
        void checkAndApplyUpdate(true);
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (next === 'active') void checkAndApplyUpdate();
        });
        return () => sub.remove();
    }, []);

    // Clear badge count when the app enters the foreground and wire up
    // notification-tap deep-linking.
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        void Notifications.setBadgeCountAsync(0).catch(() => undefined);
        // Heartbeat so the server suppresses pushes while the app is in use
        // (foreground suppression). Best-effort; ignored for signed-out users.
        const pingActivity = () => {
            if (isAuthenticated) void api.notificationActivity();
        };
        pingActivity();
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (next === 'active') {
                void Notifications.setBadgeCountAsync(0).catch(() => undefined);
                pingActivity();
            }
        });
        return () => sub.remove();
    }, [isAuthenticated]);

    // Notification-tap deep-linking: send the user where the push points. The
    // bedtime progress-pic push carries { route: 'ProgressArchive' } so a tap
    // drops them straight into their archive to add tonight's photo.
    useEffect(() => {
        let mounted = true;
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            goToNotificationData(response?.notification?.request?.content?.data);
        });
        // Cold-start: the app was launched by tapping a notification while it
        // wasn't running. The listener above won't fire for that tap.
        void Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (mounted) goToNotificationData(response?.notification?.request?.content?.data);
            })
            .catch(() => undefined);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, [goToNotificationData]);

    // Flush a deferred deep-link once the navigator and its target stack are
    // mounted. Re-runs as auth/paid state resolves (the ProgressArchive screen
    // only exists in the paid stack), which is exactly when a cold-start tap
    // becomes navigable.
    useEffect(() => {
        flushPendingDeepLink();
    }, [isAuthenticated, isPaid, user?.id, flushPendingDeepLink]);

    // Post-purchase routing: when a verified purchase flips isPaid, the paid
    // stack remounts and we drop the user straight into the post-pay flow
    // (FaceScanResults). Driven by a one-shot flag set in the IAP success
    // handler — NOT the isPaid transition alone — so existing subscribers
    // opening the app are never sent here. Retries briefly while the freshly
    // remounted paid stack finishes mounting its FaceScanResults route.
    useEffect(() => {
        if (!isPaid) return;
        if (!consumePostPayPending()) return;   // one-shot; only right after a purchase
        if (!faceScanEnabled) return;            // face-scan kill switch
        let tries = 0;
        const go = () => {
            if (navRef.isReady()) {
                // Funnel V4 buys MID-funnel (onboarding incomplete), so the
                // mounted stack can be the funnel stack — which has no 'Main'.
                // FaceScanResults' postPay exit resets to 'Main'; dispatching it
                // there makes that reset a silent no-op and strands the user on
                // an unescapable spinner over the account form. Only dispatch
                // when the PAID stack (with 'Main') is actually mounted;
                // otherwise HomeScreen's post_subscription_onboarding redirect
                // runs the reveal after onboarding completes and the stack
                // remounts.
                const names: string[] = (navRef.getRootState()?.routeNames as string[] | undefined) ?? [];
                if (!names.includes('Main') || !names.includes('FaceScanResults')) return;
                navRef.dispatch(CommonActions.navigate({ name: 'FaceScanResults', params: { postPay: true } }));
            } else if (tries++ < 20) {
                setTimeout(go, 150);
            }
        };
        go();
    }, [isPaid, faceScanEnabled, navRef]);

    // The IAP service is keyed by account: verifies are memoised per
    // (user, transaction), so switching accounts re-verifies everything and a
    // new account gets an immediate, unthrottled entitlement sweep.
    useEffect(() => {
        setIapUser(user?.id ?? null);
    }, [user?.id]);

    // Open the StoreKit connection for EVERY signed-in iOS user, paid or not,
    // so the app-level transaction listener is live from launch. Background
    // renewals and unfinished replays then get verified and finished — which
    // also refreshes the server's end date when a renewal notification was
    // missed. Before this only the paywall listened: paid users' renewals
    // were never finished (replayed every launch), and a transaction emitted
    // while nobody listened was recorded-and-dropped by the native dedupe —
    // the root of the "Duplicate purchase update skipped" paywall error.
    useEffect(() => {
        if (Platform.OS !== 'ios' || !isAuthenticated) return;
        void iapConnect().then((ok) => {
            // Warm the paywall's product metadata for anyone who might see it
            // (unpaid boots straight into it): the first tap must never wait.
            if (ok && !isPaid) void warmProducts();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    // A transaction the app-level listener verified (renewal, launch replay,
    // an entitlement adopted onto this account): refresh so isPaid reflects
    // it. The paywall owns the ARMED case — it sets the post-pay flag before
    // refreshing, and a refresh from here first would race that.
    useEffect(() => {
        return subscribeEntitlementGranted((_r, ctx) => {
            if (ctx.armed) return;
            void refreshUser().catch(() => undefined);
        });
    }, [refreshUser]);

    // Entitlement failsafe: an authenticated-but-unpaid user whose Apple ID
    // already OWNS an active subscription (new phone, reinstall, second
    // account) would otherwise be stranded at the paywall — StoreKit refuses
    // to re-sell and nothing reconciles. Sweep the Apple ID's entitlements on
    // launch, on every foreground and on every account change while unpaid:
    //   granted        → refreshUser flips isPaid, navigator remounts into Main
    //                    ("if I have a plan, take me home");
    //   other account  → the plan lives on a different Max account: offer to
    //                    sign in ("…or ask me to log in"), once per account.
    useEffect(() => {
        if (Platform.OS !== 'ios' || !isAuthenticated || isPaid || !user?.id) return;
        let mounted = true;
        const heal = async () => {
            try {
                const o = await reconcileOwnedSubscriptions();
                if (!mounted) return;
                if (o.granted) {
                    await refreshUser();
                    return;
                }
                if (o.otherAccount && claimOtherAccountPrompt()) {
                    Alert.alert(
                        purchaseCopy.otherAccountTitle,
                        o.detail || purchaseCopy.otherAccount,
                        [
                            { text: 'Not now', style: 'cancel' },
                            { text: 'Sign in', onPress: () => { void signOutToLogin(logout); } },
                        ],
                    );
                }
            } catch {
                /* silent — retried on next foreground */
            }
        };
        void heal();
        const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
            if (s === 'active') void heal();
        });
        return () => {
            mounted = false;
            sub.remove();
        };
    }, [isAuthenticated, isPaid, user?.id, refreshUser, logout]);

    // A legacy anonymous account that finished onboarding before paying
    // (pre-V4 funnel) used to be forwarded to CreateAccount at the paywall;
    // that branch was removed (it let anon users skip the paywall). Once
    // such a user pays, the paid stack mounts with them still credential-
    // less — nothing would ever ask them to save their login. Send them to
    // CreateAccount once the paid stack is up. One-shot per account.
    const legacyClaimPromptedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!isPaid || !isAnonymous || !user?.id || user.onboarding?.completed !== true) return;
        if (legacyClaimPromptedFor.current === user.id) return;
        let tries = 0;
        const go = () => {
            if (legacyClaimPromptedFor.current === user.id) return;
            if (navRef.isReady()) {
                const names: string[] = (navRef.getRootState()?.routeNames as string[] | undefined) ?? [];
                if (names.includes('Main') && names.includes('CreateAccount')) {
                    legacyClaimPromptedFor.current = user.id;
                    navRef.dispatch(CommonActions.navigate({ name: 'CreateAccount' }));
                    return;
                }
            }
            if (tries++ < 30) setTimeout(go, 200);
        };
        // Let the post-pay reveal (if any) dispatch first.
        setTimeout(go, 400);
    }, [isPaid, isAnonymous, user?.id, user?.onboarding?.completed, navRef]);

    // "Sign in" from inside the authenticated funnel (which has no Login
    // route): the logout has remounted the container onto the guest stack;
    // forward to the requested route once that stack is mounted and ready.
    useEffect(() => {
        if (isAuthenticated) return;
        const route = consumePostLogoutRoute();
        if (!route) return;
        let tries = 0;
        const go = () => {
            if (navRef.isReady()) {
                const names: string[] = (navRef.getRootState()?.routeNames as string[] | undefined) ?? [];
                if (names.includes(route)) {
                    navRef.dispatch(CommonActions.navigate({ name: route }));
                    return;
                }
            }
            if (tries++ < 40) setTimeout(go, 100);
        };
        go();
    }, [isAuthenticated, navRef]);

    // Root-level face scan recovery: runs whenever the app comes back to the
    // foreground so a pending upload that was interrupted in the background
    // (or while on a different screen) still resolves correctly.
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;
        // Scan-only users don't have a FeaturesIntro route and don't need pending-scan recovery
        // (unlimited scans, no queued upload lifecycle). Skip entirely.
        if (isScanUser) return;
        // Face-scan kill switch: with the scan removed there are no pending
        // uploads to recover, so this whole effect is inert when the flag is off.
        if (!faceScanEnabled) return;

        const runRecovery = async () => {
            if (recoveryRunning.current) return;
            // Mid-funnel (V4), the wizard's own gate polls the scan while the
            // quiz runs — this reset would destroy quiz progress AND land on
            // FaceScanResults with no params, whose legacy routing then skipped
            // the paywall for anon users. Recovery is for COMPLETED users whose
            // upload got orphaned outside the funnel.
            if (user?.onboarding?.completed !== true) return;
            const pending = await getPendingFaceScanSubmit().catch(() => null);
            if (!pending || pending.userId !== user.id) return;

            // A repeat scanner already has first_scan_completed=true and an OLD
            // completed row, so neither proves THIS upload landed — recovery
            // used to declare success, delete the captured photos and show
            // yesterday's scan. Require a row created after the flag was set
            // (2-min clock-skew allowance). A flag without a timestamp keeps
            // the old test.
            const pendingAt = Date.parse(String((pending as { at?: string }).at ?? ''));
            const newerThanPending = (scan: unknown): boolean => {
                if (!Number.isFinite(pendingAt)) return true;
                const c = Date.parse(String((scan as { created_at?: string } | null)?.created_at ?? ''));
                return Number.isFinite(c) && c >= pendingAt - 120_000;
            };
            const landedAfterPending = async (): Promise<boolean> => {
                if (!Number.isFinite(pendingAt)) return true;
                try { return newerThanPending(await api.getLatestScan()); } catch { return false; }
            };

            // Reset target must come from the MOUNTED stack, not from isPaid:
            // (a) this effect's closure captured a stale isPaid (it's not in the
            // dep array), and (b) stack membership is keyed on treatAsFull —
            // a paid-mid-funnel or free-tier user has no 'Main' route, so an
            // isPaid-based reset was a silent no-op and the recovery never
            // landed anywhere.
            const homeRoute = () => {
                const names: string[] = (navRef.getRootState()?.routeNames as string[] | undefined) ?? [];
                return names.includes('Main') ? 'Main' : 'FeaturesIntro';
            };

            recoveryRunning.current = true;
            try {
                const delays = [0, 1500, 3000, 4500];
                for (const ms of delays) {
                    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
                    try {
                        const u = await refreshUser();
                        if (u?.first_scan_completed && await landedAfterPending()) {
                            await clearPendingFaceScanSubmit();
                            await clearFaceScanDraft();
                            navRef.dispatch(
                                // FeaturesIntro only exists in the UNPAID stack; a paid
                            // user's stack has 'Main' instead. Resetting to a route
                            // absent from the active stack no-ops/errors, so branch.
                            CommonActions.reset({ index: 1, routes: [{ name: homeRoute() }, { name: 'FaceScanResults' }] }),
                            );
                            return;
                        }
                    } catch { /* continue */ }
                    try {
                        const latest = await api.getLatestScan();
                        const st = (latest as { processing_status?: string })?.processing_status;
                        if (st === 'completed' && newerThanPending(latest)) {
                            await refreshUser();
                            await clearPendingFaceScanSubmit();
                            await clearFaceScanDraft();
                            navRef.dispatch(
                                // FeaturesIntro only exists in the UNPAID stack; a paid
                            // user's stack has 'Main' instead. Resetting to a route
                            // absent from the active stack no-ops/errors, so branch.
                            CommonActions.reset({ index: 1, routes: [{ name: homeRoute() }, { name: 'FaceScanResults' }] }),
                            );
                            return;
                        }
                        if (st === 'failed' && newerThanPending(latest)) {
                            await clearPendingFaceScanSubmit();
                            return;
                        }
                    } catch { /* 404 = no scan row yet */ }
                }
                // Still processing — clear flag and let FaceScanResultsScreen poll
                try {
                    const latest = await api.getLatestScan();
                    const st = (latest as { processing_status?: string })?.processing_status;
                    if (st === 'processing' && newerThanPending(latest)) {
                        await clearPendingFaceScanSubmit();
                        navRef.dispatch(
                            // FeaturesIntro only exists in the UNPAID stack; a paid
                            // user's stack has 'Main' instead. Resetting to a route
                            // absent from the active stack no-ops/errors, so branch.
                            CommonActions.reset({ index: 1, routes: [{ name: homeRoute() }, { name: 'FaceScanResults' }] }),
                        );
                    }
                } catch { /* no scan */ }
                await clearPendingFaceScanSubmit().catch(() => undefined);
            } finally {
                recoveryRunning.current = false;
            }
        };

        // Run once on mount (covers cold-start after OS kill)
        void runRecovery();

        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            const prev = appStateRef.current;
            appStateRef.current = next;
            if (prev.match(/inactive|background/) && next === 'active') {
                void runRecovery();
            }
        });
        return () => sub.remove();
    }, [isAuthenticated, user?.id, isScanUser, faceScanEnabled, refreshUser, navRef]);

    return (
        <NavigationContainer
            ref={navRef}
            key={isAuthenticated ? 'auth' : 'guest'}
            onReady={() => {
                // Never let a bad deep link take down boot: onReady throwing
                // propagates to the root error boundary before anything renders.
                try { flushPendingDeepLink(); } catch (e) { console.warn('[DeepLink] flush failed:', e); }
                try { flushWidgetHome(); } catch (e) { console.warn('[Widget] flush failed:', e); }
            }}
            // Remember which paid-app tab the user is on so a reload/relaunch
            // restores it instead of bouncing to the default tab. Scoped + safe:
            // persistActiveTab only writes known Main tabs (see lib/navState).
            onStateChange={(state) => persistActiveTab(extractActiveTab(state))}
        >
            <StatusBar style="dark" />
            <RootNavigator />
            {/* Floating dev drawer — __DEV__ gate inside the component, so
                production builds compile it to nothing. Mounted here (inside
                NavigationContainer) so its 'jump to' buttons can use the
                navigation prop. */}
            <DevDrawer />
        </NavigationContainer>
    );
}

export default function App() {
    const [fontsLoaded, fontError] = useFonts({
        'Matter-Regular': require('./assets/fonts/Matter-Regular.ttf'),
        'Matter-Medium': require('./assets/fonts/Matter-Medium.ttf'),
        'Matter-SemiBold': require('./assets/fonts/Matter-SemiBold.ttf'),
        'Matter-Bold': require('./assets/fonts/Matter-Bold.ttf'),
        'Matter-Light': require('./assets/fonts/Matter-Light.ttf'),
        // Display serif = Fraunces (the Craft typeface — the look the user wants).
        // NOTE: the only Fraunces files bundled are a heavy BLACK cut, so this reads
        // bold. If it's too thick, the fix is a real Fraunces Light (300) — there
        // is no light Fraunces on the machine, so it has to be added. Every serif
        // key (Fraunces aliases + Playfair keys) maps here, app-wide, one place.
        'Fraunces': require('./assets/fonts/Fraunces-Regular.ttf'),
        'Fraunces-SemiBold': require('./assets/fonts/Fraunces-SemiBold.ttf'),
        'Fraunces-Italic': require('./assets/fonts/Fraunces-Italic.ttf'),
        'PlayfairDisplay': require('./assets/fonts/Fraunces-Regular.ttf'),
        'PlayfairDisplay-Regular': require('./assets/fonts/Fraunces-Regular.ttf'),
        'PlayfairDisplay-Italic': require('./assets/fonts/Fraunces-Italic.ttf'),
    });

    // Boot watchdog: `useFonts` can reject (bad/missing font asset) or, on some
    // devices, simply never resolve — neither case was captured before (only
    // `fontsLoaded` gated the splash/render), so either failure mode hung the
    // native splash screen forever with no way forward. The app must ALWAYS
    // reach a usable screen: after 8s, stop waiting on fonts regardless of
    // outcome (RN silently falls back to a system font for an unregistered
    // fontFamily, so proceeding without them degrades gracefully, not fatally).
    const [bootTimedOut, setBootTimedOut] = useState(false);
    useEffect(() => {
        if (fontsLoaded || fontError) return;
        const t = setTimeout(() => setBootTimedOut(true), 8000);
        return () => clearTimeout(t);
    }, [fontsLoaded, fontError]);
    useEffect(() => {
        if (fontError) console.warn('[Boot] font load failed:', fontError);
    }, [fontError]);
    const fontsReady = fontsLoaded || !!fontError || bootTimedOut;

    // Restore the persisted React Query cache BEFORE the provider tree mounts,
    // so the first paint of data screens shows last-known data instead of
    // empty/loading. Persistence starts only AFTER hydration resolves so an
    // early empty snapshot can't clobber the stored blob.
    const [cacheHydrated, setCacheHydrated] = useState(false);
    useEffect(() => {
        let cancelled = false;
        let stopPersistence: (() => void) | undefined;
        // Restore the persisted cache AND the last-active tab before the first
        // paint, so data screens show last-known data and the user lands back on
        // the tab they left.
        // Run the fresh-(re)install guard FIRST — before the query-cache persister
        // starts writing — so a download always resumes at Landing (never a stale
        // inherited session), and the "empty AsyncStorage" signal it relies on is
        // reliable. Then hydrate the cache + restore the tab, then start persisting.
        void ensureFirstRunClean()
            .then(() => Promise.all([hydrateQueryClient(queryClient), loadRestoredTab()]))
            .finally(() => {
                if (cancelled) return;
                setCacheHydrated(true);
                stopPersistence = startQueryPersistence(queryClient);
            });
        return () => {
            cancelled = true;
            stopPersistence?.();
        };
    }, []);

    // Foreground revalidation: tell React Query the app regained focus when it
    // returns to the foreground, so stale queries refetch (self-heals data
    // after a background/kill). RN-only; web keeps its default focus handling.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
            if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
        });
        return () => sub.remove();
    }, []);

    useEffect(() => {
        if (fontsReady && cacheHydrated) {
            void SplashScreen.hideAsync().catch(() => undefined);
        }
    }, [fontsReady, cacheHydrated]);

    // Native: keep the OS splash visible until fonts (or the boot watchdog)
    // AND the restored cache are ready (matches MaxLoadingView look via
    // assets/splash.png).
    // Web: no native splash — show the same React loading UI.
    if (!fontsReady || !cacheHydrated) {
        if (Platform.OS === 'web') {
            return <MaxLoadingView />;
        }
        return null;
    }

    const webContainerStyle: ViewStyle =
        Platform.OS === 'web' ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : {};

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Top-level crash backstop. Wraps the entire provider tree so even a
                provider/render crash shows a recovery screen instead of a white
                screen; onReset clears the in-memory cache (the boundary itself
                clears the boot-restored blobs) so recovery doesn't immediately
                re-throw on the same poisoned state. Uses plain RN components, so
                it renders even if a provider is what failed. */}
            <AppErrorBoundary label="root" onReset={() => { try { queryClient.clear(); } catch { /* ignore */ } }}>
                <StripeProviderGate>
                    <QueryClientProvider client={queryClient}>
                        <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
                            <View style={[{ flex: 1, backgroundColor: colors.background }, webContainerStyle]}>
                                <FeatureFlagsProvider>
                                    <AuthProvider>
                                        <AppNavigator />
                                    </AuthProvider>
                                    {/* In-app alert host — renders Alert.alert() prompts as
                                        on-brand modals instead of the native OS dialog. */}
                                    <InAppAlertHost />
                                </FeatureFlagsProvider>
                            </View>
                        </SafeAreaProvider>
                    </QueryClientProvider>
                </StripeProviderGate>
            </AppErrorBoundary>
        </GestureHandlerRootView>
    );
}
