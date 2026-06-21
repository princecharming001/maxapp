/**
 * MosaicGrid — a packed "bento" of metric tiles where tapping a tile expands it
 * and the rest reflow to leave NO white space. Only one tile is expanded at a
 * time.
 *
 * How the no-gap packing works: every tile is a sibling inside ONE flex-wrap
 * row. Each tile has a `flexBasis` (its target width) AND `flexGrow: 1`, so
 * within every wrapped line the tiles stretch to fill the line exactly —
 * justified rows, never a trailing gap, regardless of how many tiles land on a
 * line. The expanded tile takes `flexBasis: '100%'` (its own full-width line)
 * and a taller height. Because all tiles stay siblings of the same parent,
 * Reanimated's `LinearTransition` animates the reflow (position + size) smoothly
 * when one expands/collapses — no re-parenting, no remount, no jump.
 *
 * Locked tiles blur their value behind a frosted veil + lock; expanding a locked
 * tile surfaces an "Unlock" CTA instead of the score.
 */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../hooks/useA11y';
import { fonts } from '../../theme/dark';

export type MosaicTile = {
    /** Stable identity (used for expand state + React key). */
    key: string;
    /** Short tile label, e.g. "Jawline". */
    label: string;
    /** The headline value, e.g. "8.2", "Positive", "112°". */
    value: string;
    /** Unit suffix shown small after the value, e.g. "/10". */
    unit?: string;
    /** 0–10 score that drives the accent/score color (optional). */
    score?: number;
    /** Per-tile accent dot color. */
    accent: string;
    /** Short qualitative tag, e.g. "Strong" / "Hollow" / "Positive tilt". */
    tag?: string;
    /** 1–2 sentence elaboration shown only when expanded. */
    detail?: string;
    /** When true the value is hidden behind a frosted lock. */
    locked: boolean;
};

const INK = '#16131F';
const SUB = '#6E6A78';
const HAIR = 'rgba(20,16,30,0.08)';

const SHADOW = {
    shadowColor: '#241C3A', shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 2,
} as const;

/** Green → amber → red by 0–10 score (matches the looksmax "good/mid/weak" read). */
export function scoreColor(score?: number): string {
    if (score == null || Number.isNaN(score)) return '#8E8AA0';
    if (score >= 7.5) return '#2F9E60';
    if (score >= 6) return '#5FA86B';
    if (score >= 5) return '#B5871C';
    if (score >= 4) return '#C9772E';
    return '#C0452C';
}

