/**
 * OnboardingIcon — minimalist line icons with INTRINSIC motion.
 *
 * Transparent background (no halo, no fills), thin ink strokes with a single
 * warm-gold accent on the live part. Each icon's OWN components move on a quiet
 * loop — a radar ping on the target, a twinkling spark, a rising sun, a turning
 * clock hand, a day/night cycle, a dumbbell rep, a check drawing itself — not
 * the whole icon sliding. Pure react-native-svg + Reanimated (string-form SVG
 * transforms so the rotation/scale centers are baked in and work on web too).
 *
 * Reduced-motion: loops are skipped; the icon renders in its resting pose.
 */
import React, { useEffect } from 'react';
import Svg, { Circle, Rect, Line, Path, G } from 'react-native-svg';
import Animated, {
    Easing, interpolate, useAnimatedProps, useReducedMotion, useSharedValue,
    withRepeat, withTiming,
} from 'react-native-reanimated';

const AG = Animated.createAnimatedComponent(G);
const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

const INK = '#1C1A17';
const GOLD = '#C9A24E';   // softened gold — gentler against the ink
const SW = 2.3;

export type OnboardingIconKind =
    | 'goals' | 'motivation' | 'dayshape' | 'work' | 'energy' | 'rhythm' | 'recap';

// 0->1 loop. reverse=true yo-yos; reverse=false ramps then snaps back.
function useLoop(duration: number, reverse: boolean, reduced: boolean) {
    const v = useSharedValue(0);
    useEffect(() => {
        if (reduced) { v.value = 0; return; }
        v.value = withRepeat(
            withTiming(1, { duration, easing: reverse ? Easing.inOut(Easing.quad) : Easing.linear }),
            -1,
            reverse,
        );
    }, [duration, reverse, reduced, v]);
    return v;
}

function Goals({ reduced }: { reduced: boolean }) {
    const ping = useLoop(2400, false, reduced);
    const pingProps = useAnimatedProps(() => ({
        r: interpolate(ping.value, [0, 1], [7, 30]),
        opacity: interpolate(ping.value, [0, 0.12, 1], [0, 0.55, 0]),
    }));
    return (
        <G>
            <Circle cx="50" cy="50" r="23" fill="none" stroke={INK} strokeWidth={SW} />
            <Circle cx="50" cy="50" r="13.5" fill="none" stroke={INK} strokeWidth={SW} />
            <ACircle cx="50" cy="50" fill="none" stroke={GOLD} strokeWidth={2} animatedProps={pingProps} />
            <Circle cx="50" cy="50" r="4.5" fill={GOLD} />
        </G>
    );
}

function Motivation({ reduced }: { reduced: boolean }) {
    const tw = useLoop(1500, true, reduced);
    const big = useAnimatedProps(() => ({
        opacity: interpolate(tw.value, [0, 1], [0.72, 1]),
        transform: `translate(46 50) scale(${interpolate(tw.value, [0, 1], [0.9, 1.12])}) translate(-46 -50)`,
    }));
    const small = useAnimatedProps(() => ({
        opacity: interpolate(tw.value, [0, 1], [1, 0.35]),
    }));
    return (
        <G>
            <APath
                d="M46 26 Q49 47 68 50 Q49 53 46 74 Q43 53 24 50 Q43 47 46 26 Z"
                fill={GOLD} animatedProps={big}
            />
            <APath d="M72 30 Q74 38 82 40 Q74 42 72 50 Q70 42 62 40 Q70 38 72 30 Z" fill={INK} animatedProps={small} />
        </G>
    );
}

function DayShape({ reduced }: { reduced: boolean }) {
    const rise = useLoop(2600, true, reduced);
    const sunProps = useAnimatedProps(() => ({
        transform: `translate(0 ${interpolate(rise.value, [0, 1], [4, -3])})`,
    }));
    const rays = [
        [50, 18, 50, 25], [33, 25, 38, 30], [67, 25, 62, 30], [26, 41, 33, 43], [74, 41, 67, 43],
    ];
    return (
        <G>
            <AG animatedProps={sunProps}>
                <Circle cx="50" cy="42" r="11" fill={GOLD} />
                {rays.map((r, i) => (
                    <Line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke={GOLD} strokeWidth={SW} strokeLinecap="round" />
                ))}
            </AG>
            <Path d="M28 70 Q50 56 72 70" fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
            <Line x1="22" y1="72" x2="78" y2="72" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
        </G>
    );
}

