/**
 * Onboarding v2 (flag `onboardingV2`) — a calm, ~2-minute pass that learns the
 * real shape of someone's day so the scheduler can fit routines INTO their life
 * instead of on top of it. Seven light steps, smart defaults you nudge (never a
 * blank form), each new question carrying a one-line "why it matters":
 *
 *   1. Goals       — 5 maxx tiles, first tap = #1 priority, up to 3.
 *   2. Motivation  — one tap; Life-Model `motivation` (tunes Max's voice).
 *   3. Day shape   — wake / get-ready / down steppers (the day's envelope).
 *   4. Work        — set hours + where (office/hybrid/home) + commute. The
 *                    commute becomes real protected time on the schedule.
 *   5. Energy      — chronotype (a day-one peak prior) + usual dinner.
 *   6. Rhythm      — workout window, weekends, daily anchors.
 *   7. Your day    — a read-only recap of the day we just learned, so the user
 *                    sees themselves in it before we build. Doubles as the
 *                    mental model for the Plan timeline they can edit later.
 *
 * Saving (completed=false) triggers the backend starter-routine generation,
 * then we push RoutineReveal (RevealV2 renders behind the same route name).
 */
import React, { useEffect, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    Easing, Extrapolation, interpolate, useAnimatedStyle,
    useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import OnboardingIcon, { OnboardingIconKind } from '../../components/onboarding/OnboardingIcon';

const INK = '#1C1A17';
const CREAM = '#F7F0EA';        // text/icon on an ink-filled (selected) surface
const GOLD = '#C9A24E';         // the one warm accent — softened so it doesn't fight the ink
const MUTE = '#97928A';
const SUB = '#5C574E';
const HAIR = 'rgba(28,26,23,0.10)';   // warm hairline
const WASH = 'rgba(28,26,23,0.05)';   // faint inset wash (stepper btns, seg track)

// One custom illustrated icon per step (see components/onboarding/OnboardingIcon).
const STEP_ICONS: OnboardingIconKind[] = [
    'goals', 'motivation', 'dayshape', 'work', 'energy', 'rhythm', 'recap',
];

// One thin top progress bar that fills as the user advances (drops the dots
// + the loud "STEP X OF 7"). The fill animates on each step.
function ProgressBar({ index, total }: { index: number; total: number }) {
    const p = useSharedValue((index + 1) / total);
    useEffect(() => {
        p.value = withTiming((index + 1) / total, { duration: 380, easing: Easing.out(Easing.cubic) });
    }, [index, total, p]);
    const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
    return (
        <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, style]} />
        </View>
    );
}

const MAXX_TILES = [
    { id: 'skinmax', token: 'skin', label: 'Skinmax', tagline: 'clearer, calmer skin', icon: 'sparkles-outline' },
    { id: 'fitmax', token: 'body', label: 'Fitmax', tagline: 'build your best body', icon: 'fitness-outline' },
    { id: 'hairmax', token: 'hair', label: 'Hairmax', tagline: 'fuller, healthier hair', icon: 'cut-outline' },
    { id: 'heightmax', token: 'height', label: 'Heightmax', tagline: 'posture and presence', icon: 'resize-outline' },
    { id: 'bonemax', token: 'face_structure', label: 'Bonemax', tagline: 'a sharper jaw and frame', icon: 'body-outline' },
] as const;

const MOTIVATIONS = [
    { id: 'event', label: 'A specific date or event' },
    { id: 'photos', label: 'Want to feel better in photos' },
    { id: 'comment', label: 'Someone said something' },
    { id: 'long_term', label: 'Long term, no rush' },
    { id: 'curious', label: 'Just curious' },
] as const;

const ANCHORS = [
    { id: 'brush_teeth', label: 'Brush teeth' },
    { id: 'shower', label: 'Shower' },
    { id: 'coffee', label: 'Coffee' },
    { id: 'commute', label: 'Commute' },
] as const;

