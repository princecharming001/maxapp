/**
 * Onboarding — minimalist, centered, one question per page.
 *
 * Layout principles:
 *   - Content vertically centered in the viewport
 *   - Max-width container (~380 px) so the content never sprawls
 *   - One visual focus per page: title + input. No fluff.
 *   - Tiny progress dots at top, sticky CTA at bottom
 *   - Big Playfair serif for the question; sans for everything else
 *   - Soft fade-in on each step (no slide), 220 ms
 *
 * Steps: gender → age → height → weight → priority ranking
 *
 * Data shape on save:
 *   gender:           'male' | 'female' | 'other' | 'prefer_not_to_say'
 *   age:              number (13–100)
 *   height_cm:        canonical metric height
 *   weight_kg:        canonical metric weight
 *   unit_system:      'metric' | 'imperial'
 *   priority_ranking: string[]   (max-id keys, ordered #1 → #5)
 *   goals:            top 3 of priority_ranking
 *   completed:        true
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    PanResponder,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { borderRadius, colors, fonts, spacing, typography } from '../../theme/dark';
import OnairosConnectModal from '../../components/OnairosConnectModal';

/* ── Vocabulary ───────────────────────────────────────────────────────── */

type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
type UnitSystem = 'metric' | 'imperial';
type PriorityKey = 'bonemax' | 'skinmax' | 'heightmax' | 'fitmax' | 'hairmax';

