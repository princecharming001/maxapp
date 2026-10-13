/**
 * AchievementBadge — clear-glass 3D icons (same frosted-glass material as the
 * DNA app logo: milky interior, iridescent magenta/cyan rims).
 *
 * Every badge is a transparent WebP; earned badges float with a gentle bob +
 * tilt (Reanimated, each on its own phase so a row never moves in lockstep).
 *
 *   EARNED  — the icon at full size, floating.
 *   LOCKED  — the same icon faded back, smaller, inside a hairline ring with an
 *             optional ink progress arc. Earning it brings the icon forward.
 *
 * Each achievement gets a UNIQUE icon, keyed by its achievement `code` (so
 * achievements that share an icon family each look distinct).
 *
 * `tier` is kept on the prop for compatibility but no longer recolors anything —
 * the whole set is one glass collection.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

export type Tier = 'bronze' | 'silver' | 'gold';

// Craft ink + cream. One monochrome set; tier no longer recolors.
const INK = '#1C1A17';
const HAIRLINE = '#D8D1C4'; // locked ring on the warm canvas
const LOCKED_GLYPH = '#B4AB9C'; // faded glyph when an icon has no glass asset

// Glass icons by icon key (fallback when no code-specific icon exists).
const BADGE_ANIM: Record<string, any> = {
    spark: require('../../assets/badges/spark.webp'),
    flame: require('../../assets/badges/flame.webp'),
    crown: require('../../assets/badges/crown.webp'),
    phoenix: require('../../assets/badges/phoenix.webp'),
    shield: require('../../assets/badges/shield.webp'),
    check: require('../../assets/badges/check.webp'),
    leaf: require('../../assets/badges/leaf.webp'),
    layers: require('../../assets/badges/layers.webp'),
    camera: require('../../assets/badges/camera.webp'),
    book: require('../../assets/badges/book.webp'),
};

// Per-achievement UNIQUE icons, keyed by achievement code. Achievements that
// share an icon family (streaks, tasks, scans, personalization) each get their
// own object so no two badges look alike. Preferred over BADGE_ANIM (by icon).
const BADGE_BY_CODE: Record<string, any> = {
    first_routine: require('../../assets/badges/spark.webp'),
    streak_3: require('../../assets/badges/flame.webp'),
    streak_7: require('../../assets/badges/bolt.webp'),
    streak_30: require('../../assets/badges/diamond.webp'),
    streak_100: require('../../assets/badges/crown.webp'),
    comeback: require('../../assets/badges/phoenix.webp'),
    freeze_earned: require('../../assets/badges/shield.webp'),
    perfect_day: require('../../assets/badges/check.webp'),
    tasks_10: require('../../assets/badges/leaf.webp'),
    tasks_50: require('../../assets/badges/target.webp'),
    tasks_100: require('../../assets/badges/mountain.webp'),
    two_maxxes: require('../../assets/badges/layers.webp'),
    first_scan: require('../../assets/badges/camera.webp'),
    three_scans: require('../../assets/badges/photo.webp'),
    knows_me: require('../../assets/badges/book.webp'),
    well_known: require('../../assets/badges/key.webp'),
};

// Achievement icon key -> Ionicons glyph (fallback only, if a glass asset is missing).
export const GLYPH: Record<string, keyof typeof Ionicons.glyphMap> = {
    spark: 'sparkles',
    flame: 'flame',
    crown: 'trophy',
    phoenix: 'rocket',
    shield: 'shield-checkmark',
    check: 'checkmark-done',
    leaf: 'leaf',
    layers: 'layers',
    camera: 'camera',
    book: 'book',
};

// A slow float: soft vertical bob + slight tilt, phase-shifted per badge.
function FloatingGlass({ source, size, seed }: { source: any; size: number; seed: string }) {
    const t = useSharedValue(0);
    useEffect(() => {
        let h = 0;
        for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
        t.value = withDelay(
            (h % 9) * 260,
            withRepeat(withTiming(1, { duration: 2600 + (h % 5) * 220, easing: Easing.inOut(Easing.sin) }), -1, true),
        );
    }, [t, seed]);
    const style = useAnimatedStyle(() => ({
        transform: [
            { translateY: (t.value - 0.5) * size * 0.08 },
            { rotateZ: `${(t.value - 0.5) * 6}deg` },
        ],
    }));
    return (
        <Animated.View style={style}>
            <Image
                source={source}
                style={{ width: size * 1.12, height: size * 1.12 }}
                contentFit="contain"
                cachePolicy="memory-disk"
            />
        </Animated.View>
    );
}

export default function AchievementBadge({
    icon,
    code,
    tier,
    earned,
    size = 76,
    progress,
}: {
    icon: string;
    /** Achievement code — preferred for a unique per-achievement icon. */
    code?: string;
    tier: Tier;
    earned: boolean;
    size?: number;
    /** 0..1 fill toward earning, shown as an arc on locked badges only. */
    progress?: number | null;
}) {
    const anim = (code && BADGE_BY_CODE[code]) || BADGE_ANIM[icon];

    const c = size / 2;
    const ringW = size * 0.04;
    const rOuter = c - ringW / 2 - 1;
    const circ = 2 * Math.PI * rOuter;
    const showArc = !earned && typeof progress === 'number' && progress > 0;
    const pct = Math.max(0, Math.min(1, progress || 0));

    // Glass icon present → use it for both states.
    if (anim) {
        if (earned) {
            return (
                <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                    <FloatingGlass source={anim} size={size} seed={code || icon} />
                </View>
            );
        }
        // Locked — faded glass icon inside a hairline ring (+ progress arc).
        return (
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <Circle cx={c} cy={c} r={rOuter} fill="none" stroke={HAIRLINE} strokeWidth={ringW} />
                    {showArc ? (
                        <Circle
                            cx={c} cy={c} r={rOuter} fill="none"
                            stroke={INK} strokeWidth={ringW}
                            strokeLinecap="round"
                            strokeDasharray={`${circ * pct} ${circ}`}
                            transform={`rotate(-90 ${c} ${c})`}
                        />
                    ) : null}
                </Svg>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <View style={styles.center}>
                        <Image
                            source={anim}
                            style={{ width: size * 0.62, height: size * 0.62, opacity: 0.45 }}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                        />
                    </View>
                </View>
            </View>
        );
    }

    // Fallback — icon has no glass asset: ring + glyph.
    const glyphName = GLYPH[icon] || 'ribbon';
    const glyphSize = size * 0.4;
    const glyphColor = earned ? '#FFFFFF' : LOCKED_GLYPH;
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {earned ? (
                    <Circle cx={c} cy={c} r={rOuter} fill={INK} />
                ) : (
                    <>
                        <Circle cx={c} cy={c} r={rOuter} fill="none" stroke={HAIRLINE} strokeWidth={ringW} />
                        {showArc ? (
                            <Circle
                                cx={c} cy={c} r={rOuter} fill="none"
                                stroke={INK} strokeWidth={ringW}
                                strokeLinecap="round"
                                strokeDasharray={`${circ * pct} ${circ}`}
                                transform={`rotate(-90 ${c} ${c})`}
                            />
                        ) : null}
                    </>
                )}
            </Svg>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={styles.center}>
                    <Ionicons name={glyphName} size={glyphSize} color={glyphColor} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