function Work({ reduced }: { reduced: boolean }) {
    const spin = useLoop(7000, false, reduced);
    const minute = useAnimatedProps(() => ({
        transform: `rotate(${interpolate(spin.value, [0, 1], [0, 360])} 50 50)`,
    }));
    return (
        <G>
            <Circle cx="50" cy="50" r="26" fill="none" stroke={INK} strokeWidth={SW} />
            {[0, 90, 180, 270].map((d) => (
                <Line key={d} x1="50" y1="28" x2="50" y2="32" stroke={INK} strokeWidth={SW}
                    strokeLinecap="round" transform={`rotate(${d} 50 50)`} />
            ))}
            {/* hour hand (static), minute hand (turning) */}
            <Line x1="50" y1="50" x2="50" y2="38" stroke={INK} strokeWidth={SW} strokeLinecap="round" transform="rotate(110 50 50)" />
            <APath d="M50 50 L50 32" stroke={GOLD} strokeWidth={SW} strokeLinecap="round" fill="none" animatedProps={minute} />
            <Circle cx="50" cy="50" r="2.6" fill={INK} />
        </G>
    );
}

function Energy({ reduced }: { reduced: boolean }) {
    const cycle = useLoop(9000, false, reduced);
    const rot = useAnimatedProps(() => ({
        transform: `rotate(${interpolate(cycle.value, [0, 1], [0, 360])} 50 50)`,
    }));
    return (
        <AG animatedProps={rot}>
            {/* sun */}
            <Circle cx="50" cy="28" r="9" fill={GOLD} />
            <Line x1="50" y1="13" x2="50" y2="17" stroke={GOLD} strokeWidth={SW} strokeLinecap="round" />
            <Line x1="36" y1="22" x2="39" y2="25" stroke={GOLD} strokeWidth={SW} strokeLinecap="round" />
            <Line x1="64" y1="22" x2="61" y2="25" stroke={GOLD} strokeWidth={SW} strokeLinecap="round" />
            {/* crescent moon */}
            <Path d="M50 61 A11 11 0 1 0 50 83 A8 8 0 1 1 50 61 Z" fill={INK} />
        </AG>
    );
}

function Rhythm({ reduced }: { reduced: boolean }) {
    const lift = useLoop(1100, true, reduced);
    const move = useAnimatedProps(() => ({
        transform: `translate(0 ${interpolate(lift.value, [0, 1], [5, -5])})`,
    }));
    return (
        <AG animatedProps={move}>
            <Line x1="30" y1="50" x2="70" y2="50" stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
            <Line x1="30" y1="40" x2="30" y2="60" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <Line x1="24" y1="44" x2="24" y2="56" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <Line x1="70" y1="40" x2="70" y2="60" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <Line x1="76" y1="44" x2="76" y2="56" stroke={INK} strokeWidth={5} strokeLinecap="round" />
        </AG>
    );
}

function Recap({ reduced }: { reduced: boolean }) {
    // check path length ~ 26; draw it in over the first 55% of the loop, hold, reset.
    const L = 26;
    const draw = useLoop(2600, false, reduced);
    const checkProps = useAnimatedProps(() => ({
        strokeDashoffset: reduced ? 0 : interpolate(draw.value, [0, 0.5, 1], [L, 0, 0]),
    }));
    return (
        <G>
            <Rect x="30" y="26" width="40" height="48" rx="8" fill="none" stroke={INK} strokeWidth={SW} />
            <Line x1="38" y1="40" x2="62" y2="40" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
            <Line x1="38" y1="50" x2="62" y2="50" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
            <Line x1="38" y1="60" x2="52" y2="60" stroke={INK} strokeWidth={SW} strokeLinecap="round" />
            <APath
                d="M40 49 L47 56 L60 41"
                fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={L} animatedProps={checkProps}
            />
        </G>
    );
}

const MOTIF: Record<OnboardingIconKind, React.FC<{ reduced: boolean }>> = {
    goals: Goals, motivation: Motivation, dayshape: DayShape, work: Work,
    energy: Energy, rhythm: Rhythm, recap: Recap,
};

export default function OnboardingIcon({
    kind,
    size = 120,
}: {
    kind: OnboardingIconKind;
    size?: number;
}) {
    const reduced = useReducedMotion();
    const Motif = MOTIF[kind] || Goals;
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
            <Motif reduced={reduced} />
        </Svg>
    );
}