const GENDERS: { id: Gender; label: string }[] = [
    { id: 'male', label: 'Male' },
    { id: 'female', label: 'Female' },
    { id: 'other', label: 'Other' },
    { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const PRIORITIES: { id: PriorityKey; label: string }[] = [
    { id: 'bonemax',   label: 'Bone structure' },
    { id: 'skinmax',   label: 'Skin quality' },
    { id: 'heightmax', label: 'Height' },
    { id: 'fitmax',    label: 'Physique' },
    { id: 'hairmax',   label: 'Hair quality' },
];

const STEP_TITLES = [
    'How do you identify?',
    'How old are you?',
    'How tall are you?',
    "What's your weight?",
    'When are you busy?',
    'What matters most?',
    'How hard do you want to go?',
    'Personalize further?',
] as const;

const STEP_COUNT = STEP_TITLES.length;
// Onairos step is optional — the last step. Skipping is fine, so it
// doesn't gate the CTA's enabled state.
const ONAIROS_STEP_INDEX = 7;

type Intensity = 'chill' | 'standard' | 'sweatmode';
const INTENSITIES: { id: Intensity; label: string; blurb: string }[] = [
    { id: 'chill',     label: 'Chill',     blurb: 'A few key things a day. Easy to keep up.' },
    { id: 'standard',  label: 'Standard',  blurb: 'A solid daily routine. The default.' },
    { id: 'sweatmode', label: 'Sweat mode', blurb: 'Pack it in. For people who want max output.' },
];

/* ── Conversions ──────────────────────────────────────────────────────── */

const cmToFtIn = (cm: number) => {
    const totalIn = cm / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inch = Math.round(totalIn - ft * 12);
    return inch === 12 ? { ft: ft + 1, inch: 0 } : { ft, inch };
};
const kgToLb = (kg: number) => Math.round(kg * 2.2046);

/* ── Component ────────────────────────────────────────────────────────── */

export default function OnboardingScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    const [gender, setGender] = useState<Gender | null>(null);
    const [age, setAge] = useState(22);
    const [unit, setUnit] = useState<UnitSystem>('imperial');
    const [heightCm, setHeightCm] = useState(178);
    const [weightKg, setWeightKg] = useState(72);
    // Schedule (busy hours) — 15-min slots since midnight (0..95).
    // Defaults: wake 07:00 (28), sleep 23:00 (92), work 09:00–17:00 (36..68).
    const [wakeSlot, setWakeSlot] = useState(28);
    const [sleepSlot, setSleepSlot] = useState(92);
    const [hasWork, setHasWork] = useState<'yes' | 'flexible' | null>(null);
    const [workStartSlot, setWorkStartSlot] = useState(36);
    const [workEndSlot, setWorkEndSlot] = useState(68);
    const [priority, setPriority] = useState<PriorityKey[]>([]);
    const [intensity, setIntensity] = useState<Intensity | null>(null);
    // Onairos: tracks whether the user opened the connect modal AND
    // whether the connection succeeded. Both feed into the final
    // step's UI state ("Connect" / "Connected ✓").
    const [onairosVisible, setOnairosVisible] = useState(false);
    const [onairosConnected, setOnairosConnected] = useState(false);

    const valid: boolean[] = [
        gender !== null,
        age >= 13 && age <= 100,
        heightCm >= 120 && heightCm <= 230,
        weightKg >= 30 && weightKg <= 230,
        // Schedule step is valid as soon as the user has answered the
        // work-status question (Yes or Flexible). Wake/sleep have safe
        // defaults so we don't block on them.
        hasWork !== null && (hasWork === 'flexible' || workEndSlot > workStartSlot),
        // Top priority is what drives the first routine — we only require #1.
        // Ranking the rest is optional (no more forced all-five).
        priority.length >= 1,
        intensity !== null,
        // Onairos step is optional — always valid so user can skip with one tap.
        true,
    ];

    // Guards the gender step's auto-advance so rapid taps can't queue
    // multiple setStep calls. Holds the single pending advance timeout id.
    const genderAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => {
            if (genderAdvanceTimer.current) clearTimeout(genderAdvanceTimer.current);
        };
    }, []);

    /* Soft fade between steps — no horizontal motion. Quieter than a slide,
       reads as a gentle transition rather than navigation. */
    const fade = useRef(new Animated.Value(1)).current;
    const animate = useCallback(
        (after: () => void) => {
            Animated.timing(fade, {
                toValue: 0,
                duration: 130,
                useNativeDriver: true,
                easing: Easing.out(Easing.quad),
            }).start(() => {
                after();
                Animated.timing(fade, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }).start();
            });
        },
        [fade]
    );

    const goNext = useCallback(() => {
        if (!valid[step]) return;
        if (step >= STEP_COUNT - 1) {
            void submit();
            return;
        }
        animate(() => setStep((s) => s + 1));
    }, [valid, step, animate]);  // eslint-disable-line react-hooks/exhaustive-deps

    const goBack = useCallback(() => {
        if (step <= 0) {
            navigation.goBack();
            return;
        }
        animate(() => setStep((s) => s - 1));
    }, [step, animate, navigation]);

    const submit = async () => {
        if (submitting) return;
        try {
            setSubmitting(true);
            const heightDisplay = unit === 'metric' ? heightCm : Math.round(heightCm / 2.54);
            const weightDisplay = unit === 'metric' ? weightKg : kgToLb(weightKg);
            const top3 = priority.slice(0, 3);
            const wake_time = slotToHHMM(wakeSlot);
            const sleep_time = slotToHHMM(sleepSlot);
            const work_start = hasWork === 'yes' ? slotToHHMM(workStartSlot) : null;
            const work_end = hasWork === 'yes' ? slotToHHMM(workEndSlot) : null;
            const res = await api.saveOnboarding({
                goals: top3,
                experience_level: 'beginner',
                intensity_preference: intensity || 'standard',
                gender: gender || undefined,
                age,
                height: heightDisplay,
                weight: weightDisplay,
                unit_system: unit,
                timezone:
                    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
                completed: true,
                priority_ranking: priority,
                height_cm: heightCm,
                weight_kg: weightKg,
                // schedule anchors used by chatbot + scheduler
                wake_time,
                sleep_time,
                // Work/school is just a (weekday) obligation now — there is no
                // separate work_schedule. The scheduler & coach read it from here.
                obligations:
                    hasWork === 'yes' && work_start && work_end
                        ? [{ label: 'Work', start: work_start, end: work_end, days: 'weekdays' }]
                        : [],
            });
            await refreshUser();
            // Reveal the freshly-built routine before the scan/paywall funnel —
            // value first. The server hands the preview back inline (the
            // schedule endpoints are paid-gated). If it couldn't build one,
            // RoutineReveal forwards straight to FeaturesIntro.
            const firstRoutine = (res as any)?.first_routine ?? null;
            navigation.reset({
                index: 0,
                routes: [{ name: 'RoutineReveal', params: { routine: firstRoutine } }],
            });
        } catch (e) {
            console.error('onboarding save failed', e);
            setSubmitting(false);
            Alert.alert(
                'Could not finish setup',
                'Something went wrong saving your answers. Check your connection and try again.'
            );
        }
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <GenderStep
                        value={gender}
                        onChange={(g) => {
                            setGender(g);
                            // light delay so the selection registers visually.
                            // Guard against rapid taps queuing multiple advances:
                            // clear any pending advance before scheduling a new one.
                            if (genderAdvanceTimer.current) clearTimeout(genderAdvanceTimer.current);
                            genderAdvanceTimer.current = setTimeout(goNext, 200);
                        }}
                    />
                );
            case 1:
                return <AgeStep value={age} onChange={setAge} />;
            case 2:
                return (
                    <HeightStep cm={heightCm} unit={unit} onChangeCm={setHeightCm} onChangeUnit={setUnit} />
                );
            case 3:
                return (
                    <WeightStep kg={weightKg} unit={unit} onChangeKg={setWeightKg} onChangeUnit={setUnit} />
                );
            case 4:
                return (
                    <ScheduleStep
                        wakeSlot={wakeSlot}
                        sleepSlot={sleepSlot}
                        hasWork={hasWork}
                        workStartSlot={workStartSlot}
                        workEndSlot={workEndSlot}
                        onChangeWake={setWakeSlot}
                        onChangeSleep={setSleepSlot}
                        onChangeHasWork={setHasWork}
                        onChangeWorkStart={setWorkStartSlot}
                        onChangeWorkEnd={setWorkEndSlot}
                    />
                );
            case 5:
                return <PriorityStep value={priority} onChange={setPriority} />;
            case 6:
                return <IntensityStep value={intensity} onChange={setIntensity} />;
            case 7:
                return (
                    <OnairosStep
                        connected={onairosConnected}
                        onPressConnect={() => setOnairosVisible(true)}
                    />
                );
        }
        return null;
    };

    return (
        <View style={styles.root}>
            {/* ── Top: back + dots ─────────────────────────────────── */}
            <View style={[styles.topBar, { paddingTop: Math.max(insets.top + spacing.md, 44) }]}>
                <TouchableOpacity
                    onPress={goBack}
                    style={styles.backBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Back"
                >
                    <Ionicons name="arrow-back" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <View style={styles.stepDots}>
                    {Array.from({ length: STEP_COUNT }).map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                i === step && styles.dotActive,
                                i < step && styles.dotComplete,
                            ]}
                        />
                    ))}
                </View>
                <View style={{ width: 32 }} />
            </View>

            {/* ── Centered content ─────────────────────────────────── */}
            <View style={styles.center}>
                <Animated.View style={[styles.card, { opacity: fade }]}>
                    <Text style={styles.question}>{STEP_TITLES[step]}</Text>
                    <View style={styles.body}>{renderStep()}</View>
                </Animated.View>
            </View>

            {/* ── CTA ───────────────────────────────────────────────── */}
            <View
                style={[
                    styles.footer,
                    { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg) },
                ]}
            >
                <TouchableOpacity
                    style={[styles.cta, !valid[step] && styles.ctaDisabled]}
                    onPress={goNext}
                    disabled={!valid[step] || submitting}
                    activeOpacity={0.85}
                >
                    <Text style={styles.ctaText}>
                        {submitting
                            ? 'Saving…'
                            : step === STEP_COUNT - 1
                                ? (onairosConnected ? 'Continue' : 'Skip & continue')
                                : 'Next'}
                    </Text>
                </TouchableOpacity>
                {!valid[step] && !submitting ? (
                    <Text style={styles.ctaHint}>Pick an option to continue.</Text>
                ) : null}
            </View>

            {/* Onairos modal — opens from the OnairosStep button. */}
            <OnairosConnectModal
                visible={onairosVisible}
                onClose={() => setOnairosVisible(false)}
                onConnected={() => {
                    setOnairosConnected(true);
                    setOnairosVisible(false);
                }}
            />
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 7 — Onairos personalization (optional)                            */
/* ─────────────────────────────────────────────────────────────────────── */

