/**
 * CelebrationOverlay — the earn-moment.
 *
 * When the user earns one or more achievements, this drops a full-screen
 * moment: a Reanimated confetti burst (pure-JS, no native rebuild), the badge
 * springing in, the title/desc rising, and a success haptic. It steps through
 * a queue one badge at a time so a big day (e.g. first routine + streak_3 +
 * perfect_day at once) feels like a sequence of wins, not a pile.
 *
 * Respects reduced-motion: confetti is skipped and the badge cross-fades.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Modal } from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay,
    interpolate, Easing, useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, borderRadius, spacing } from '../../theme/dark';
import AchievementBadge, { Tier } from './AchievementBadge';

export type EarnedAchievement = {
    code: string; title: string; description: string; tier: Tier; icon: string;
};

const CONFETTI_COLORS = ['#D4A017', '#2C6BED', '#1C1A17', '#E7CFA6', '#9BC4A0', '#E58B5C', '#C2C9D1'];
const PIECES = 26;

function ConfettiPiece({ index, reduced }: { index: number; reduced: boolean }) {
    const p = useSharedValue(0);
    const cfg = useMemo(() => {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const dist = 90 + Math.random() * 180;
        return {
            dx: dir * dist,
            riseY: -(130 + Math.random() * 130),
            fallY: 240 + Math.random() * 240,
            rot: Math.random() * 900 - 450,
            delay: Math.random() * 140,
            color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            size: 6 + Math.random() * 7,
            round: Math.random() < 0.4,
        };
    }, [index]);

    useEffect(() => {
        if (reduced) return;
        p.value = 0;
        p.value = withDelay(cfg.delay, withTiming(1, { duration: 1350, easing: Easing.out(Easing.quad) }));
    }, [reduced, cfg, p]);

    const style = useAnimatedStyle(() => {
        const t = p.value;
        const y = t < 0.32
            ? interpolate(t, [0, 0.32], [0, cfg.riseY])
            : interpolate(t, [0.32, 1], [cfg.riseY, cfg.fallY]);
        const x = interpolate(t, [0, 1], [0, cfg.dx]);
        return {
            transform: [{ translateX: x }, { translateY: y }, { rotate: `${cfg.rot * t}deg` }],
            opacity: interpolate(t, [0, 0.1, 0.82, 1], [0, 1, 1, 0]),
        };
    });

    if (reduced) return null;
    return (
        <Animated.View
            pointerEvents="none"
            style={[
                { position: 'absolute', width: cfg.size, height: cfg.size,
                  borderRadius: cfg.round ? cfg.size / 2 : 1.5, backgroundColor: cfg.color },
                style,
            ]}
        />
    );
}

export default function CelebrationOverlay({
    queue,
    onDone,
}: {
    queue: EarnedAchievement[];
    onDone: () => void;
}) {
    const reduced = useReducedMotion();
    const [i, setI] = useState(0);
    const scale = useSharedValue(0);
    const textP = useSharedValue(0);

    const current = queue[i];

    const fire = useCallback(() => {
        scale.value = 0;
        textP.value = 0;
        if (reduced) {
            scale.value = withTiming(1, { duration: 260 });
            textP.value = withTiming(1, { duration: 320 });
        } else {
            scale.value = withSpring(1, { damping: 9, stiffness: 150, mass: 0.7 });
            textP.value = withDelay(180, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
        }
        if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
    }, [reduced, scale, textP]);

    useEffect(() => { if (current) fire(); }, [i, current, fire]);

    const next = useCallback(() => {
        if (i + 1 < queue.length) setI(i + 1);
        else onDone();
    }, [i, queue.length, onDone]);

    const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const textStyle = useAnimatedStyle(() => ({
        opacity: textP.value,
        transform: [{ translateY: interpolate(textP.value, [0, 1], [12, 0]) }],
    }));

    if (!current) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onDone}>
            <Pressable style={styles.backdrop} onPress={next}>
                <View style={styles.stage}>
                    {/* confetti emits from behind the badge */}
                    <View style={styles.confettiOrigin} pointerEvents="none">
                        {Array.from({ length: PIECES }).map((_, k) => (
                            <ConfettiPiece key={`${i}-${k}`} index={k} reduced={reduced} />
                        ))}
                    </View>

                    <Animated.View style={[styles.badgeWrap, badgeStyle]}>
                        <AchievementBadge icon={current.icon} tier={current.tier} earned size={132} />
                    </Animated.View>

                    <Animated.View style={[styles.textWrap, textStyle]}>
                        <Text style={styles.kicker}>ACHIEVEMENT UNLOCKED</Text>
                        <Text style={styles.title}>{current.title}</Text>
                        <Text style={styles.desc}>{current.description}</Text>
                        {queue.length > 1 ? (
                            <Text style={styles.count}>{i + 1} of {queue.length}</Text>
                        ) : null}
                        <View style={styles.cta}>
                            <Text style={styles.ctaText}>{i + 1 < queue.length ? 'Next' : 'Nice'}</Text>
                        </View>
                    </Animated.View>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(28,26,23,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stage: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    confettiOrigin: { position: 'absolute', top: '38%', left: '50%', width: 0, height: 0 },
    badgeWrap: {
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
    },
    textWrap: { alignItems: 'center', marginTop: spacing.xl },
    kicker: {
        fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 2,
        color: '#E7CFA6', marginBottom: 10,
    },
    title: {
        fontFamily: fonts.serif, fontSize: 30, color: '#FBF6EE',
        letterSpacing: -0.4, textAlign: 'center',
    },
    desc: {
        fontFamily: fonts.sans, fontSize: 15, color: 'rgba(251,246,238,0.78)',
        lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 300,
    },
    count: { fontFamily: fonts.sansMedium, fontSize: 12, color: 'rgba(251,246,238,0.5)', marginTop: 14 },
    cta: {
        marginTop: spacing.xl, backgroundColor: '#FBF6EE',
        borderRadius: borderRadius.full, paddingHorizontal: 40, paddingVertical: 14,
    },
    ctaText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#1C1A17', letterSpacing: 0.2 },
});
