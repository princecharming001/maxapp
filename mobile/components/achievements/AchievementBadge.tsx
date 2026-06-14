/**
 * AchievementBadge — a custom SVG medallion in the Craft palette.
 *
 * The medallion (ring + fill + a faceted inner accent) is drawn with
 * react-native-svg so it's crisp at any size and themeable per tier
 * (bronze / silver / gold); the glyph in the center is an Ionicon mapped from
 * the achievement's `icon` key. Earned badges are warm and saturated with a
 * soft tier glow; locked badges are matte grey with the glyph faded and an
 * optional progress arc showing how close the user is.
 *
 * No raster assets, no native rebuild — pure SVG + the vector-icon set already
 * shipping in the app.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

export type Tier = 'bronze' | 'silver' | 'gold';

const TIERS: Record<Tier, { ring: string; fillTop: string; fillBot: string; glyph: string; accent: string }> = {
    bronze: { ring: '#B5894C', fillTop: '#F4E7D0', fillBot: '#E7CFA6', glyph: '#8A6730', accent: '#D7B277' },
    silver: { ring: '#9BA4AE', fillTop: '#F1F3F5', fillBot: '#DCE0E5', glyph: '#5B6671', accent: '#C2C9D1' },
    gold: { ring: '#D4A017', fillTop: '#FBF1CF', fillBot: '#F0D993', glyph: '#977200', accent: '#EBC85A' },
};

const LOCKED = { ring: '#D8D1C4', fillTop: '#F2ECE0', fillBot: '#E7E0D1', glyph: '#B7AE9E', accent: '#E2DACB' };

// Achievement icon key -> Ionicons glyph.
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

function hexPoints(cx: number, cy: number, r: number): string {
    // pointy-top hexagon
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 90);
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
}

export default function AchievementBadge({
    icon,
    tier,
    earned,
    size = 76,
    progress,
}: {
    icon: string;
    tier: Tier;
    earned: boolean;
    size?: number;
    /** 0..1 fill toward earning, shown as an arc on locked badges only. */
    progress?: number | null;
}) {
    const T = earned ? TIERS[tier] : LOCKED;
    const c = size / 2;
    const ringW = size * 0.055;
    const rOuter = c - ringW / 2 - 1;
    const rInner = rOuter - ringW * 0.9;
    const glyphName = GLYPH[icon] || 'ribbon';
    const glyphSize = size * 0.4;

    // progress arc geometry (locked only)
    const showArc = !earned && typeof progress === 'number' && progress > 0;
    const arcR = rOuter;
    const circ = 2 * Math.PI * arcR;
    const pct = Math.max(0, Math.min(1, progress || 0));

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <LinearGradient id={`fill-${tier}-${earned}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={T.fillTop} />
                        <Stop offset="1" stopColor={T.fillBot} />
                    </LinearGradient>
                </Defs>
                {/* base ring */}
                <Circle cx={c} cy={c} r={rOuter} fill="none" stroke={T.ring} strokeWidth={ringW} opacity={earned ? 1 : 0.5} />
                {/* progress arc on locked badges */}
                {showArc ? (
                    <Circle
                        cx={c} cy={c} r={arcR} fill="none"
                        stroke={LLOCK_ARC} strokeWidth={ringW}
                        strokeLinecap="round"
                        strokeDasharray={`${circ * pct} ${circ}`}
                        transform={`rotate(-90 ${c} ${c})`}
                    />
                ) : null}
                {/* medallion face */}
                <Circle cx={c} cy={c} r={rInner} fill={`url(#fill-${tier}-${earned})`} />
                {/* faceted inner accent hexagon */}
                <Polygon
                    points={hexPoints(c, c, rInner * 0.74)}
                    fill="none"
                    stroke={T.accent}
                    strokeWidth={size * 0.02}
                    opacity={earned ? 0.65 : 0.4}
                />
            </Svg>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={styles.center}>
                    <Ionicons name={glyphName} size={glyphSize} color={T.glyph} />
                </View>
            </View>
        </View>
    );
}

// muted gold-blue arc so progress reads on the warm canvas without shouting
const LLOCK_ARC = '#C9A24B';

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
