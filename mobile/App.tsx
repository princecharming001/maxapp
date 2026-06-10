import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, View, Platform, type AppStateStatus, type ViewStyle } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { CommonActions, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './lib/queryClient';
import { navigationRef } from './lib/navigationRef';
import { colors } from './theme/dark';
import MaxLoadingView from './components/MaxLoadingView';
import { StripeProviderGate } from './components/StripeProviderGate';
import DevDrawer from './components/DevDrawer';
import { TamaguiProvider } from 'tamagui';
import tamaguiConfig from './tamagui.config';
import PlannerMockups from './screens/_mocks/PlannerMockups';
import api from './services/api';
import {
    getPendingFaceScanSubmit,
    clearPendingFaceScanSubmit,
    clearFaceScanDraft,
} from './lib/faceScanDraft';
// Side-effect import: registers expo-notifications handler at cold-start so
// remote pushes arriving while the app is foregrounded show a banner.
import './services/localScheduleNotifications';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// DEV: set true to render the planner redesign mockups (design review only).
const SHOW_PLANNER_MOCKS = false;

// Routes a push notification is allowed to deep-link into. Keep this an
// explicit allow-list — we never navigate to an arbitrary route name handed
// to us inside a notification payload.
const NOTIFICATION_DEEP_LINK_ROUTES = new Set<string>(['ProgressArchive']);

function AppNavigator() {
    const { isAuthenticated, isPaid, refreshUser, user, isScanUser } = useAuth();
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

    // Root-level face scan recovery: runs whenever the app comes back to the
    // foreground so a pending upload that was interrupted in the background
    // (or while on a different screen) still resolves correctly.
    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;
        // Scan-only users don't have a FeaturesIntro route and don't need pending-scan recovery
        // (unlimited scans, no queued upload lifecycle). Skip entirely.
        if (isScanUser) return;

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
    }, [isAuthenticated, user?.id, isScanUser, refreshUser, navRef]);

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
        'PlayfairDisplay': require('./assets/fonts/PlayfairDisplay-Variable.ttf'),
        'PlayfairDisplay-Italic': require('./assets/fonts/PlayfairDisplay-Italic-Variable.ttf'),
    });

    useEffect(() => {
        if (fontsLoaded) {
            void SplashScreen.hideAsync().catch(() => undefined);
        }
    }, [fontsLoaded]);

    // Native: keep the OS splash visible until fonts load (matches MaxLoadingView look via assets/splash.png).
    // Web: no native splash — show the same React loading UI.
    if (!fontsLoaded) {
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
            <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
            <StripeProviderGate>
                <QueryClientProvider client={queryClient}>
                    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
                        <View style={[{ flex: 1, backgroundColor: colors.background }, webContainerStyle]}>
                            <AuthProvider>
                                <AppNavigator />
                            </AuthProvider>
                        </View>
                    </SafeAreaProvider>
                </QueryClientProvider>
            </StripeProviderGate>
            </TamaguiProvider>
        </GestureHandlerRootView>
    );
}
