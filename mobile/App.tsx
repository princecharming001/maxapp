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
import { AuthProvider, useAuth } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './lib/queryClient';
import { hydrateQueryClient, startQueryPersistence } from './lib/queryPersist';
import { installGlobalErrorHandlers } from './lib/globalErrorHandlers';
import AppErrorBoundary from './components/AppErrorBoundary';
import { loadRestoredTab, persistActiveTab, extractActiveTab } from './lib/navState';
import { navigationRef } from './lib/navigationRef';
import { consumePostPayPending } from './lib/postPayNav';
import { colors } from './theme/dark';
import MaxLoadingView from './components/MaxLoadingView';
import { StripeProviderGate } from './components/StripeProviderGate';
import { InAppAlertHost } from './components/InAppAlert';
import DevDrawer from './components/DevDrawer';
import { TamaguiProvider } from 'tamagui';
import tamaguiConfig from './tamagui.config';
import PlannerMockups from './screens/_mocks/PlannerMockups';
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

// DEV: set true to render the planner redesign mockups (design review only).
const SHOW_PLANNER_MOCKS = false;

// Routes a push notification is allowed to deep-link into. Keep this an
// explicit allow-list — we never navigate to an arbitrary route name handed
// to us inside a notification payload.
const NOTIFICATION_DEEP_LINK_ROUTES = new Set<string>(['ProgressArchive']);

