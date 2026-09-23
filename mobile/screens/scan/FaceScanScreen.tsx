import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    AppState,
    ActivityIndicator,
    Platform,
    Linking,
    type AppStateStatus,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { colors, spacing, borderRadius, fonts } from '../../theme/dark';
import { CachedImage } from '../../components/CachedImage';
import AnalyzingScreen from './AnalyzingScreen';
import {
    saveFaceScanDraft,
    loadFaceScanDraft,
    clearFaceScanDraft,
    setPendingFaceScanSubmit,
    clearPendingFaceScanSubmit,
    getPendingFaceScanSubmit,
    setFaceScanUploadFailed,
    getFaceScanUploadFailed,
    clearFaceScanUploadFailed,
    scanLandedAfterSubmit,
} from '../../lib/faceScanDraft';
import { userFacingError } from '../../lib/userFacingError';
import type { LatestScan } from '../../services/api';

/**
 * Owned copy for a failed scan upload. Never the raw server/library string:
 * the alert used to read "Analysis failed: 503 UNAVAILABLE The model is
 * overloaded…" or name a retired plan. `showResults` = the user already has
 * a scan the server is pointing at (limit used / previous one still
 * analyzing), so offer to open it.
 */
function scanUploadErrorCopy(err: unknown): { title: string; message: string; showResults: boolean } {
    const e = err as { response?: { status?: number; data?: { detail?: unknown } }; statusCode?: number } | null;
    const status = e?.response?.status ?? e?.statusCode;
    const detail = typeof e?.response?.data?.detail === 'string' ? e.response.data.detail.trim() : '';
    if (status === 429) {
        return {
            title: 'Scan limit reached',
            message: detail && detail.length <= 160 ? detail : "You've already used your scan for now. Come back tomorrow.",
            showResults: true,
        };
    }
    if (status === 409) {
        return {
            title: 'Still analyzing',
            message: 'Your last scan is still being analyzed. It will show up in a moment.',
            showResults: true,
        };
    }
    if (status === 413) {
        return {
            title: 'Photo too large',
            message: userFacingError(err, 'One of the photos is too large. Retake it and try again.'),
            showResults: false,
        };
    }
    if (status === 400) {
        // Our own short, user-written detail (free scan already used, not an
        // image…) passes through userFacingError; anything internal-looking
        // falls to its fallback.
        return {
            title: 'Face scan',
            message: userFacingError(err, 'Those photos could not be used. Retake them and try again.'),
            showResults: status === 400 && /already completed/i.test(detail),
        };
    }
    return {
        title: "Couldn't analyze",
        message: userFacingError(err, 'Could not analyze photos. Check your connection and try again.'),
        showResults: false,
    };
}

function formatNextScan(d: Date): string {
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((d.getTime() - startOfToday.getTime()) / 86_400_000);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff === 0) return `${time} today`;
    if (dayDiff === 1) return `tomorrow ${time}`;
    const date = d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
    return `${date} at ${time}`;
}

const STEPS = [
    {
        key: 'front',
        title: 'Front',
        instruction: 'Straight on, neutral expression.',
    },
    {
        key: 'left',
        title: 'Left profile',
        instruction: 'Left cheek toward camera, ~90°.',
    },
    {
        key: 'right',
        title: 'Right profile',
        instruction: 'Right cheek toward camera, ~90°.',
    },
] as const;

