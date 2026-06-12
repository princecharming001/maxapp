/**
 * Onboarding v2 (spec 3.3, flag `onboardingV2`) - ~90 seconds to the reveal,
 * free until the marketplace. Three steps, no account-tier paywall, no
 * permission asks (notifications get ONE value-first pre-prompt later, on
 * the reveal screen; camera is asked in You > New scan, never here).
 *
 *   1. Goal pick - 5 maxx tiles, first tap = #1 priority, up to 3.
 *   2. Motivation - ONE question, 5 chips. Stored as Life-Model `motivation`
 *      (stated); used only in the reveal close-line + welcome-back copy.
 *   3. Day shape - wake/down steppers + prefilled "I work 9-5 weekdays"
 *      chip + "what do you already do every day?" anchor chips.
 *
 * Saving (completed=false) triggers the backend starter-routine generation,
 * then we push RoutineReveal (RevealV2 renders behind the same route name).
 */
import React, { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassButton } from '../../components/glass/GlassButton';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const INK = '#111113';
const GOLD = '#D4A017';
const MUTE = '#8A8A92';

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

export default function OnboardingV2Screen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();

    const [step, setStep] = useState(0);
    const [goals, setGoals] = useState<string[]>([]);
    const [motivation, setMotivation] = useState<string | null>(null);
    const [wakeMin, setWakeMin] = useState(7 * 60);
    const [sleepMin, setSleepMin] = useState(23 * 60);
    const [works95, setWorks95] = useState(true);
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
                sleep_time: hhmm(sleepMin),
                obligations: works95
                    ? [{ label: 'Work', start: '09:00', end: '17:00', days: 'weekdays' }]
                    : [],
                anchor_cues: anchors,
                workout_window_choice: workoutChoice,
                weekend_shift: weekendShift,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                completed: false,
            };
            await api.saveOnboarding(payload as any);
            // Navigate FIRST (with the answers as params so the reveal does
            // not depend on a user refetch), THEN refresh auth state - a
            // refresh that swaps the root stack would eat the navigation.
            navigation.navigate('RoutineReveal', { ob: payload });
            refreshUser().catch(() => {});
        } catch (e: any) {
            setError("Couldn't save. Check your connection and try again.");
        } finally {
            setSaving(false);
        }
    };

    const steps = [
        // 1 - goals
        {
            kicker: 'STEP 1 OF 3',
            title: 'What are we\nworking on?',
            sub: 'Pick up to 3. Your first pick leads.',
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
                                    <Ionicons name={t.icon as any} size={19} color={INK} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.tileLabel}>{t.label}</Text>
                                    <Text style={styles.tileTag}>{t.tagline}</Text>
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
        // 2 - motivation
        {
            kicker: 'STEP 2 OF 3',
            title: "What's pulling\nyou here?",
            sub: 'One tap. It helps Max talk to you straight.',
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
                                <Text style={[styles.tileLabel, { flex: 1 }]}>{m.label}</Text>
                                {active ? (
                                    <Ionicons name="checkmark-circle" size={20} color={GOLD} />
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ),
        },
        // 3 - day shape
        {
            kicker: 'STEP 3 OF 3',
            title: 'The shape of\nyour day',
            sub: 'Max builds around your real schedule, not over it.',
            canNext: true,
            body: (
                <View style={{ marginTop: 18 }}>
                    <View style={styles.shapeCard}>
                        <TimeStepper label="Up around" value={wakeMin} onChange={setWakeMin} />
                        <View style={styles.hairline} />
                        <TimeStepper label="Down around" value={sleepMin} onChange={setSleepMin} />
                    </View>

                    <TouchableOpacity
                        style={[styles.workChip, works95 && styles.workChipActive]}
                        onPress={() => setWorks95((w) => !w)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: works95 }}
                        accessibilityLabel="I work 9 to 5 on weekdays"
                    >
                        <Ionicons
                            name={works95 ? 'checkmark-circle' : 'ellipse-outline'}
                            size={18}
                            color={works95 ? GOLD : MUTE}
                        />
                        <Text style={styles.workChipText}>I work 9-5 weekdays</Text>
                    </TouchableOpacity>

                    <Text style={styles.anchorLabel}>WHEN WOULD A WORKOUT ACTUALLY HAPPEN?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {([
                            ['before_work', 'Before work'],
                            ['lunch', 'Lunch'],
                            ['after_work', 'After work'],
                            ['evening', 'Evenings'],
                        ] as const).map(([id, label]) => {
                            const active = workoutChoice === id;
                            return (
                                <TouchableOpacity
                                    key={id}
                                    style={[styles.anchorChip, active && styles.anchorChipActive]}
                                    onPress={() => setWorkoutChoice(id)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.anchorChipText, active && { color: '#8a6a10' }]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.anchorLabel}>WEEKENDS?</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        {([
                            [true, 'I sleep in'],
                            [false, 'Same rhythm'],
                        ] as const).map(([val, label]) => {
                            const active = weekendShift === val;
                            return (
                                <TouchableOpacity
                                    key={label}
                                    style={[styles.anchorChip, active && styles.anchorChipActive]}
                                    onPress={() => setWeekendShift(val)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.anchorChipText, active && { color: '#8a6a10' }]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.anchorLabel}>WHAT DO YOU ALREADY DO EVERY DAY?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {ANCHORS.map((a) => {
                            const active = anchors.includes(a.id);
                            return (
                                <TouchableOpacity
                                    key={a.id}
                                    style={[styles.anchorChip, active && styles.anchorChipActive]}
                                    onPress={() =>
                                        setAnchors((arr) =>
                                            active ? arr.filter((x) => x !== a.id) : [...arr, a.id],
                                        )
                                    }
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={a.label}
                                >
                                    <Text style={[styles.anchorChipText, active && { color: '#8a6a10' }]}>
                                        {a.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            ),
        },
    ];

    const current = steps[step];
    const isLast = step === steps.length - 1;

    return (
        <ScreenBackdrop>
            <View style={{ flex: 1, paddingTop: insets.top + 16, paddingHorizontal: 22 }}>
                <View style={styles.topRow}>
                    {step > 0 ? (
                        <TouchableOpacity
                            onPress={() => setStep((s) => s - 1)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Back"
                        >
                            <Ionicons name="arrow-back" size={22} color={INK} />
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 22 }} />
                    )}
                    <View style={styles.dots}>
                        {steps.map((_, i) => (
                            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
                        ))}
                    </View>
                    <View style={{ width: 22 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.kicker}>{current.kicker}</Text>
                    <Text style={styles.title}>{current.title}</Text>
                    <Text style={styles.sub}>{current.sub}</Text>
                    {current.body}
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                </ScrollView>

                <View style={{ paddingBottom: insets.bottom + 16 }}>
                    <GlassButton
                        variant="primary"
                        label={isLast ? 'Build my day' : 'Next'}
                        loading={saving}
                        disabled={!current.canNext}
                        onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
                    />
                </View>
            </View>
        </ScreenBackdrop>
    );
}

const styles = StyleSheet.create({
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(17,17,19,0.15)' },
    dotActive: { backgroundColor: INK, width: 18 },
    kicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: GOLD, marginTop: 24 },
    title: { fontFamily: 'PlayfairDisplay-Regular', fontSize: 36, color: INK, letterSpacing: -0.8, marginTop: 8, lineHeight: 42 },
    sub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, marginTop: 8, lineHeight: 21 },
    tile: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        minHeight: 44,
    },
    tileActive: { borderColor: GOLD, backgroundColor: 'rgba(212,160,23,0.1)' },
    tileIcon: {
        width: 38,
        height: 38,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    tileLabel: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK },
    tileTag: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    rankBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: GOLD,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankText: { fontFamily: 'Matter-SemiBold', fontSize: 12, color: '#fff' },
    shapeCard: {
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        paddingHorizontal: 16,
    },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(17,17,19,0.1)' },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    stepperLabel: { fontFamily: 'Matter-Medium', fontSize: 15, color: INK },
    stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(17,17,19,0.08)',
    },
    stepperValue: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK, width: 84, textAlign: 'center' },
    workChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    workChipActive: { borderColor: 'rgba(212,160,23,0.5)' },
    workChipText: { fontFamily: 'Matter-Medium', fontSize: 14.5, color: INK },
    anchorLabel: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE, marginTop: 20 },
    anchorChip: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        minHeight: 36,
    },
    anchorChipActive: { borderColor: GOLD, backgroundColor: 'rgba(212,160,23,0.12)' },
    anchorChipText: { fontFamily: 'Matter-Medium', fontSize: 13.5, color: '#3A3A3F' },
    error: { fontFamily: 'Matter-Regular', fontSize: 13, color: '#C0452C', marginTop: 14 },
});
