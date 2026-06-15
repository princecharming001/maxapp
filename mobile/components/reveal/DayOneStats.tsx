/**
 * DayOneStats — the first-day reveal as a "character sheet".
 *
 * Instead of a bare vertical stack, the day is composed into one framed panel,
 * borrowing the structure of a video-game player-stats screen — rendered in the
 * app's editorial Craft style (warm paper, ink, Fraunces numerals, hairlines):
 *
 *   ┌───────────────────────────────────────────┐
 *   │ ▔ focus-colour rail                         │
 *   │ DAY              ·          ◍ Hairmax  ›    │   HUD: level + "class" chip
 *   │ 01                                          │
 *   │ ┌ WAKE ┐ ┌ ROUTINES ┐ ┌ WIND DOWN ┐        │   attribute tiles
 *   │ │ 7:00a│ │    4      │ │  11:00p   │        │
 *   │ ───────────────────────────────────        │
 *   │ STARTING ROUTINE                            │   quest log (timeline)
 *   │ 7:05a ◍ scalp massage 60s                   │
 *   │       │ a quick break in your day           │
 *   └───────────────────────────────────────────┘
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PAPER = '#FCFAF6';
const INK = '#1C1A17';
const SUB = '#5C574E';
const MUTE = '#97928A';
const HAIR = '#E8E0D3';
const SERIF = 'Fraunces';

export type QuestTask = { time: string; title: string; why?: string };

export const MAX_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    skinmax: { label: 'Skinmax', color: '#8B5CF6', icon: 'sparkles-outline' },
    fitmax: { label: 'Fitmax', color: '#10B981', icon: 'fitness-outline' },
    hairmax: { label: 'Hairmax', color: '#3B82F6', icon: 'cut-outline' },
    heightmax: { label: 'Heightmax', color: '#6366F1', icon: 'resize-outline' },
    bonemax: { label: 'Bonemax', color: '#F59E0B', icon: 'body-outline' },
};

function hexA(hex: string, a: number): string {
    const h = (hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Tile({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.tile}>
            <Text style={s.tileLabel}>{label}</Text>
            <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        </View>
    );
}

export default function DayOneStats({
    focusMax,
    wake,
    windDown,
    tasks,
}: {
    focusMax: string | null;
    wake: string;
    windDown: string;
    tasks: QuestTask[];
}) {
    const meta = (focusMax && MAX_META[focusMax]) || null;
    const accent = meta?.color || INK;

    return (
        <View style={s.sheet}>
            <View style={[s.rail, { backgroundColor: accent }]} />
            <View style={s.inner}>
                {/* HUD: day "level" + focus "class" */}
                <View style={s.hud}>
                    <View style={s.levelWrap}>
                        <Text style={s.levelKicker}>DAY</Text>
                        <Text style={s.levelNum}>01</Text>
                    </View>
                    {meta ? (
                        <View style={s.classWrap}>
                            <Text style={s.classKicker}>FOCUS</Text>
                            <View style={[s.classChip, { borderColor: hexA(accent, 0.35), backgroundColor: hexA(accent, 0.08) }]}>
                                <Ionicons name={meta.icon} size={14} color={accent} />
                                <Text style={[s.classText, { color: INK }]}>{meta.label}</Text>
                            </View>
                        </View>
                    ) : null}
                </View>

                {/* Attribute tiles */}
                <View style={s.tiles}>
                    <Tile label="WAKE" value={wake || '—'} />
                    <View style={s.tileGap} />
                    <Tile label="ROUTINES" value={String(tasks.length)} />
                    <View style={s.tileGap} />
                    <Tile label="WIND DOWN" value={windDown || '—'} />
                </View>

                <View style={s.divider} />

                {/* Quest log — the day as a timeline */}
                <Text style={s.logLabel}>STARTING ROUTINE</Text>
                <View>
                    {tasks.map((t, i) => {
                        const first = i === 0;
                        const last = i === tasks.length - 1;
                        return (
                            <View key={`${t.title}-${i}`} style={s.quest}>
                                <Text style={s.questTime}>{t.time}</Text>
                                <View style={s.spine}>
                                    <View style={[s.line, first && s.lineHidden]} />
                                    <View style={[s.dot, { backgroundColor: accent }]} />
                                    <View style={[s.line, last && s.lineHidden]} />
                                </View>
                                <View style={s.questBody}>
                                    <Text style={s.questTitle}>{t.title}</Text>
                                    {t.why ? <Text style={s.questWhy}>{t.why}</Text> : null}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    sheet: {
        backgroundColor: PAPER,
        borderRadius: 22,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: HAIR,
        overflow: 'hidden',
        shadowColor: '#3A352B',
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
    },
    rail: { height: 4, width: '100%' },
    inner: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },

    hud: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    levelWrap: {},
    levelKicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 2, color: MUTE },
    levelNum: { fontFamily: SERIF, fontSize: 54, lineHeight: 56, color: INK, letterSpacing: -1.5, marginTop: -2 },
    classWrap: { alignItems: 'flex-end', gap: 6, paddingTop: 4 },
    classKicker: { fontFamily: 'Matter-SemiBold', fontSize: 10, letterSpacing: 1.8, color: MUTE },
    classChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    },
    classText: { fontFamily: 'Matter-SemiBold', fontSize: 13.5, letterSpacing: -0.1 },

    tiles: { flexDirection: 'row', marginTop: 18 },
    tile: {
        flex: 1, alignItems: 'center', paddingVertical: 13,
        backgroundColor: '#F4EEE4', borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    tileGap: { width: 8 },
    tileLabel: { fontFamily: 'Matter-SemiBold', fontSize: 9.5, letterSpacing: 1.2, color: MUTE },
    tileValue: { fontFamily: SERIF, fontSize: 21, color: INK, letterSpacing: -0.4, marginTop: 4 },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: HAIR, marginTop: 20, marginBottom: 16 },

    logLabel: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.6, color: MUTE, marginBottom: 6 },
    quest: { flexDirection: 'row', alignItems: 'stretch', minHeight: 46 },
    questTime: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: MUTE, width: 48, paddingTop: 12, letterSpacing: 0.1 },
    spine: { width: 18, alignItems: 'center' },
    line: { width: StyleSheet.hairlineWidth, flex: 1, backgroundColor: HAIR },
    lineHidden: { backgroundColor: 'transparent' },
    dot: { width: 9, height: 9, borderRadius: 5, marginVertical: 2, marginTop: 11 },
    questBody: { flex: 1, paddingTop: 9, paddingBottom: 12, paddingLeft: 6 },
    questTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK, letterSpacing: -0.1 },
    questWhy: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 2, lineHeight: 17 },
});