function OnairosStep({
    connected,
    onPressConnect,
}: {
    connected: boolean;
    onPressConnect: () => void;
}) {
    return (
        <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
            <Text style={styles.helperLine}>
                pull personality + habits from apps you already use, so max can
                tailor coaching from day one. you approve every category.
            </Text>

            <View style={styles.onairosBenefits}>
                {[
                    'personalized routine out of the gate',
                    'no second-round onboarding questions',
                    'smarter check-in cadence',
                ].map((line, i) => (
                    <View key={i} style={styles.onairosBenefitRow}>
                        <View style={styles.onairosBenefitDot} />
                        <Text style={styles.onairosBenefitText}>{line}</Text>
                    </View>
                ))}
            </View>

            {connected ? (
                <View style={styles.onairosConnected}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.foreground} />
                    <Text style={styles.onairosConnectedText}>connected. max will use this</Text>
                </View>
            ) : (
                <TouchableOpacity
                    style={styles.onairosBtn}
                    activeOpacity={0.85}
                    onPress={onPressConnect}
                    accessibilityRole="button"
                    accessibilityLabel="Connect Onairos"
                >
                    <Ionicons name="link-outline" size={16} color={colors.buttonText} />
                    <Text style={styles.onairosBtnText}>connect with onairos</Text>
                </TouchableOpacity>
            )}

            <Text style={styles.onairosHint}>
                you can skip and add it later from settings.
            </Text>
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 1 — gender                                                        */
/* ─────────────────────────────────────────────────────────────────────── */

function GenderStep({ value, onChange }: { value: Gender | null; onChange: (g: Gender) => void }) {
    return (
        <View style={{ gap: 10, alignSelf: 'stretch' }}>
            {GENDERS.map((g) => {
                const on = value === g.id;
                return (
                    <TouchableOpacity
                        key={g.id}
                        style={[styles.option, on && styles.optionOn]}
                        activeOpacity={0.6}
                        onPress={() => onChange(g.id)}
                    >
                        <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{g.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 2 — age                                                           */
/* ─────────────────────────────────────────────────────────────────────── */

function AgeStep({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    return (
        <View style={styles.numberStep}>
            <Text style={styles.bigNumber}>{value}</Text>
            <Text style={styles.unit}>years</Text>
            <Slider min={13} max={100} value={value} onChange={onChange} accessibilityLabel="Age in years" />
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 3 — height                                                        */
/* ─────────────────────────────────────────────────────────────────────── */

function HeightStep({
    cm, unit, onChangeCm, onChangeUnit,
}: {
    cm: number;
    unit: UnitSystem;
    onChangeCm: (cm: number) => void;
    onChangeUnit: (u: UnitSystem) => void;
}) {
    const { ft, inch } = cmToFtIn(cm);
    return (
        <View style={styles.numberStep}>
            <UnitToggle unit={unit} onChange={onChangeUnit} labels={['cm', 'ft / in']} />
            {unit === 'metric' ? (
                <>
                    <Text style={styles.bigNumber}>{cm}</Text>
                    <Text style={styles.unit}>cm</Text>
                </>
            ) : (
                <View style={styles.inlineUnits}>
                    <Text style={styles.bigNumber}>{ft}</Text>
                    <Text style={[styles.unit, styles.unitInline]}>ft</Text>
                    <Text style={styles.bigNumber}>{inch}</Text>
                    <Text style={[styles.unit, styles.unitInline]}>in</Text>
                </View>
            )}
            <Slider min={120} max={230} value={cm} onChange={onChangeCm} accessibilityLabel="Height in centimeters" />
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 4 — weight                                                        */
/* ─────────────────────────────────────────────────────────────────────── */

function WeightStep({
    kg, unit, onChangeKg, onChangeUnit,
}: {
    kg: number;
    unit: UnitSystem;
    onChangeKg: (kg: number) => void;
    onChangeUnit: (u: UnitSystem) => void;
}) {
    const display = unit === 'metric' ? kg : kgToLb(kg);
    return (
        <View style={styles.numberStep}>
            <UnitToggle unit={unit} onChange={onChangeUnit} labels={['kg', 'lb']} />
            <Text style={styles.bigNumber}>{display}</Text>
            <Text style={styles.unit}>{unit === 'metric' ? 'kg' : 'lb'}</Text>
            <Slider min={30} max={230} value={kg} onChange={onChangeKg} accessibilityLabel="Weight in kilograms" />
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 5 — priority                                                      */
/* ─────────────────────────────────────────────────────────────────────── */

function PriorityStep({
    value, onChange,
}: {
    value: PriorityKey[];
    onChange: (next: PriorityKey[]) => void;
}) {
    const tap = (id: PriorityKey) => {
        if (value.includes(id)) {
            onChange(value.filter((v) => v !== id));
        } else {
            onChange([...value, id]);
        }
    };
    return (
        <View style={{ alignSelf: 'stretch' }}>
            <Text style={styles.helperLine}>tap your top one first. rank the rest if you want</Text>
            <View style={{ gap: 10, marginTop: spacing.lg }}>
                {PRIORITIES.map((p) => {
                    const idx = value.indexOf(p.id);
                    const on = idx >= 0;
                    return (
                        <TouchableOpacity
                            key={p.id}
                            style={[styles.option, on && styles.optionOn]}
                            activeOpacity={0.6}
                            onPress={() => tap(p.id)}
                        >
                            <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>
                                {p.label}
                            </Text>
                            <View style={[styles.rankBadge, on && styles.rankBadgeOn]}>
                                {on ? <Text style={styles.rankBadgeText}>{idx + 1}</Text> : null}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 6 — intensity                                                     */
/* ─────────────────────────────────────────────────────────────────────── */

function IntensityStep({
    value, onChange,
}: {
    value: Intensity | null;
    onChange: (v: Intensity) => void;
}) {
    return (
        <View style={{ alignSelf: 'stretch' }}>
            <Text style={styles.helperLine}>this sets how full your days are. change it anytime</Text>
            <View style={{ gap: 10, marginTop: spacing.lg }}>
                {INTENSITIES.map((opt) => {
                    const on = value === opt.id;
                    return (
                        <TouchableOpacity
                            key={opt.id}
                            style={[styles.intensityOption, on && styles.optionOn]}
                            activeOpacity={0.6}
                            onPress={() => onChange(opt.id)}
                        >
                            <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>
                                {opt.label}
                            </Text>
                            <Text style={styles.intensityBlurb}>{opt.blurb}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Primitives                                                             */
/* ─────────────────────────────────────────────────────────────────────── */

function UnitToggle({
    unit, onChange, labels,
}: {
    unit: UnitSystem;
    onChange: (u: UnitSystem) => void;
    labels: [string, string];
}) {
    return (
        <View style={styles.toggleWrap}>
            {(['metric', 'imperial'] as UnitSystem[]).map((u, i) => {
                const on = u === unit;
                return (
                    <TouchableOpacity
                        key={u}
                        style={[styles.togglePill, on && styles.togglePillOn]}
                        activeOpacity={0.7}
                        onPress={() => onChange(u)}
                    >
                        <Text style={[styles.togglePillText, on && styles.togglePillTextOn]}>
                            {labels[i]}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Step 5 — schedule (busy hours)                                         */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * 15-min slot → "HH:MM" 24h string.
 *
 * Slots above 95 represent next-day times so a user can pick a 4 AM
 * bedtime without the bedtime slider running out of room. Slot 96 = 00:00
 * next day, slot 112 = 04:00 next day, slot 119 = 05:45 next day. We wrap
 * via modulo so the persisted HH:MM string is always a valid clock face.
 */
const slotToHHMM = (slot: number) => {
    const clamped = Math.max(0, Math.min(143, Math.round(slot)));
    const total = clamped * 15;
    const wrapped = total % (24 * 60);
    const h = Math.floor(wrapped / 60);
    const m = wrapped - h * 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
/** 15-min slot → "7:30 AM" pretty display, with next-day awareness. */
const formatSlot = (slot: number) => {
    const clamped = Math.max(0, Math.min(143, Math.round(slot)));
    const total = clamped * 15;
    const isNextDay = total >= 24 * 60;
    const wrapped = total % (24 * 60);
    const h24 = Math.floor(wrapped / 60);
    const m = wrapped - h24 * 60;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const base = `${h12}:${String(m).padStart(2, '0')} ${period}`;
    return isNextDay ? `${base} (next day)` : base;
};

function ScheduleStep({
    wakeSlot, sleepSlot, hasWork, workStartSlot, workEndSlot,
    onChangeWake, onChangeSleep, onChangeHasWork, onChangeWorkStart, onChangeWorkEnd,
}: {
    wakeSlot: number;
    sleepSlot: number;
    hasWork: 'yes' | 'flexible' | null;
    workStartSlot: number;
    workEndSlot: number;
    onChangeWake: (n: number) => void;
    onChangeSleep: (n: number) => void;
    onChangeHasWork: (v: 'yes' | 'flexible') => void;
    onChangeWorkStart: (n: number) => void;
    onChangeWorkEnd: (n: number) => void;
}) {
    return (
        <View style={{ alignSelf: 'stretch' }}>
            <Text style={styles.helperLine}>
                so max can plan around your sleep + work hours
            </Text>

            <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
                <TimeRow label="i wake up at" slot={wakeSlot} onChange={onChangeWake} min={16} max={56} />
                <TimeRow label="i sleep at" slot={sleepSlot} onChange={onChangeSleep} min={72} max={119} />

                <View style={styles.workToggleWrap}>
                    <Text style={styles.scheduleLabel}>work / school hours</Text>
                    <View style={styles.workToggleRow}>
                        {([
                            { id: 'yes', label: 'fixed' },
                            { id: 'flexible', label: 'flexible' },
                        ] as const).map((opt) => {
                            const on = hasWork === opt.id;
                            return (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={[styles.workToggleBtn, on && styles.workToggleBtnOn]}
                                    activeOpacity={0.7}
                                    onPress={() => onChangeHasWork(opt.id)}
                                >
                                    <Text style={[styles.workToggleText, on && styles.workToggleTextOn]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {hasWork === 'yes' ? (
                    <>
                        <TimeRow
                            label="from"
                            slot={workStartSlot}
                            onChange={onChangeWorkStart}
                            min={16}
                            max={84}
                        />
                        <TimeRow
                            label="to"
                            slot={workEndSlot}
                            onChange={onChangeWorkEnd}
                            min={20}
                            max={92}
                        />
                    </>
                ) : null}
            </View>
        </View>
    );
}

/** One-row time selector: label, big formatted time, glitch-free slider. */
function TimeRow({
    label, slot, onChange, min, max,
}: {
    label: string;
    slot: number;
    onChange: (n: number) => void;
    min: number;
    max: number;
}) {
    // 15-min snap: round on the way out.
    const snap = useCallback((n: number) => onChange(Math.round(n)), [onChange]);
    return (
        <View>
            <View style={styles.timeRowHeader}>
                <Text style={styles.scheduleLabel}>{label}</Text>
                <Text style={styles.timeValue}>{formatSlot(slot)}</Text>
            </View>
            <Slider min={min} max={max} value={slot} onChange={snap} compact accessibilityLabel={label} />
        </View>
    );
}

/**
 * Custom slider — gesture-handler-free, glitch-free. Drag-tracks a
 * `startValue` captured on grant and applies `dx / trackWidth * range`,
 * so the thumb follows the finger continuously without re-reading
 * `locationX` (which jitters when responder bubbles between parent and
 * child). 44pt touch zone with a thinner visual track inside; light
 * haptic tick on each integer step.
 */
function Slider({
    min, max, value, onChange, compact = false, accessibilityLabel,
}: {
    min: number; max: number; value: number; onChange: (n: number) => void;
    /** Use the tight inline layout (no big top margin) — for stacked rows
     * where each row is its own sub-control. Default style keeps the wide
     * spacing used on the dedicated number steps (age, height, weight). */
    compact?: boolean;
    /** Spoken label for screen readers (e.g. "Age", "Height in centimeters"). */
    accessibilityLabel?: string;
}) {
    const [trackWidth, setTrackWidth] = useState(0);
    const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);
    const range = max - min;

    // Refs for PanResponder closure stability — avoids stale-state bugs.
    const valueRef = useRef(value);
    valueRef.current = value;
    const trackWidthRef = useRef(trackWidth);
    trackWidthRef.current = trackWidth;
    const startValueRef = useRef(value);
    const lastEmittedRef = useRef(value);

    const ratio = trackWidth > 0 ? (value - min) / range : 0;
    const thumbX = ratio * trackWidth;

    const tickHaptic = useCallback(() => {
        if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
        }
    }, []);

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 1 || Math.abs(g.dy) > 1,
                onPanResponderTerminationRequest: () => false,
                onPanResponderGrant: (e) => {
                    const w = trackWidthRef.current;
                    if (w <= 0) return;
                    // Tap-to-position: jump on tap, then drag from there.
                    const x = Math.max(0, Math.min(w, e.nativeEvent.locationX));
                    const next = Math.round(min + (x / w) * range);
                    startValueRef.current = next;
                    if (next !== lastEmittedRef.current) {
                        lastEmittedRef.current = next;
                        onChange(next);
                        tickHaptic();
                    }
                },
                onPanResponderMove: (_e, g) => {
                    const w = trackWidthRef.current;
                    if (w <= 0) return;
                    const delta = (g.dx / w) * range;
                    const raw = startValueRef.current + delta;
                    const clamped = Math.max(min, Math.min(max, raw));
                    const next = Math.round(clamped);
                    if (next !== lastEmittedRef.current) {
                        lastEmittedRef.current = next;
                        onChange(next);
                        tickHaptic();
                    }
                },
            }),
        [min, max, range, onChange, tickHaptic]
    );

    return (
        <View
            style={[styles.sliderHitArea, compact && styles.sliderHitAreaCompact]}
            onLayout={onLayout}
            accessibilityRole="adjustable"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ now: Math.round(value), min, max }}
            {...panResponder.panHandlers}
        >
            <View style={styles.sliderTrack} pointerEvents="none">
                <View style={[styles.sliderFill, { width: thumbX }]} />
                <View style={[styles.sliderThumb, { left: Math.max(0, thumbX - 14) }]} />
            </View>
        </View>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Styles                                                                 */
/* ─────────────────────────────────────────────────────────────────────── */

const CARD_MAX_WIDTH = 380;

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
    },

    /* top bar */
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
    },
    backBtn: {
        width: 32,
        height: 32,
        alignItems: 'flex-start',
        justifyContent: 'center',
        marginLeft: -4,
    },
    stepDots: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.border,
    },
    dotActive: {
        width: 24,
        backgroundColor: colors.foreground,
    },
    dotComplete: {
        backgroundColor: colors.foreground,
    },

    /* centered content */
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: CARD_MAX_WIDTH,
        alignItems: 'center',
    },
    question: {
        fontFamily: fonts.serif,
        fontSize: 30,
        fontWeight: '400',
        letterSpacing: -0.6,
        lineHeight: 36,
        color: colors.foreground,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    body: {
        alignSelf: 'stretch',
        alignItems: 'center',
    },

    /* shared per-step number layout */
    numberStep: {
        alignItems: 'center',
        alignSelf: 'stretch',
    },
    bigNumber: {
        fontFamily: fonts.serif,
        fontSize: 88,
        fontWeight: '400',
        letterSpacing: -3,
        color: colors.foreground,
        lineHeight: 96,
    },
    unit: {
        fontFamily: fonts.sansMedium,
        fontSize: 11,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginTop: 6,
    },
    unitInline: {
        marginHorizontal: 6,
        marginTop: 0,
    },
    inlineUnits: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },

    /* helper text */
    helperLine: {
        fontFamily: fonts.sans,
        fontSize: 12.5,
        color: colors.textSecondary,
        textAlign: 'center',
        letterSpacing: 0.1,
    },

    /* options (gender + priority) */
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
        borderRadius: borderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    optionOn: {
        borderColor: colors.foreground,
        backgroundColor: colors.surfaceLight,
    },
    optionLabel: {
        flex: 1,
        fontFamily: fonts.sansMedium,
        fontSize: 15,
        color: colors.textPrimary,
        letterSpacing: -0.05,
        textAlign: 'left',
    },
    optionLabelOn: {
        color: colors.foreground,
    },
    intensityOption: {
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
        borderRadius: borderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.card,
        gap: 4,
    },
    intensityBlurb: {
        fontFamily: fonts.sans,
        fontSize: 12.5,
        color: colors.textSecondary,
        letterSpacing: 0.05,
    },
    rankBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankBadgeOn: {
        borderColor: colors.foreground,
        backgroundColor: colors.foreground,
    },
    rankBadgeText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        color: colors.buttonText,
    },

    /* unit toggle */
    toggleWrap: {
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        marginBottom: spacing.lg,
    },
    togglePill: {
        paddingHorizontal: spacing.md,
        paddingVertical: 7,
        borderRadius: borderRadius.full,
    },
    togglePillOn: {
        backgroundColor: colors.foreground,
    },
    togglePillText: {
        fontFamily: fonts.sansMedium,
        fontSize: 12,
        letterSpacing: 0.4,
        color: colors.textSecondary,
    },
    togglePillTextOn: {
        color: colors.buttonText,
    },

    /* schedule (busy hours) step */
    timeRowHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    /* onairos onboarding step */
    onairosBenefits: {
        marginTop: spacing.lg,
        marginBottom: spacing.xl,
        gap: 10,
        alignSelf: 'stretch',
    },
    onairosBenefitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    onairosBenefitDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.foreground,
        opacity: 0.5,
    },
    onairosBenefitText: {
        fontFamily: fonts.sans,
        fontSize: 13.5,
        color: colors.textPrimary,
        letterSpacing: 0.05,
        flex: 1,
    },
    onairosBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.foreground,
        paddingVertical: 13,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.full,
        alignSelf: 'stretch',
    },
    onairosBtnText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        color: colors.buttonText,
        letterSpacing: 0.4,
    },
    onairosConnected: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.surfaceLight,
        paddingVertical: 13,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.full,
        alignSelf: 'stretch',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    onairosConnectedText: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: colors.foreground,
        letterSpacing: 0.1,
    },
    onairosHint: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.textMuted,
        marginTop: spacing.md,
        textAlign: 'center',
    },

    scheduleLabel: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: colors.textSecondary,
        letterSpacing: 0.1,
    },
    timeValue: {
        fontFamily: fonts.serif,
        fontSize: 22,
        fontWeight: '400',
        letterSpacing: -0.5,
        color: colors.foreground,
    },
    workToggleWrap: {
        gap: 8,
    },
    workToggleRow: {
        flexDirection: 'row',
        gap: 8,
    },
    workToggleBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: borderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.card,
        alignItems: 'center',
    },
    workToggleBtnOn: {
        borderColor: colors.foreground,
        backgroundColor: colors.surfaceLight,
    },
    workToggleText: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: colors.textPrimary,
    },
    workToggleTextOn: {
        color: colors.foreground,
    },

    /* slider */
    sliderHitArea: {
        marginTop: spacing.xl,
        alignSelf: 'stretch',
        height: 44,
        justifyContent: 'center',
    },
    sliderHitAreaCompact: {
        marginTop: 0,
        height: 36,
    },
    sliderTrack: {
        height: 28,
        justifyContent: 'center',
    },
    sliderFill: {
        position: 'absolute',
        left: 0,
        height: 3,
        backgroundColor: colors.foreground,
        borderRadius: 1.5,
    },
    sliderThumb: {
        position: 'absolute',
        top: 0,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.foreground,
        ...(Platform.OS === 'ios'
            ? { shadowColor: '#18181b', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }
            : { elevation: 4 }),
    },

    /* footer / CTA */
    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        alignItems: 'center',
    },
    cta: {
        width: '100%',
        maxWidth: CARD_MAX_WIDTH,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.foreground,
        paddingVertical: 14,
        borderRadius: borderRadius.full,
    },
    ctaDisabled: {
        backgroundColor: colors.border,
    },
    ctaText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 13,
        letterSpacing: 0.4,
        color: colors.buttonText,
    },
    ctaHint: {
        fontFamily: fonts.sans,
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
    },
});