export default function FaceScanScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const { user, isPaid, isScanUser, refreshUser } = useAuth();
    // Funnel V4: the capture is the FIRST screen after "Get started", mounted
    // as the navigator's initial route (no params) — so infer funnel mode for
    // any not-yet-onboarded user, not just explicit funnelV4 pushes. Scan-only
    // accounts keep their own flow.
    const funnelV4 = !!route?.params?.funnelV4
        || (!isScanUser && user?.onboarding?.completed !== true);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const [stepIndex, setStepIndex] = useState(0);
    const [uris, setUris] = useState<(string | null)[]>([null, null, null]);
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisStep, setAnalysisStep] = useState(0);
    const [bootstrapped, setBootstrapped] = useState(false);
    const [cameraSession, setCameraSession] = useState(0);
    const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const analyzingRef = useRef(false);
    analyzingRef.current = analyzing;
    const uploadActiveRef = useRef(false);
    // Set when the user taps the AnalyzingScreen escape hatch: the in-flight
    // upload keeps running server-side, but its resolution must no longer
    // navigate or alert (the user has moved on; recovery flags stay cleared).
    const scanCancelledRef = useRef(false);
    // Funnel in-flight guard: the background upload has no spinner, so a
    // double-tap on Analyze (or a swipe-back onto this buried screen from the
    // quiz + another tap) fired a SECOND upload — two scan rows, two vision
    // analyses, and /scans/latest then hid the full breakdown (is_first_scan
    // false). One upload per set of photos.
    const funnelUploadRef = useRef(false);
    // Whether this mount ever held a photo — the on-disk draft is only wiped
    // after the user retakes back to empty, never on an empty mount (H5).
    const hadPhotosRef = useRef(false);
    // Inline notice over the capture UI after a failed funnel upload: the
    // photos are restored and Analyze re-sends them.
    const [uploadNotice, setUploadNotice] = useState<string | null>(null);

    const navigateToResults = useCallback(() => {
        // Funnel V4: the capture is the funnel's FIRST screen; the analysis
        // keeps processing server-side while the user answers the question run
        // — hand off to the wizard, not the full results screen.
        if (funnelV4) {
            // The results screen normally clears the submit-recovery flags on
            // mount; this path skips it, so clear them here (upload succeeded).
            void clearPendingFaceScanSubmit().catch(() => undefined);
            void clearFaceScanDraft().catch(() => undefined);
            // scanSkipped:false is EXPLICIT: a scan now exists, so a stale
            // scanSkipped:true in the quiz draft (skipped once, then scanned on
            // a later launch) must not route the intro past the results gate.
            navigation.navigate('Onboarding', { phase: 'intro', scanSkipped: false });
            return;
        }
        // `justSubmitted` tells the results screen this is the genuine
        // post-upload hand-off — only then should it clear the captured-photo
        // draft + pending flag. Post-pay redirects into FaceScanResults (from
        // Home / Payment) must NOT carry it, or they'd wipe an unrelated
        // in-progress scan draft.
        const resultsRoute = { name: 'FaceScanResults', params: { justSubmitted: true } };
        if (isScanUser) {
            // ScanOnlyNavigator only contains FaceScan + FaceScanResults; FeaturesIntro doesn't exist there.
            navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [resultsRoute] }),
            );
            return;
        }
        // Additional scans (first scan already done) shouldn't push FeaturesIntro
        // back into the stack — that's only for the first-scan onboarding flow.
        if (user?.first_scan_completed) {
            // Keep whatever is beneath (Main with its tab state, or the scan
            // archive): a reset to [FaceScanResults] alone unmounted the tab
            // navigator on every daily scan — chat scroll, planner date and
            // any in-progress composer were lost, and the results' Continue
            // then pushed a FRESH Main on top. Swap this capture screen for
            // the results; the results screen exits with goBack.
            if (navigation.canGoBack()) {
                navigation.replace('FaceScanResults', resultsRoute.params);
                return;
            }
            navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [resultsRoute] }),
            );
            return;
        }
        // Choose the target from the MOUNTED stack rather than assuming
        // 'FeaturesIntro' exists: this branch is also reached by a PAID user's
        // first-ever scan taken from the Scan tab (funnel V4 off / onboarding
        // already complete), where FaceScan is registered on the paid stack —
        // which has 'Main', not 'FeaturesIntro'. React Navigation drops a
        // RESET whose route names aren't registered on this navigator
        // (silent no-op), which previously stranded the user on
        // AnalyzingScreen forever. Read the actually-mounted route names
        // instead of re-deriving the stack from auth flags (isPaid alone
        // would still mis-target for an onboarded free-tier user).
        const routeNames: string[] = ((navigation.getState?.() as any)?.routeNames) ?? [];
        const introRoute = routeNames.includes('FeaturesIntro') ? 'FeaturesIntro' : 'Main';
        navigation.dispatch(
            CommonActions.reset({
                index: 1,
                routes: [{ name: introRoute }, resultsRoute],
            }),
        );
    }, [navigation, isScanUser, user?.first_scan_completed, funnelV4]);

    // Did the interrupted submit land server-side? Decided by matching the
    // latest row's created_at against the submit timestamp in the pending
    // flag — NOT by `first_scan_completed`, which is true for every repeat
    // scan and made a killed repeat upload look successful (photos deleted,
    // yesterday's scan shown as new, daily limit then refusing a redo).
    //   'landed'  — a row from this submit exists (completed or still processing) and we navigated on
    //   'failed'  — that row failed; photos stay so Analyze can resend
    //   'no-row'  — nothing from this submit reached the server
    const runAnalyzingRecovery = useCallback(
        async (fromForeground: boolean): Promise<'landed' | 'failed' | 'no-row'> => {
            const pending = await getPendingFaceScanSubmit().catch(() => null);
            const pendingAt = pending?.at ?? null;
            const delays = [0, 1500, 3000, 4500];
            for (const ms of delays) {
                if (ms > 0) await new Promise((r) => setTimeout(r, ms));
                try {
                    const latest = (await api.getLatestScan()) as LatestScan | null;
                    // An older row is a PREVIOUS scan, not this upload — keep waiting.
                    if (!latest || !scanLandedAfterSubmit(latest.created_at, pendingAt)) continue;
                    const st = latest.processing_status;
                    if (st === 'completed') {
                        await refreshUser().catch(() => undefined);
                        await clearPendingFaceScanSubmit();
                        await clearFaceScanDraft();
                        navigateToResults();
                        return 'landed';
                    }
                    if (st === 'failed') {
                        await clearPendingFaceScanSubmit();
                        setAnalyzing(false);
                        Alert.alert(
                            'Try again',
                            'Your photos need another pass. Tap Analyze again. Closing the app next time won\'t stop it.',
                        );
                        return 'failed';
                    }
                    // still processing — poll a little longer
                } catch {
                    /* transient — retry */
                }
            }
            // Still processing after the polls: hand off to the results screen,
            // which keeps polling with its own watchdog.
            try {
                const latest = (await api.getLatestScan()) as LatestScan | null;
                if (
                    latest?.processing_status === 'processing'
                    && scanLandedAfterSubmit(latest.created_at, pendingAt)
                ) {
                    await clearPendingFaceScanSubmit();
                    navigateToResults();
                    return 'landed';
                }
            } catch {
                /* no scan */
            }
            await clearPendingFaceScanSubmit();
            setAnalyzing(false);
            if (fromForeground) {
                Alert.alert(
                    'Pick up where you left off',
                    'Your photos are still here. Tap Analyze to send them again.',
                );
            }
            return 'no-row';
        },
        [navigateToResults, refreshUser],
    );

    useEffect(() => {
        if (!user?.id) {
            setBootstrapped(true);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const restoreDraft = async () => {
                    const draft = await loadFaceScanDraft(user.id);
                    if (cancelled || !draft) return;
                    if (draft.uris.some(Boolean)) hadPhotosRef.current = true;
                    setStepIndex(draft.stepIndex);
                    setUris(draft.uris);
                };
                // A funnel upload that already failed for good: no point in a
                // recovery spinner — restore the photos and say why.
                const failedUpload = await getFaceScanUploadFailed(user.id);
                if (cancelled) return;
                if (failedUpload) {
                    await clearPendingFaceScanSubmit().catch(() => undefined);
                    await clearFaceScanUploadFailed();
                    setUploadNotice(failedUpload.message || "Your photos didn't upload. Tap Analyze to send them again.");
                    await restoreDraft();
                    return;
                }
                const pending = await getPendingFaceScanSubmit();
                if (cancelled) return;
                if (pending?.userId === user.id) {
                    setAnalyzing(true);
                    setAnalysisStep(1);
                    const outcome = await runAnalyzingRecovery(false);
                    if (cancelled || outcome === 'landed') return;
                    // Nothing (or a failed row) landed: the photos are still on
                    // disk — put them back so Analyze can resend. Recovery used
                    // to skip this restore, and the empty capture UI then wiped
                    // the draft: a 9s spinner followed by "take them again".
                    await restoreDraft();
                    if (outcome === 'no-row') {
                        setUploadNotice("Your photos didn't finish uploading. Tap Analyze to send them again.");
                    }
                    return;
                }
                await restoreDraft();
            } catch (e) {
                console.warn('face scan bootstrap', e);
            } finally {
                if (!cancelled) setBootstrapped(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user?.id, runAnalyzingRecovery]);

    // "Retake photos" from the results gate re-enters this screen (still
    // mounted beneath the quiz, or pushed fresh). Drop the failure markers so
    // the gate doesn't fail fast again, and restore photos if state is empty.
    const retakeToken = route?.params?.retake;
    useEffect(() => {
        if (!retakeToken || !user?.id) return;
        void clearFaceScanUploadFailed();
        void clearPendingFaceScanSubmit().catch(() => undefined);
        setUploadNotice(null);
        if (!uris.some(Boolean)) {
            void loadFaceScanDraft(user.id).then((draft) => {
                if (!draft) return;
                if (draft.uris.some(Boolean)) hadPhotosRef.current = true;
                setStepIndex(draft.stepIndex);
                setUris(draft.uris);
            }).catch(() => undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retakeToken, user?.id]);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'web') return;
            setCameraSession((s) => s + 1);
        }, []),
    );

    useEffect(() => {
        if (!user?.id || analyzing || !bootstrapped) return;
        const hasAny = uris.some(Boolean);
        if (hasAny) hadPhotosRef.current = true;
        if (!hasAny && stepIndex === 0) {
            // Only wipe the on-disk photos when THIS session had some and the
            // user retook back to empty — never on an empty mount. A recovery
            // that found no row, or a bootstrap that failed to read the draft,
            // used to land here with empty state and delete the photos.
            if (hadPhotosRef.current) void clearFaceScanDraft().catch(() => undefined);
            return;
        }
        const t = setTimeout(() => {
            void saveFaceScanDraft(user.id, stepIndex, uris).catch((e) => console.warn('face scan draft save', e));
        }, 450);
        return () => clearTimeout(t);
    }, [user?.id, stepIndex, uris, analyzing, bootstrapped]);

    const step = STEPS[stepIndex];
    const currentUri = uris[stepIndex];
    const hasCurrent = !!currentUri;

    useEffect(() => {
        if (!permission?.granted && permission?.canAskAgain !== false) {
            requestPermission();
        }
    }, [permission?.granted, permission?.canAskAgain, requestPermission]);

    useLayoutEffect(() => {
        if (isScanUser) return;
        // Only redirect when this screen is actually the active one. In the V4
        // funnel, FaceScan stays MOUNTED underneath the question wizard after the
        // capture hands off (navigation.navigate, not reset). When the background
        // analysis lands, refreshUser() flips first_scan_completed in the shared
        // auth context — and without this focus guard, that would fire here on the
        // buried screen and reset the stack to FaceScanResults, yanking the user
        // out of the questions mid-run (and skipping the gateV4 bust buffer). The
        // proper reveal is driven by the wizard finishing its first question set
        // (Onboarding intro → FaceScanResults{gateV4}), not by this screen.
        if (!isFocused) return;
        if (user?.first_scan_completed && !isPaid) {
            navigation.dispatch(
                CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'FaceScanResults' }],
                }),
            );
        }
    }, [user?.first_scan_completed, isPaid, isScanUser, isFocused, navigation]);

    useEffect(() => {
        const run = async () => {
            if (isScanUser) return;
            if (!isPaid) return;
            // Same guards as the layout effect above, for the same reason: in
            // the V4 funnel this screen stays MOUNTED under the wizard after
            // the capture hands off. When the purchase verifies, refreshUser()
            // flips isPaid/isPremium in the shared auth context and this effect
            // fired on the BURIED screen — the funnel scan was minutes old, so
            // it always computed a "next scan" limit, alerted, and called
            // goBack(). A goBack dispatched from a non-focused route carries no
            // target, so the root stack popped whatever was on TOP: the
            // CreateAccount screen the paywall had just pushed. That was the
            // "goes to sign-in, then bounces back to the paywall" bug. A limit
            // check has no business running from a capture step nobody is
            // looking at, and never in the funnel at all.
            if (!isFocused || funnelV4) return;
            try {
                // The SERVER decides — the same rule the upload enforces (UTC
                // day, failed scans don't count). The local re-implementation
                // that lived here (local calendar day, any status) disagreed
                // with it in both directions: it bounced users out when a scan
                // was permitted, and let them take three photos before a 429.
                const latest = (await api.getLatestScan()) as LatestScan | null;
                if (!latest || latest.can_scan_now !== false) return;
                // getLatestScan is async: focus can change while it's in
                // flight. Re-check at resolution so the pop can only ever
                // remove THIS screen.
                if (!navigation.isFocused()) return;
                const weekly = latest.scan_limit_reason === 'weekly_limit';
                const nextAt = latest.next_scan_allowed_at ? new Date(latest.next_scan_allowed_at) : null;
                const when = nextAt && !Number.isNaN(nextAt.getTime())
                    ? ` Wait until ${formatNextScan(nextAt)} for your next scan.`
                    : ' Try again tomorrow.';
                Alert.alert(
                    weekly ? 'Weekly face scan' : 'Daily face scan',
                    `${weekly ? 'Your plan includes one face scan per week.' : 'Your plan includes one face scan per day.'}${when}`,
                );
                if (navigation.canGoBack()) {
                    navigation.goBack();
                }
            } catch {
                // ignore
            }
        };
        void run();
    }, [isPaid, isScanUser, isFocused, funnelV4, navigation]);

    /**
     * Resume camera cleanly after background; recover analyzing flow from server when user returns.
     */
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            const prev = appStateRef.current;
            appStateRef.current = next;
            setAppActive(next === 'active');
            if (prev.match(/inactive|background/) && next === 'active') {
                setCameraSession((s) => s + 1);
            }
            if (!analyzingRef.current) return;
            if (uploadActiveRef.current) return;
            if (!prev.match(/inactive|background/) || next !== 'active') return;
            void runAnalyzingRecovery(true);
        });
        return () => sub.remove();
    }, [runAnalyzingRecovery]);

    const capture = async () => {
        try {
            const photo = await cameraRef.current?.takePictureAsync({
                quality: 0.85,
                skipProcessing: true,
            });
            if (!photo?.uri) {
                Alert.alert('Error', 'Could not capture photo');
                return;
            }
            setUris((prev) => {
                const next = [...prev];
                next[stepIndex] = photo.uri;
                return next;
            });
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Capture failed');
        }
    };

    const retake = () => {
        setUris((prev) => {
            const next = [...prev];
            next[stepIndex] = null;
            return next;
        });
    };

    const pickFromLibrary = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Photos', 'Allow photo library access to upload a picture.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.85,
            });
            if (result.canceled || !result.assets?.[0]?.uri) return;
            const uri = result.assets[0].uri;
            setUris((prev) => {
                const next = [...prev];
                next[stepIndex] = uri;
                return next;
            });
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Could not open photo library.');
        }
    };

    const onEnableCamera = async () => {
        // If iOS won't prompt again, requestPermission() no-ops and the user is
        // stuck. Send them to Settings instead. We know this up front via
        // canAskAgain === false, or after a fresh request still isn't granted.
        if (permission?.canAskAgain === false) {
            Alert.alert('Camera is off', 'Turn on camera access for Max in Settings to scan your face.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
            return;
        }
        const res = await requestPermission();
        if (!res?.granted && res?.canAskAgain === false) {
            Alert.alert('Camera is off', 'Turn on camera access for Max in Settings to scan your face.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]);
        }
    };

    const goNext = () => {
        if (stepIndex < STEPS.length - 1) setStepIndex((s) => s + 1);
    };

    const goBackStep = () => {
        if (stepIndex > 0) setStepIndex((s) => s - 1);
    };

    const submitScans = async () => {
        const f = uris[0];
        const l = uris[1];
        const r = uris[2];
        if (!f || !l || !r) {
            Alert.alert('Missing photos', 'Capture all three angles first.');
            return;
        }
        // ── Funnel V4: never block on the upload. The moment the last photo is
        // captured the user moves on to the next quiz question ("How hard do
        // you want to go?") and the upload + analysis run invisibly behind it —
        // ScanResultsGate polls until the analysis lands. The crash-recovery
        // flags stay SET until the background upload succeeds, so a kill/crash
        // mid-upload still restores the photos for a resubmit.
        if (funnelV4) {
            if (funnelUploadRef.current) {
                // Already uploading these photos — back to the quiz, no second row.
                navigation.navigate('Onboarding', { phase: 'intro', scanSkipped: false });
                return;
            }
            funnelUploadRef.current = true;
            setUploadNotice(null);
            await clearFaceScanUploadFailed();
            if (user?.id) {
                try { await setPendingFaceScanSubmit(user.id); } catch (e) { console.warn('pending submit flag', e); }
            }
            const uid = user?.id;
            void (async () => {
                try {
                    const scanRes = await api.uploadScanTriple(f, l, r);
                    const os = (scanRes?.analysis as { overall_score?: number } | undefined)?.overall_score;
                    const rating =
                        typeof os === 'number' && Number.isFinite(os) ? Math.round(os * 10) / 10 : undefined;
                    void api.uploadProgressPhoto(f, { faceRating: rating }).catch((pe) => {
                        console.warn('Progress photo from face scan', pe);
                    });
                    void refreshUser().catch((re) => {
                        console.warn('refreshUser after scan', re);
                    });
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.schedulesActiveFull,
                        refetchType: 'all',
                    });
                    // Upload landed — safe to drop the recovery flags now, and
                    // the photos: a swipe-back onto this buried screen must not
                    // find an Analyze button armed with an already-sent set.
                    void clearPendingFaceScanSubmit().catch(() => undefined);
                    void clearFaceScanDraft().catch(() => undefined);
                    setUris([null, null, null]);
                    setStepIndex(0);
                } catch (err) {
                    // Failed for good (three attempts, or a 4xx). Record it so the
                    // results gate fails FAST into "Retake photos / Skip scan"
                    // instead of spinning for two minutes on a row that will
                    // never appear. The pending flag + on-disk photos stay, so
                    // re-entering this screen restores them for a resend.
                    console.warn('background scan upload failed', err);
                    const copy = scanUploadErrorCopy(err);
                    if (uid) await setFaceScanUploadFailed(uid, copy.message).catch(() => undefined);
                } finally {
                    funnelUploadRef.current = false;
                }
            })();
            // scanSkipped:false is explicit — see navigateToResults.
            navigation.navigate('Onboarding', { phase: 'intro', scanSkipped: false });
            return;
        }
        setAnalyzing(true);
        setAnalysisStep(0);
        uploadActiveRef.current = true;
        scanCancelledRef.current = false;
        let didLeaveScan = false;
        if (user?.id) {
            try {
                await setPendingFaceScanSubmit(user.id);
            } catch (e) {
                console.warn('pending submit flag', e);
            }
        }
        try {
            setAnalysisStep(1);
            const scanRes = await api.uploadScanTriple(f, l, r);
            if (scanCancelledRef.current) return; // user bailed; don't navigate/alert late
            setAnalysisStep(2);
            const os = (scanRes?.analysis as { overall_score?: number } | undefined)?.overall_score;
            const rating =
                typeof os === 'number' && Number.isFinite(os) ? Math.round(os * 10) / 10 : undefined;
            // Navigate to results immediately so the user is never stuck on the
            // 100% AnalyzingScreen waiting for refreshUser / progress upload.
            // Both side-effects run in the background.
            void api.uploadProgressPhoto(f, { faceRating: rating }).catch((pe) => {
                console.warn('Progress photo from face scan', pe);
            });
            void refreshUser().catch((re) => {
                console.warn('refreshUser after scan', re);
            });
            // Re-evaluate the day-state so the scan badges (Baseline Set / Receipts)
            // are awarded right after this scan. The celebration is held while the
            // user is on the suppressed scan/results screens and fires when they
            // next land on a calm screen (Today / Home).
            void queryClient.invalidateQueries({
                queryKey: queryKeys.schedulesActiveFull,
                refetchType: 'all',
            });
            // Hand off to the results screen, which clears the pending flag +
            // captured-photo draft once it has actually MOUNTED. Clearing them
            // here — before navigation is confirmed — risked wiping the photos
            // and disabling recovery if the app was killed in the gap. Leaving
            // the pending flag set until results mounts means any interruption
            // still recovers straight to results on the next launch.
            navigateToResults();
            // Only treat this as having left the screen if the navigator's
            // active route actually changed. `navigateToResults` can still
            // silently no-op (a reset dispatched with a route name absent
            // from the mounted stack), and trusting `didLeaveScan` blindly in
            // that case would leave `analyzing` stuck true forever — the
            // AnalyzingScreen spinner hang this guards against.
            const navStateAfter = navigation.getState?.() as any;
            const activeRouteName = navStateAfter?.routes?.[navStateAfter.index]?.name;
            didLeaveScan = activeRouteName !== 'FaceScan';
        } catch (err: unknown) {
            console.error(err);
            await clearPendingFaceScanSubmit().catch(() => undefined);
            if (scanCancelledRef.current) return; // cancel aborted the fetch — no error alert
            // Owned copy only — never the server detail / exception text.
            const copy = scanUploadErrorCopy(err);
            Alert.alert(
                copy.title,
                copy.message,
                copy.showResults
                    ? [
                        { text: 'See my scan', onPress: () => navigation.navigate('FaceScanResults') },
                        { text: 'OK', style: 'cancel' },
                    ]
                    : undefined,
            );
        } finally {
            uploadActiveRef.current = false;
            if (!didLeaveScan) setAnalyzing(false);
        }
    };

    if (analyzing) {
        return (
            <AnalyzingScreen
                currentStep={analysisStep}
                onCancel={() => {
                    // Escape hatch (appears after 45s): back to the capture UI
                    // with photos intact so the user can retry or leave.
                    scanCancelledRef.current = true;
                    uploadActiveRef.current = false;
                    void clearPendingFaceScanSubmit().catch(() => undefined);
                    setAnalyzing(false);
                }}
            />
        );
    }

    if (!bootstrapped) {
        return (
            <View style={[styles.root, styles.bootstrapRoot]}>
                <ActivityIndicator size="large" color={colors.foreground} />
                <Text style={styles.bootstrapHint}>Restoring your scan…</Text>
            </View>
        );
    }

    if (!permission?.granted) {
        return (
            <View style={[styles.root, styles.permWrap]}>
                <Text style={styles.permText}>Camera access is needed for your face scan.</Text>
                <TouchableOpacity style={styles.permBtn} onPress={() => void onEnableCamera()}>
                    <Text style={styles.permBtnText}>Allow camera</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            {/* ── Full-bleed camera / preview ───────────────────────── */}
            {hasCurrent ? (
                <CachedImage uri={currentUri!} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : appActive ? (
                <CameraView
                    key={cameraSession}
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    mode="picture"
                    // Front camera preview is auto-mirrored (selfie view). Mirror the
                    // captured photo too so the saved image matches what the user saw —
                    // otherwise it flips left/right on capture.
                    mirror={facing === 'front'}
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.cameraPaused]}>
                    <Text style={styles.cameraPausedText}>Camera paused</Text>
                </View>
            )}

            {/* Top scrim */}
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(0,0,0,0.52)', 'transparent']}
                style={styles.topScrim}
            />
            {/* Bottom scrim */}
            <LinearGradient
                pointerEvents="none"
                colors={['transparent', 'rgba(0,0,0,0.68)']}
                style={styles.bottomScrim}
            />

            {/* ── Header: back + dots ───────────────────────────────── */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 52) }]}>
                {navigation.canGoBack() ? (
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon} hitSlop={12}>
                        <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerIcon} />
                )}
                <View style={styles.stepDots}>
                    {STEPS.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.stepDot,
                                i === stepIndex && styles.stepDotActive,
                                i < stepIndex && styles.stepDotDone,
                            ]}
                        />
                    ))}
                </View>
                <View style={styles.headerIcon} />
            </View>

            {/* ── Title block ───────────────────────────────────────── */}
            <View style={styles.titleBlock}>
                <Text style={styles.title}>{step.title}</Text>
                <Text style={styles.instruction}>{step.instruction}</Text>
                {uploadNotice ? (
                    <View style={styles.noticePill} accessibilityRole="alert">
                        <Ionicons name="cloud-offline-outline" size={14} color="#FFFFFF" />
                        <Text style={styles.noticeText}>{uploadNotice}</Text>
                    </View>
                ) : null}
            </View>

            {/* ── Bottom controls ───────────────────────────────────── */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}>
                {!hasCurrent ? (
                    <View style={styles.captureRow}>
                        {/* Upload from library */}
                        <TouchableOpacity style={styles.sideAction} onPress={pickFromLibrary} activeOpacity={0.7}>
                            <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.80)" />
                        </TouchableOpacity>

                        {/* Shutter — glassy translucent */}
                        <TouchableOpacity style={styles.shutterOuter} onPress={capture} activeOpacity={0.8} accessibilityLabel="Capture photo" accessibilityRole="button">
                            <View style={styles.shutterInner} />
                        </TouchableOpacity>

                        {/* Spacer mirror to keep the shutter centered. */}
                        <View style={styles.sideAction} />
                    </View>
                ) : (
                    <View style={styles.confirmedRow}>
                        <TouchableOpacity style={styles.glassBtn} onPress={retake} activeOpacity={0.8}>
                            <Text style={styles.glassBtnText}>Retake</Text>
                        </TouchableOpacity>
                        {stepIndex < STEPS.length - 1 ? (
                            <TouchableOpacity style={styles.solidBtn} onPress={goNext} activeOpacity={0.8}>
                                <Text style={styles.solidBtnText}>Next angle</Text>
                                <Ionicons name="arrow-forward" size={16} color="#000" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.solidBtn} onPress={submitScans} activeOpacity={0.8}>
                                <Text style={styles.solidBtnText}>Analyze</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {stepIndex > 0 && !hasCurrent && (
                    <TouchableOpacity style={styles.linkBack} onPress={goBackStep} activeOpacity={0.7}>
                        <Text style={styles.linkBackText}>Previous angle</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    /* permission / bootstrap */
    bootstrapRoot: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
    bootstrapHint: { fontSize: 14, color: colors.textMuted },
    permWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    permText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
    permBtn: {
        backgroundColor: colors.foreground,
        paddingHorizontal: spacing.xl,
        paddingVertical: 14,
        borderRadius: borderRadius.full,
    },
    permBtnText: { fontSize: 15, fontWeight: '600', color: colors.background },

    /* scrims */
    topScrim: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '38%',
    },
    bottomScrim: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '42%',
    },

    /* header */
    header: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    headerIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    stepDots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepDot: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    stepDotActive: { width: 24, backgroundColor: '#FFFFFF' },
    stepDotDone:   { backgroundColor: 'rgba(255,255,255,0.75)' },

    /* title */
    titleBlock: {
        position: 'absolute',
        top: 108,
        left: 0, right: 0,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    title: {
        fontFamily: fonts.sansLight,
        fontSize: 20,
        fontWeight: '300',
        color: 'rgba(255,255,255,0.90)',
        letterSpacing: 0.8,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    instruction: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: 'rgba(255,255,255,0.42)',
        textAlign: 'center',
        marginTop: 4,
        letterSpacing: 0.1,
    },
    noticePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 14,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.28)',
        maxWidth: 340,
    },
    noticeText: {
        flexShrink: 1,
        fontFamily: fonts.sans,
        fontSize: 12.5,
        lineHeight: 17,
        color: '#FFFFFF',
    },

    /* camera */
    cameraPaused: { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
    cameraPausedText: { color: '#fff', fontSize: 15, opacity: 0.85 },

    /* bottom bar */
    bottomBar: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        alignItems: 'center',
        paddingHorizontal: 24,
        gap: 10,
    },

    /* capture row */
    captureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 8,
    },
    sideAction: {
        width: 48, height: 48,
        alignItems: 'center', justifyContent: 'center',
    },

    /* glassy shutter button */
    shutterOuter: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.28)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
    },
    shutterInner: {
        width: 58, height: 58, borderRadius: 29,
        backgroundColor: 'rgba(255,255,255,0.48)',
    },

    /* confirmed state */
    confirmedRow: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    glassBtn: {
        flex: 1,
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    glassBtnText: {
        fontFamily: fonts.sansMedium,
        fontSize: 15,
        color: '#FFFFFF',
    },
    solidBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center',
        gap: 6,
        paddingVertical: 15,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
    },
    solidBtnText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        color: '#000000',
    },

    /* previous angle */
    linkBack: { paddingVertical: 4 },
    linkBackText: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: 'rgba(255,255,255,0.45)',
    },
});