function AppNavigator() {
    const { isAuthenticated, isPaid, refreshUser, user, isScanUser } = useAuth();
    const faceScanEnabled = useFlag('faceScan');
    const navRef = navigationRef;
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const recoveryRunning = useRef(false);
    // A deep-link target that arrived from a notification tap before the
    // navigator (or the stack screen it points at) was mounted — flushed once
    // navigation is ready. Covers the cold-start-from-tap case.
    const pendingDeepLinkRef = useRef<string | null>(null);

    const goToNotificationRoute = useCallback(
        (route: unknown) => {
            if (typeof route !== 'string' || !NOTIFICATION_DEEP_LINK_ROUTES.has(route)) return;
            if (navRef.isReady()) {
                navRef.navigate(route as never);
                pendingDeepLinkRef.current = null;
            } else {
                pendingDeepLinkRef.current = route;
            }
        },
        [navRef],
    );

    // Clear badge count when the app enters the foreground and wire up
    // notification-tap deep-linking.
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        void Notifications.setBadgeCountAsync(0).catch(() => undefined);
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (next === 'active') {
                void Notifications.setBadgeCountAsync(0).catch(() => undefined);
            }
        });
        return () => sub.remove();
    }, []);

    // Notification-tap deep-linking: send the user where the push points. The
    // bedtime progress-pic push carries { route: 'ProgressArchive' } so a tap
    // drops them straight into their archive to add tonight's photo.
    useEffect(() => {
        let mounted = true;
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            goToNotificationRoute(response?.notification?.request?.content?.data?.route);
        });
        // Cold-start: the app was launched by tapping a notification while it
        // wasn't running. The listener above won't fire for that tap.
        void Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (mounted) goToNotificationRoute(response?.notification?.request?.content?.data?.route);
            })
            .catch(() => undefined);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, [goToNotificationRoute]);

    // Flush a deferred deep-link once the navigator and its target stack are
    // mounted. Re-runs as auth/paid state resolves (the ProgressArchive screen
    // only exists in the paid stack), which is exactly when a cold-start tap
    // becomes navigable.
    useEffect(() => {
        const pending = pendingDeepLinkRef.current;
        if (pending && navRef.isReady()) {
            navRef.navigate(pending as never);
            pendingDeepLinkRef.current = null;
        }
    }, [isAuthenticated, isPaid, user?.id, navRef]);

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
                navRef.navigate('FaceScanResults' as never, { postPay: true } as never);
            } else if (tries++ < 20) {
                setTimeout(go, 150);
            }
        };
        go();
    }, [isPaid, faceScanEnabled, navRef]);

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
            const pending = await getPendingFaceScanSubmit().catch(() => null);
            if (!pending || pending.userId !== user.id) return;

            recoveryRunning.current = true;
            try {
                const delays = [0, 1500, 3000, 4500];
                for (const ms of delays) {
                    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
                    try {
                        const u = await refreshUser();
                        if (u?.first_scan_completed) {
                            await clearPendingFaceScanSubmit();
                            await clearFaceScanDraft();
                            navRef.dispatch(
                                CommonActions.reset({ index: 1, routes: [{ name: 'FeaturesIntro' }, { name: 'FaceScanResults' }] }),
                            );
                            return;
                        }
                    } catch { /* continue */ }
                    try {
                        const latest = await api.getLatestScan();
                        const st = (latest as { processing_status?: string })?.processing_status;
                        if (st === 'completed') {
                            await refreshUser();
                            await clearPendingFaceScanSubmit();
                            await clearFaceScanDraft();
                            navRef.dispatch(
                                CommonActions.reset({ index: 1, routes: [{ name: 'FeaturesIntro' }, { name: 'FaceScanResults' }] }),
                            );
                            return;
                        }
                        if (st === 'failed') {
                            await clearPendingFaceScanSubmit();
                            return;
                        }
                    } catch { /* 404 = no scan row yet */ }
                }
                // Still processing — clear flag and let FaceScanResultsScreen poll
                try {
                    const latest = await api.getLatestScan();
                    const st = (latest as { processing_status?: string })?.processing_status;
                    if (st === 'processing') {
                        await clearPendingFaceScanSubmit();
                        navRef.dispatch(
                            CommonActions.reset({ index: 1, routes: [{ name: 'FeaturesIntro' }, { name: 'FaceScanResults' }] }),
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
                const pending = pendingDeepLinkRef.current;
                if (pending && navRef.isReady()) {
                    navRef.navigate(pending as never);
                    pendingDeepLinkRef.current = null;
                }
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
    const [fontsLoaded] = useFonts({
        'Matter-Regular': require('./assets/fonts/Matter-Regular.ttf'),
        'Matter-Medium': require('./assets/fonts/Matter-Medium.ttf'),
        'Matter-SemiBold': require('./assets/fonts/Matter-SemiBold.ttf'),
        'Matter-Bold': require('./assets/fonts/Matter-Bold.ttf'),
        'Matter-Light': require('./assets/fonts/Matter-Light.ttf'),
        // Display serif = Fraunces (Craft-style: refined old-style with
        // calligraphic italics), instanced to a display optical cut. The old
        // Playfair keys re-point to Fraunces so every existing headline updates
        // with no per-screen edits; new code uses 'Fraunces'.
        'Fraunces': require('./assets/fonts/Fraunces-Regular.ttf'),
        'Fraunces-SemiBold': require('./assets/fonts/Fraunces-SemiBold.ttf'),
        'Fraunces-Italic': require('./assets/fonts/Fraunces-Italic.ttf'),
        'PlayfairDisplay': require('./assets/fonts/Fraunces-Regular.ttf'),
        'PlayfairDisplay-Regular': require('./assets/fonts/Fraunces-Regular.ttf'),
        'PlayfairDisplay-Italic': require('./assets/fonts/Fraunces-Italic.ttf'),
    });

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
        void Promise.all([hydrateQueryClient(queryClient), loadRestoredTab()]).finally(() => {
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
        if (fontsLoaded && cacheHydrated) {
            void SplashScreen.hideAsync().catch(() => undefined);
        }
    }, [fontsLoaded, cacheHydrated]);

    // Native: keep the OS splash visible until fonts AND the restored cache are
    // ready (matches MaxLoadingView look via assets/splash.png).
    // Web: no native splash — show the same React loading UI.
    if (!fontsLoaded || !cacheHydrated) {
        if (Platform.OS === 'web') {
            return <MaxLoadingView />;
        }
        return null;
    }

    if (__DEV__ && SHOW_PLANNER_MOCKS) {
        return (
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
                <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
                    <PlannerMockups />
                </TamaguiProvider>
            </GestureHandlerRootView>
        );
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
                it renders even if Tamagui/providers are what failed. */}
            <AppErrorBoundary label="root" onReset={() => { try { queryClient.clear(); } catch { /* ignore */ } }}>
                <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
                <StripeProviderGate>
                    <QueryClientProvider client={queryClient}>
                        <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
                            <View style={[{ flex: 1, backgroundColor: colors.background }, webContainerStyle]}>
                                <AuthProvider>
                                    <AppNavigator />
                                </AuthProvider>
                                {/* In-app alert host — renders Alert.alert() prompts as
                                    on-brand modals instead of the native OS dialog. */}
                                <InAppAlertHost />
                            </View>
                        </SafeAreaProvider>
                    </QueryClientProvider>
                </StripeProviderGate>
                </TamaguiProvider>
            </AppErrorBoundary>
        </GestureHandlerRootView>
    );
}
