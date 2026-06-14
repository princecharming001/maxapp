/**
 * OnboardingIcon — a cohesive set of CUSTOM illustrated icons for the onboarding,
 * one per step, in the Craft palette (warm gold + ink on a soft pale halo).
 *
 * Pure react-native-svg (no native rebuild, crisp at any size, themeable). Each
 * is a single centered motif on a layered halo so it animates cleanly — the
 * halo sits on a slower parallax plane than the motif (see OnboardingV2).
 *
 * NOTE on Higgsfield: the original ask was to generate these via Higgsfield.
 * The in-session Higgsfield tool (Recraft v4.1 with background_color #F7F0EA +
 * the Craft palette) is the right path, but the workspace is out of credits /
 * plan-gated, so generation is blocked without a top-up. These vector icons are
 * the better choice for *animated* onboarding anyway; swap in Higgsfield rasters
 * later by replacing the <Svg> bodies with <Image> if credits are added.
 */
import React from 'react';
import Svg, { Circle, Rect, Line, Path, G } from 'react-native-svg';

export type OnboardingIconKind =
    | 'goals' | 'motivation' | 'dayshape' | 'work' | 'energy' | 'rhythm' | 'recap';

const GOLD = '#D4A017';
const GOLD_SOFT = '#E8C45A';
const INK = '#1C1A17';
const BLUE = '#2C6BED';
const HALO = '#F0E4CB';      // pale gold
const HALO_BLUE = '#DEEAF7'; // pale blue accent
const TINT = '#F6ECD4';      // fill tint for solid shapes

function Halo() {
    return (
        <G>
            {/* deeper accent plane (offset) */}
            <Circle cx="72" cy="50" r="34" fill={HALO_BLUE} opacity={0.55} />
            {/* main halo */}
            <Circle cx="60" cy="60" r="48" fill={HALO} />
        </G>
    );
}

function Goals() {
    return (
        <G>
            <Circle cx="58" cy="62" r="25" fill="none" stroke={INK} strokeWidth={3} />
            <Circle cx="58" cy="62" r="15" fill="none" stroke={INK} strokeWidth={3} />
            <Circle cx="58" cy="62" r="6" fill={GOLD} />
            {/* aim arrow into the bullseye */}
            <Line x1="92" y1="30" x2="62" y2="58" stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
            <Path d="M62 58 L72 57 M62 58 L63 48" stroke={GOLD} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
    );
}

function Motivation() {
    return (
        <G>
            {/* four-point spark */}
            <Path
                d="M58 32 Q61 54 82 58 Q61 62 58 84 Q55 62 34 58 Q55 54 58 32 Z"
                fill={GOLD}
            />
            {/* small accent spark */}
            <Path d="M86 36 Q88 44 96 46 Q88 48 86 56 Q84 48 76 46 Q84 44 86 36 Z" fill={INK} opacity={0.85} />
        </G>
    );
}

function DayShape() {
    const rays = [
        [60, 24, 60, 31], [42, 31, 47, 36], [78, 31, 73, 36],
        [33, 48, 40, 50], [87, 48, 80, 50],
    ];
    return (
        <G>
            <Circle cx="60" cy="50" r="13" fill={GOLD} />
            {rays.map((r, i) => (
                <Line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
            ))}
            {/* horizon + hill */}
            <Path d="M34 82 Q52 68 70 82" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <Line x1="28" y1="84" x2="92" y2="84" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        </G>
    );
}

function Work() {
    return (
        <G>
            {/* handle */}
            <Path d="M50 52 L50 46 Q50 42 54 42 L66 42 Q70 42 70 46 L70 52" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            {/* body */}
            <Rect x="34" y="51" width="52" height="34" rx="8" fill={TINT} stroke={INK} strokeWidth={3} />
            <Line x1="34" y1="65" x2="86" y2="65" stroke={INK} strokeWidth={2.6} />
            <Rect x="54" y="61" width="12" height="8" rx="2.5" fill={GOLD} />
        </G>
    );
}

function Energy() {
    return (
        <G>
            {/* sun */}
            <Circle cx="49" cy="60" r="12" fill={GOLD} />
            <Line x1="49" y1="42" x2="49" y2="47" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
            <Line x1="34" y1="52" x2="38" y2="55" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
            <Line x1="34" y1="68" x2="38" y2="65" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
            {/* crescent moon */}
            <Path d="M80 47 A14 14 0 1 0 80 73 A10.5 10.5 0 1 1 80 47 Z" fill={INK} />
        </G>
    );
}

function Rhythm() {
    return (
        <G>
            {/* dumbbell */}
            <Rect x="37" y="53" width="6" height="14" rx="3" fill={INK} />
            <Rect x="43" y="48" width="10" height="24" rx="4" fill={INK} />
            <Rect x="77" y="53" width="6" height="14" rx="3" fill={INK} />
            <Rect x="67" y="48" width="10" height="24" rx="4" fill={INK} />
            <Rect x="50" y="56" width="20" height="8" rx="4" fill={GOLD} />
        </G>
    );
}

function Recap() {
    return (
        <G>
            <Rect x="38" y="36" width="44" height="50" rx="9" fill={TINT} stroke={INK} strokeWidth={3} />
            <Line x1="48" y1="58" x2="74" y2="58" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
            <Line x1="48" y1="66" x2="74" y2="66" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
            <Line x1="48" y1="74" x2="64" y2="74" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
            {/* check badge */}
            <Circle cx="72" cy="40" r="11" fill={GOLD} />
            <Path d="M67 40 L71 44 L78 36" fill="none" stroke="#FFF8EC" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </G>
    );
}

const MOTIF: Record<OnboardingIconKind, React.FC> = {
    goals: Goals, motivation: Motivation, dayshape: DayShape, work: Work,
    energy: Energy, rhythm: Rhythm, recap: Recap,
};

export default function OnboardingIcon({
    kind,
    size = 132,
}: {
    kind: OnboardingIconKind;
    size?: number;
}) {
    const Motif = MOTIF[kind] || Goals;
    return (
        <Svg width={size} height={size} viewBox="0 0 120 120">
            <Halo />
            <Motif />
        </Svg>
    );
}