const WORKOUTS = [
    ['before_work', 'Before work'],
    ['lunch', 'Lunch'],
    ['after_work', 'After work'],
    ['evening', 'Evenings'],
] as const;

const CHRONOTYPES = [
    ['morning', 'Mornings'],
    ['afternoon', 'Afternoons'],
    ['evening', 'Evenings'],
] as const;

const LOCATIONS = [
    ['office', 'In office'],
    ['hybrid', 'Hybrid'],
    ['home', 'From home'],
] as const;

const COMMUTES = [15, 30, 45, 60] as const;

const WORKOUT_LABEL: Record<string, string> = {
    before_work: 'Before work',
    lunch: 'At lunch',
    after_work: 'After work',
    evening: 'In the evening',
};

function fmt12(min: number): string {
    let h = Math.floor(min / 60);
    const m = min % 60;
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

function hhmm(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function TimeStepper({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <View style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>{label}</Text>
            <View style={styles.stepperControls}>
                <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => onChange((value - 15 + 1440) % 1440)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 15 minutes earlier`}
                >
                    <Ionicons name="remove" size={18} color={INK} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{fmt12(value)}</Text>
                <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => onChange((value + 15) % 1440)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 15 minutes later`}
                >
                    <Ionicons name="add" size={18} color={INK} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

function Pill({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[styles.pill, active && styles.pillActive]}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
        >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function OnboardingV2Screen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();

    const [step, setStep] = useState(0);
    const [dir, setDir] = useState(1); // +1 forward, -1 back — drives slide direction
    const [goals, setGoals] = useState<string[]>([]);
    const [motivation, setMotivation] = useState<string | null>(null);
    const [wakeMin, setWakeMin] = useState(7 * 60);
    const [getReadyMin, setGetReadyMin] = useState(7 * 60 + 30);
    const [sleepMin, setSleepMin] = useState(23 * 60);
    const [works, setWorks] = useState(true);
    const [workStartMin, setWorkStartMin] = useState(9 * 60);
    const [workEndMin, setWorkEndMin] = useState(17 * 60);
    const [workLocation, setWorkLocation] = useState<string>('office');
    const [commuteMin, setCommuteMin] = useState<number>(30);
    const [chronotype, setChronotype] = useState<string>('morning');
    const [dinnerMin, setDinnerMin] = useState(19 * 60);
    const [anchors, setAnchors] = useState<string[]>([]);
    const [workoutChoice, setWorkoutChoice] = useState<string>('after_work');
    const [weekendShift, setWeekendShift] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleGoal = (id: string) => {
        setGoals((g) =>
            g.includes(id) ? g.filter((x) => x !== id) : g.length < 3 ? [...g, id] : g,
        );
    };

    const hasCommute = works && workLocation !== 'home';

    const finish = async () => {
        setSaving(true);
        setError(null);
        try {
            const tokens = goals
                .map((id) => MAXX_TILES.find((t) => t.id === id)?.token)
                .filter(Boolean) as string[];
            const payload = {
                goals,
                priority_order: tokens,
                motivation,
                wake_time: hhmm(wakeMin),
                get_ready_time: hhmm(getReadyMin),
                sleep_time: hhmm(sleepMin),
                obligations: works
                    ? [{ label: 'Work', start: hhmm(workStartMin), end: hhmm(workEndMin), days: 'weekdays' }]
                    : [],
                work_location: works ? workLocation : 'home',
                commute_minutes: hasCommute ? commuteMin : 0,
                chronotype,
                dinner_time: hhmm(dinnerMin),
                anchor_cues: anchors,
                workout_window_choice: workoutChoice,
                weekend_shift: weekendShift,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                completed: false,
            };
            await api.saveOnboarding(payload as any);
            // Navigate FIRST (with the answers as params so the reveal does
            // not depend on a user refetch), THEN refresh auth state — a
            // refresh that swaps the root stack would eat the navigation.
            navigation.navigate('RoutineReveal', { ob: payload });
            refreshUser().catch(() => {});
        } catch (e: any) {
            setError("Couldn't save. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    const recap: { icon: string; label: string; value: string }[] = [
        { icon: 'sunny-outline', label: 'Wake', value: fmt12(wakeMin) },
        { icon: 'water-outline', label: 'Get ready', value: fmt12(getReadyMin) },
        ...(works
            ? [{ icon: 'briefcase-outline', label: 'Work', value: `${fmt12(workStartMin)} – ${fmt12(workEndMin)}` }]
            : []),
        ...(hasCommute
            ? [{ icon: 'car-outline', label: 'Commute', value: `${commuteMin} min each way` }]
            : []),
        { icon: 'barbell-outline', label: 'Workout', value: WORKOUT_LABEL[workoutChoice] || 'After work' },
        { icon: 'restaurant-outline', label: 'Dinner', value: fmt12(dinnerMin) },
        { icon: 'moon-outline', label: 'Wind down', value: fmt12(sleepMin) },
    ];

    const steps = [
        // 1 — goals
        {
            kicker: 'STEP 1 OF 7',
            title: 'What are we\nworking on?',
            sub: 'Pick up to 3.',
            canNext: goals.length > 0,
            body: (
                <View style={{ gap: 10, marginTop: 18 }}>
                    {MAXX_TILES.map((t) => {
                        const idx = goals.indexOf(t.id);
                        const active = idx >= 0;
                        return (
                            <TouchableOpacity
                                key={t.id}
                                style={[styles.tile, active && styles.tileActive]}
                                onPress={() => toggleGoal(t.id)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={t.label}
                            >
                                <View style={styles.tileIcon}>
                                    <Ionicons name={t.icon as any} size={20} color={active ? CREAM : INK} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>{t.label}</Text>
                                    <Text style={[styles.tileTag, active && styles.tileTagActive]}>{t.tagline}</Text>
                                </View>
                                {active ? (
                                    <View style={styles.rankBadge}>
                                        <Text style={styles.rankText}>{idx + 1}</Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ),
        },
        // 2 — motivation
        {
            kicker: 'STEP 2 OF 7',
            title: "What's pulling\nyou here?",
            sub: 'It helps Max talk to you straight.',
            canNext: !!motivation,
            body: (
                <View style={{ gap: 10, marginTop: 18 }}>
                    {MOTIVATIONS.map((m) => {
                        const active = motivation === m.id;
                        return (
                            <TouchableOpacity
                                key={m.id}
                                style={[styles.tile, active && styles.tileActive]}
                                onPress={() => setMotivation(m.id)}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={m.label}
                            >
                                <Text style={[styles.tileLabel, { flex: 1 }, active && styles.tileLabelActive]}>{m.label}</Text>
                                {active ? (
                                    <Ionicons name="checkmark" size={20} color={GOLD} />
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ),
        },
        // 3 — day shape
        {
            kicker: 'STEP 3 OF 7',
            title: 'The shape of\nyour day',
            sub: 'Max builds around your real hours, not over them.',
            canNext: true,
            body: (
                <View style={{ marginTop: 18 }}>
                    <View style={styles.shapeCard}>
                        <TimeStepper label="Wake around" value={wakeMin} onChange={setWakeMin} />
                        <View style={styles.hairline} />
                        <TimeStepper label="Get ready around" value={getReadyMin} onChange={setGetReadyMin} />
                        <View style={styles.hairline} />
                        <TimeStepper label="Wind down around" value={sleepMin} onChange={setSleepMin} />
                    </View>
                    <Text style={styles.helpNote}>
                        When your AM skin, hair, and mewing routine lands.
                    </Text>
                </View>
            ),
        },
        // 4 — work & commute
        {
            kicker: 'STEP 4 OF 7',
            title: 'Work or\nschool?',
            sub: 'So nothing ever gets scheduled over it — including the drive.',
            canNext: true,
            body: (
                <View style={{ marginTop: 18 }}>
                    <TouchableOpacity
                        style={[styles.workChip, works && styles.workChipActive]}
                        onPress={() => setWorks((w) => !w)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: works }}
                        accessibilityLabel="I have set weekday hours"
                    >
                        <Ionicons
                            name={works ? 'checkmark-circle' : 'ellipse-outline'}
                            size={18}
                            color={works ? GOLD : MUTE}
                        />
                        <Text style={[styles.workChipText, works && styles.workChipTextActive]}>I have set weekday hours</Text>
                    </TouchableOpacity>

                    {works ? (
                        <>
                            <View style={[styles.shapeCard, { marginTop: 12 }]}>
                                <TimeStepper label="Starts" value={workStartMin} onChange={setWorkStartMin} />
                                <View style={styles.hairline} />
                                <TimeStepper label="Ends" value={workEndMin} onChange={setWorkEndMin} />
                            </View>

                            <Text style={styles.groupLabel}>WHERE?</Text>
                            <View style={styles.seg}>
                                {LOCATIONS.map(([id, label]) => {
                                    const active = workLocation === id;
                                    return (
                                        <TouchableOpacity
                                            key={id}
                                            style={[styles.segItem, active && styles.segItemActive]}
                                            onPress={() => setWorkLocation(id)}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: active }}
                                            accessibilityLabel={label}
                                        >
                                            <Text style={[styles.segText, active && styles.segTextActive]}>
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {workLocation !== 'home' ? (
                                <>
                                    <Text style={styles.groupLabel}>COMMUTE EACH WAY</Text>
                                    <View style={styles.pillRow}>
                                        {COMMUTES.map((c) => (
                                            <Pill
                                                key={c}
                                                label={c === 60 ? '60+ min' : `${c} min`}
                                                active={commuteMin === c}
                                                onPress={() => setCommuteMin(c)}
                                            />
                                        ))}
                                    </View>
                                </>
                            ) : null}
                        </>
                    ) : null}
                </View>
            ),
        },
        // 5 — energy & meals
        {
            kicker: 'STEP 5 OF 7',
            title: 'Energy &\nmeals',
            sub: 'Hard things land when you actually have the most in the tank.',
            canNext: true,
            body: (
                <View style={{ marginTop: 18 }}>
                    <Text style={[styles.groupLabel, { marginTop: 0 }]}>WHEN ARE YOU SHARPEST?</Text>
                    <View style={styles.pillRow}>
                        {CHRONOTYPES.map(([id, label]) => (
                            <Pill
                                key={id}
                                label={label}
                                active={chronotype === id}
                                onPress={() => setChronotype(id)}
                            />
                        ))}
                    </View>

                    <View style={[styles.shapeCard, { marginTop: 20 }]}>
                        <TimeStepper label="Dinner around" value={dinnerMin} onChange={setDinnerMin} />
                    </View>
                    <Text style={styles.helpNote}>
                        Keeps your evening routine clear of dinner.
                    </Text>
                </View>
            ),
        },
        // 6 — rhythm
        {
            kicker: 'STEP 6 OF 7',
            title: 'Your rhythm',
            sub: 'So things land when they actually happen.',
            canNext: true,
            body: (
                <View style={{ marginTop: 18 }}>
                    <Text style={[styles.groupLabel, { marginTop: 0 }]}>WHEN WOULD YOU WORK OUT?</Text>
                    <View style={styles.pillRow}>
                        {WORKOUTS.map(([id, label]) => (
                            <Pill
                                key={id}
                                label={label}
                                active={workoutChoice === id}
                                onPress={() => setWorkoutChoice(id)}
                            />
                        ))}
                    </View>

                    <Text style={styles.groupLabel}>WEEKENDS?</Text>
                    <View style={styles.pillRow}>
                        <Pill label="I sleep in" active={weekendShift === true} onPress={() => setWeekendShift(true)} />
                        <Pill label="Same rhythm" active={weekendShift === false} onPress={() => setWeekendShift(false)} />
                    </View>

                    <Text style={styles.groupLabel}>WHAT DO YOU ALREADY DO EVERY DAY?</Text>
                    <View style={styles.pillRow}>
                        {ANCHORS.map((a) => {
                            const active = anchors.includes(a.id);
                            return (
                                <Pill
                                    key={a.id}
                                    label={a.label}
                                    active={active}
                                    onPress={() =>
                                        setAnchors((arr) =>
                                            active ? arr.filter((x) => x !== a.id) : [...arr, a.id],
                                        )
                                    }
                                />
                            );
                        })}
                    </View>
                </View>
            ),
        },
        // 7 — recap
        {
            kicker: 'STEP 7 OF 7',
            title: "Here's your\nday",
            sub: 'Max fits your routines into the gaps. You can drag any of this later in Plan.',
            canNext: true,
            body: (
                <View style={styles.recapList}>
                    {recap.map((r, i) => (
                        <View key={r.label}>
                            {i > 0 ? <View style={styles.hairline} /> : null}
                            <View style={styles.recapRow}>
                                <View style={styles.recapIcon}>
                                    <Ionicons name={r.icon as any} size={17} color={MUTE} />
                                </View>
                                <Text style={styles.recapLabel}>{r.label}</Text>
                                <Text style={styles.recapValue}>{r.value}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            ),
        },
    ];

    const current = steps[step];
    const isLast = step === steps.length - 1;

    const goNext = () => {
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        if (isLast) { finish(); return; }
        setDir(1);
        setStep((s) => s + 1);
    };
    const goBack = () => {
        if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
        }
        setDir(-1);
        setStep((s) => s - 1);
    };

    // Shared-value driven page transition — robust on web AND native (unlike
    // layout animations, which get stuck at opacity 0 on web). On each step
    // change `t` runs 0->1; the icon leads and the header/body stagger in via
    // interpolation ranges. `dir` flips the slide direction.
    const reduced = useReducedMotion();
    const t = useSharedValue(1);
    useEffect(() => {
        if (reduced) { t.value = 1; return; }
        t.value = 0;
        t.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    }, [step, reduced, t]);
    const iconStyle = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
        transform: [
            { translateX: interpolate(t.value, [0, 1], [dir * 46, 0], Extrapolation.CLAMP) },
            { scale: interpolate(t.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
        ],
    }));
    const headStyle = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0.12, 0.7], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateX: interpolate(t.value, [0.12, 1], [dir * 34, 0], Extrapolation.CLAMP) }],
    }));
    const bodyStyle = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0.28, 0.9], [0, 1], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(t.value, [0.28, 1], [16, 0], Extrapolation.CLAMP) }],
    }));

    return (
        <ScreenBackdrop>
            <View style={{ flex: 1, paddingTop: insets.top + 14, paddingHorizontal: 24 }}>
                <View style={styles.topRow}>
                    {step > 0 ? (
                        <TouchableOpacity
                            onPress={goBack}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Back"
                        >
                            <Ionicons name="chevron-back" size={24} color={INK} />
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 24 }} />
                    )}
                    <ProgressBar index={step} total={steps.length} />
                    <Text style={styles.progressCount}>{step + 1}/{steps.length}</Text>
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View style={[styles.heroIcon, iconStyle]}>
                        <OnboardingIcon kind={STEP_ICONS[step]} size={96} />
                    </Animated.View>

                    <Animated.View style={[styles.headBlock, headStyle]}>
                        <Text style={styles.title}>{current.title}</Text>
                        <Text style={styles.sub}>{current.sub}</Text>
                    </Animated.View>

                    <Animated.View style={[styles.bodyBlock, bodyStyle]}>
                        {current.body}
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                    </Animated.View>
                </ScrollView>

                <View style={{ paddingBottom: insets.bottom + 16 }}>
                    <GlassButton
                        variant="primary"
                        label={isLast ? 'Build my day' : 'Next'}
                        loading={saving}
                        disabled={!current.canNext}
                        onPress={goNext}
                    />
                </View>
            </View>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    // top: back chevron · thin progress bar · quiet count
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(28,26,23,0.08)', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2, backgroundColor: INK },
    progressCount: { fontFamily: 'Matter-Medium', fontSize: 12, color: MUTE, width: 30, textAlign: 'right' },

    heroIcon: { alignItems: 'center', marginTop: 22, marginBottom: 18 },
    headBlock: { alignItems: 'center', width: '100%' },
    bodyBlock: { width: '100%', marginTop: 30 },
    title: { fontFamily: 'Fraunces', fontSize: 33, color: INK, letterSpacing: -1, lineHeight: 39, textAlign: 'center' },
    sub: { fontFamily: 'Matter-Regular', fontSize: 15, color: SUB, marginTop: 10, lineHeight: 21, textAlign: 'center', paddingHorizontal: 16 },
    helpNote: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 12, lineHeight: 18, textAlign: 'center' },

    // selection rows — ink-inversion, no card, no shadow
    tile: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        minHeight: 62,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: HAIR,
        backgroundColor: 'transparent',
    },
    tileActive: { backgroundColor: INK, borderColor: INK },
    tileIcon: { width: 26, alignItems: 'center', marginRight: 14 },
    tileLabel: { fontFamily: 'Matter-Medium', fontSize: 16, color: INK },
    tileLabelActive: { color: CREAM },
    tileTag: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 2 },
    tileTagActive: { color: 'rgba(247,240,234,0.62)' },
    rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
    rankText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: '#1C1A17' },

    // steppers — borderless, calm numeral
    shapeCard: { width: '100%' },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: HAIR },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    stepperLabel: { fontFamily: 'Matter-Medium', fontSize: 15.5, color: INK },
    stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: WASH,
        alignItems: 'center', justifyContent: 'center',
    },
    stepperValue: { fontFamily: 'Matter-SemiBold', fontSize: 17, color: INK, minWidth: 96, textAlign: 'center' },

    workChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 18,
        paddingVertical: 15,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: HAIR,
        backgroundColor: 'transparent',
    },
    workChipActive: { backgroundColor: INK, borderColor: INK },
    workChipText: { fontFamily: 'Matter-Medium', fontSize: 15, color: INK },
    workChipTextActive: { color: CREAM },

    groupLabel: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.2, color: MUTE, marginTop: 22, marginBottom: 4, textTransform: 'uppercase', textAlign: 'center' },

    // chips — ink-inversion pills
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, justifyContent: 'center' },
    pill: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: HAIR,
        backgroundColor: 'transparent',
        minHeight: 38,
        justifyContent: 'center',
    },
    pillActive: { backgroundColor: INK, borderColor: INK },
    pillText: { fontFamily: 'Matter-Medium', fontSize: 14, color: SUB },
    pillTextActive: { color: CREAM },

    // segmented — ink thumb on a faint wash
    seg: { flexDirection: 'row', marginTop: 6, padding: 4, gap: 4, backgroundColor: WASH, borderRadius: 14 },
    segItem: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
    segItemActive: { backgroundColor: INK },
    segText: { fontFamily: 'Matter-Medium', fontSize: 14, color: SUB },
    segTextActive: { color: CREAM },

    // recap — clean hairline list, no card
    recapList: { width: '100%', marginTop: 6 },
    recapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
    recapIcon: { width: 24, alignItems: 'center', marginRight: 14 },
    recapLabel: { fontFamily: 'Matter-Regular', fontSize: 15.5, color: SUB, flex: 1 },
    recapValue: { fontFamily: 'Matter-Medium', fontSize: 15.5, color: INK },

    error: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#C0452C', marginTop: 14, textAlign: 'center' },
});
