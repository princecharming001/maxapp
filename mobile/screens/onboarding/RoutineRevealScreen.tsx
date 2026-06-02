/**
 * RoutineReveal — the payoff screen at the end of onboarding.
 *
 * Onboarding now builds the user's #1-priority routine on the server the
 * moment they finish. This screen reveals it: a short "building your plan"
 * beat, then the actual first day of tasks, then a single CTA into the rest
 * of the funnel (scan + soft paywall). Show the value before asking for money.
 *
 * Route params (all optional — the screen degrades to a clean hand-off if the
 * server could not build a routine):
 *   routine: {
 *     maxx_id, course_title, starter, day_count,
 *     sample_day: [{ time, title }]
 *   } | null
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fonts, spacing } from '../../theme/dark';

type RoutineTask = { time?: string | null; title?: string | null };
type RoutinePreview = {
    maxx_id?: string;
    course_title?: string;
    starter?: boolean;
    day_count?: number;
    sample_day?: RoutineTask[];
} | null;

const MAXX_LABEL: Record<string, string> = {
    bonemax: 'bone structure',
    skinmax: 'skin',
    heightmax: 'height & posture',
    fitmax: 'physique',
    hairmax: 'hair',
};

/** "07:30" / "7:30 AM" -> "7:30 AM". Accepts already-pretty strings. */
function prettyTime(raw?: string | null): string {
    if (!raw) return '';
    const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
    if (!m) return raw;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 === 0 ? 12 : h % 12;
    return `${h}:${min} ${period}`;
}

export default function RoutineRevealScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();

    const routine: RoutinePreview = route.params?.routine ?? null;
    const tasks = (routine?.sample_day ?? []).filter((t) => t && (t.title || t.time));
    const maxxName = routine?.maxx_id ? MAXX_LABEL[routine.maxx_id] ?? 'your routine' : 'your routine';

    // Brief "building" beat, then reveal. Skipped entirely if there's nothing
    // to show — we just hand straight off to the scan funnel.
    const [phase, setPhase] = useState<'building' | 'revealed'>(
        tasks.length > 0 ? 'building' : 'revealed',
    );
    const fade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (tasks.length === 0) {
            // No routine to reveal — don't strand the user on a blank screen.
            navigation.reset({ index: 0, routes: [{ name: 'FeaturesIntro' }] });
            return;
        }
        const t = setTimeout(() => {
            setPhase('revealed');
            Animated.timing(fade, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        }, 1200);
        return () => clearTimeout(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const goNext = () => {
        navigation.navigate('FeaturesIntro');
    };

    if (phase === 'building') {
        return (
            <View style={[s.container, s.centered]}>
                <Spinner />
                <Text style={s.buildingText}>building your {maxxName} plan</Text>
            </View>
        );
    }

    return (
        <View style={s.container}>
            <Animated.View style={[s.body, { opacity: fade, paddingTop: insets.top + spacing.xl }]}>
                <Text style={s.kicker}>your plan is ready</Text>
                <Text style={s.headline}>Here's day one</Text>
                <Text style={s.subline}>
                    Built around your sleep and schedule. Max tunes it as you go.
                </Text>

                <ScrollView
                    style={s.list}
                    contentContainerStyle={s.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    {tasks.map((t, i) => (
                        <View key={i} style={s.row}>
                            <Text style={s.rowTime}>{prettyTime(t.time)}</Text>
                            <View style={s.rowBar} />
                            <Text style={s.rowTitle} numberOfLines={2}>
                                {t.title}
                            </Text>
                        </View>
                    ))}
                    {routine?.starter ? (
                        <Text style={s.starterNote}>
                            This is your foundation. Answer a few quick questions with Max and it
                            gets tailored to you.
                        </Text>
                    ) : null}
                </ScrollView>
            </Animated.View>

            <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
                <TouchableOpacity style={s.cta} onPress={goNext} activeOpacity={0.85}>
                    <Text style={s.ctaText}>Keep going</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.background} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

function Spinner() {
    const spin = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(
            Animated.timing(spin, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        ).start();
    }, [spin]);
    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    return (
        <Animated.View style={[s.spinner, { transform: [{ rotate }] }]}>
            <Ionicons name="sync" size={26} color={colors.foreground} />
        </Animated.View>
    );
}

const CARD_MAX_WIDTH = 420;

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    spinner: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    buildingText: {
        fontFamily: fonts.sansMedium,
        fontSize: 14,
        color: colors.textSecondary,
        letterSpacing: 0.2,
    },

    body: {
        flex: 1,
        width: '100%',
        maxWidth: CARD_MAX_WIDTH,
        alignSelf: 'center',
        paddingHorizontal: spacing.xl,
    },
    kicker: {
        fontFamily: fonts.sansMedium,
        fontSize: 11,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    headline: {
        fontFamily: fonts.serif,
        fontSize: 34,
        fontWeight: '400',
        letterSpacing: -0.8,
        color: colors.foreground,
        lineHeight: 40,
    },
    subline: {
        fontFamily: fonts.sans,
        fontSize: 14.5,
        color: colors.textSecondary,
        lineHeight: 21,
        marginTop: spacing.sm,
        marginBottom: spacing.xl,
    },

    list: { flex: 1 },
    listContent: { paddingBottom: spacing.lg },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
    },
    rowTime: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: colors.textSecondary,
        width: 78,
    },
    rowBar: {
        width: 2,
        height: 22,
        borderRadius: 1,
        backgroundColor: colors.border,
        marginRight: spacing.md,
    },
    rowTitle: {
        flex: 1,
        fontFamily: fonts.sansMedium,
        fontSize: 15,
        color: colors.textPrimary,
        letterSpacing: -0.1,
    },
    starterNote: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 19,
        marginTop: spacing.lg,
    },

    footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.foreground,
        borderRadius: borderRadius.full,
        paddingVertical: 16,
        maxWidth: CARD_MAX_WIDTH,
        alignSelf: 'center',
        width: '100%',
    },
    ctaText: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 16,
        color: colors.background,
        letterSpacing: 0.1,
    },
});