function TileInner({ tile, expanded, onUnlock }: { tile: MosaicTile; expanded: boolean; onUnlock?: () => void }) {
    const sc = scoreColor(tile.score);

    if (expanded) {
        return (
            <Animated.View key="exp" entering={FadeIn.duration(180)} style={m.expInner}>
                <View style={m.expTop}>
                    <View style={[m.dot, { backgroundColor: tile.accent }]} />
                    <Text style={m.expLabel}>{tile.label}</Text>
                </View>

                {tile.locked ? (
                    <View style={m.expLockBlock}>
                        <Ionicons name="lock-closed" size={26} color={tile.accent} />
                        <Text style={m.expLockText}>Unlock your full scan to reveal this score.</Text>
                        {onUnlock ? (
                            <Pressable style={m.unlockBtn} onPress={onUnlock} hitSlop={6}>
                                <Ionicons name="lock-open-outline" size={14} color="#FFFFFF" />
                                <Text style={m.unlockText}>Unlock full results</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : (
                    <>
                        <View style={m.expValueRow}>
                            <Text style={[m.expValue, { color: tile.score != null ? sc : INK }]}>{tile.value}</Text>
                            {tile.unit ? <Text style={m.expUnit}>{tile.unit}</Text> : null}
                            {tile.tag ? (
                                <View style={[m.tagPill, { backgroundColor: `${tile.accent}1A` }]}>
                                    <Text style={[m.tagText, { color: tile.accent }]}>{tile.tag}</Text>
                                </View>
                            ) : null}
                        </View>
                        {tile.detail ? <Text style={m.expDetail}>{tile.detail}</Text> : null}
                    </>
                )}
            </Animated.View>
        );
    }

    return (
        <Animated.View key="cmp" entering={FadeIn.duration(160)} style={m.cmpInner}>
            <View style={[m.dot, { backgroundColor: tile.accent }]} />
            <Text style={m.cmpLabel} numberOfLines={1}>{tile.label}</Text>
            {tile.locked ? (
                <View style={m.cmpLockRow}>
                    <Text style={m.cmpLockGhost}>•.•</Text>
                    <BlurView intensity={16} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={m.cmpLockBadge}>
                        <Ionicons name="lock-closed" size={11} color={SUB} />
                    </View>
                </View>
            ) : (
                <View style={m.cmpValueRow}>
                    <Text style={[m.cmpValue, { color: tile.score != null ? sc : INK }]} numberOfLines={1}>
                        {tile.value}
                    </Text>
                    {tile.unit ? <Text style={m.cmpUnit}>{tile.unit}</Text> : null}
                </View>
            )}
        </Animated.View>
    );
}

export default function MosaicGrid({
    tiles,
    onUnlock,
}: {
    tiles: MosaicTile[];
    onUnlock?: () => void;
}) {
    const reduced = useReducedMotion();
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const layout = reduced
        ? undefined
        : LinearTransition.springify().damping(18).stiffness(170).mass(0.7);

    const toggle = useCallback((key: string) => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        setExpandedKey((cur) => (cur === key ? null : key));
    }, []);

    return (
        <View style={m.wrap}>
            {tiles.map((tile) => {
                const expanded = expandedKey === tile.key;
                return (
                    <Animated.View
                        key={tile.key}
                        layout={layout}
                        style={[
                            m.tile,
                            expanded ? m.tileExpanded : m.tileCompact,
                            { borderColor: expanded ? `${tile.accent}55` : HAIR },
                        ]}
                    >
                        <Pressable
                            onPress={() => toggle(tile.key)}
                            style={m.press}
                            accessibilityRole="button"
                            accessibilityState={{ expanded }}
                            accessibilityLabel={`${tile.label}${tile.locked ? ', locked' : `, ${tile.value}${tile.unit || ''}`}`}
                        >
                            <TileInner tile={tile} expanded={expanded} onUnlock={onUnlock} />
                        </Pressable>
                    </Animated.View>
                );
            })}
        </View>
    );
}

const m = StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    tile: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        ...SHADOW,
    },
    // Compact: ~3 per line. flexGrow:1 justifies each wrapped line → no gaps.
    tileCompact: { flexBasis: '29%', flexGrow: 1, minWidth: 96, height: 92 },
    // Expanded: its own full-width line, taller.
    tileExpanded: { flexBasis: '100%', flexGrow: 1, minHeight: 150 },

    press: { flex: 1, padding: 14, justifyContent: 'space-between' },

    dot: { width: 7, height: 7, borderRadius: 4 },

    // Compact content
    cmpInner: { flex: 1, justifyContent: 'space-between' },
    cmpLabel: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: INK, marginTop: 8, letterSpacing: -0.1 },
    cmpValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
    cmpValue: { fontFamily: fonts.serif, fontSize: 20, letterSpacing: -0.4 },
    cmpUnit: { fontFamily: 'Matter-Medium', fontSize: 11, color: SUB, marginLeft: 2 },
    cmpLockRow: { height: 24, marginTop: 2, justifyContent: 'center', borderRadius: 6, overflow: 'hidden' },
    cmpLockGhost: { fontFamily: fonts.serif, fontSize: 20, color: '#C8C4D2', letterSpacing: 1 },
    cmpLockBadge: { position: 'absolute', right: 0, bottom: 2 },

    // Expanded content
    expInner: { flex: 1 },
    expTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    expLabel: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK, letterSpacing: -0.2 },
    expValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14, flexWrap: 'wrap' },
    expValue: { fontFamily: fonts.serif, fontSize: 40, letterSpacing: -1, lineHeight: 42 },
    expUnit: { fontFamily: 'Matter-Medium', fontSize: 15, color: SUB, marginLeft: 3 },
    tagPill: { marginLeft: 10, alignSelf: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    tagText: { fontFamily: 'Matter-SemiBold', fontSize: 11.5, letterSpacing: 0.2 },
    expDetail: { fontFamily: 'Matter-Regular', fontSize: 13, lineHeight: 19, color: SUB, marginTop: 12 },

    expLockBlock: { marginTop: 16, alignItems: 'flex-start', gap: 12 },
    expLockText: { fontFamily: 'Matter-Regular', fontSize: 13.5, lineHeight: 19, color: SUB },
    unlockBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: INK,
        borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginTop: 2,
    },
    unlockText: { fontFamily: 'Matter-SemiBold', fontSize: 13, color: '#FFFFFF', letterSpacing: 0.1 },
});
