/**
 * MessageBlocks — native renderers for the assistant's structured visuals
 * (table, comparison, timeline, flowchart, stat_cards, checklist). Strictly
 * additive: renders nothing when `blocks` is empty, so the chat prose path is
 * untouched. Built from RN primitives only (no chart libs). Craft aesthetic:
 * ink text, cream/white cards, hairline rules, muted gold accents.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/dark';
import LiquidGlass from './glass/LiquidGlass';
import type { VisualBlock } from '../services/api';
import { Image as ExpoImage } from 'expo-image';
import { maxxThumbCut } from '../data/maxxThumbs';

const INK = colors.foreground;      // #111113
const SUB = colors.textSecondary;   // #555
const MUTE = colors.textMuted;      // #9A9A9A
const HAIR = 'rgba(0,0,0,0.08)';
const CARD = '#FFFFFF';
const GOLD = '#C29A4E';
const GOOD = '#2F9E60';
// Match the chat surface exactly: white ground, system font (no fontFamily),
// so blocks read as part of the conversation rather than a foreign card.
const CHAT_INK = '#0D0D0D';
const CHAT_MUTE = '#8E8E93';

// The backend's _extract_visual_blocks only validates that `type` is an
// allowed string and `data` is a dict/list — every interior leaf (table
// cells, comparison pros/cons, timeline/flowchart labels, stat-card values,
// checklist texts) is raw, unvalidated LLM JSON. If any leaf is an
// object/array/null, React throws "Objects are not valid as a React child"
// and crashes the whole chat UI mid-conversation. Every rendered leaf below
// is passed through this so a malformed leaf renders as blank text instead
// of crashing the screen.
const txt = (v: any) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

function BlockTitle({ title }: { title?: string | null }) {
    const t = txt(title);
    if (!t) return null;
    return <Text style={s.blockTitle}>{t}</Text>;
}

function TableBlock({ block }: { block: VisualBlock }) {
    const columns: string[] = Array.isArray(block.data?.columns) ? block.data.columns : [];
    // A row itself (not just a cell) is raw LLM JSON and can be a non-array
    // (object/string/null) despite the string[][] annotation below — filter
    // those out before indexing into them, or `r[ci]` on a null row throws.
    const rows: string[][] = (Array.isArray(block.data?.rows) ? block.data.rows : []).filter(Array.isArray);
    if (!columns.length || !rows.length) return null;
    return (
        <View style={s.card}>
            <BlockTitle title={block.title} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                    <View style={[s.tr, s.trHead]}>
                        {columns.map((c, i) => (
                            <Text key={i} style={[s.th, i === 0 && s.cellFirst]} numberOfLines={2}>{txt(c)}</Text>
                        ))}
                    </View>
                    {rows.map((r, ri) => (
                        <View key={ri} style={[s.tr, ri % 2 === 1 && s.trAlt]}>
                            {columns.map((_, ci) => (
                                <Text key={ci} style={[s.td, ci === 0 && s.cellFirst]} numberOfLines={4}>
                                    {txt(r[ci])}
                                </Text>
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

function ComparisonBlock({ block }: { block: VisualBlock }) {
    const options: any[] = Array.isArray(block.data?.options) ? block.data.options : [];
    if (!options.length) return null;
    return (
        <View style={s.card}>
            <BlockTitle title={block.title} />
            <View style={s.cmpRow}>
                {options.slice(0, 3).map((o, i) => {
                    const name = txt(o?.name) || `Option ${i + 1}`;
                    return (
                        <View key={i} style={[s.cmpCol, i > 0 && s.cmpDivider]}>
                            <Text style={s.cmpName}>{name}</Text>
                            {(Array.isArray(o?.pros) ? o.pros : []).map((p: unknown, pi: number) => (
                                <View key={`p${pi}`} style={s.cmpLine}>
                                    <Ionicons name="add-circle" size={13} color={GOOD} style={s.cmpIcon} />
                                    <Text style={s.cmpPt}>{txt(p)}</Text>
                                </View>
                            ))}
                            {(Array.isArray(o?.cons) ? o.cons : []).map((c: unknown, ci: number) => (
                                <View key={`c${ci}`} style={s.cmpLine}>
                                    <Ionicons name="remove-circle" size={13} color={MUTE} style={s.cmpIcon} />
                                    <Text style={[s.cmpPt, { color: SUB }]}>{txt(c)}</Text>
                                </View>
                            ))}
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function TimelineBlock({ block }: { block: VisualBlock }) {
    const steps: any[] = Array.isArray(block.data?.steps) ? block.data.steps : [];
    if (!steps.length) return null;
    return (
        <View style={s.card}>
            <BlockTitle title={block.title} />
            {steps.map((st, i) => {
                const detail = txt(st?.detail);
                return (
                    <View key={i} style={s.tlRow}>
                        <View style={s.tlRail}>
                            <View style={s.tlDot} />
                            {i < steps.length - 1 ? <View style={s.tlLine} /> : null}
                        </View>
                        <View style={s.tlBody}>
                            <Text style={s.tlLabel}>{txt(st?.label)}</Text>
                            {detail ? <Text style={s.tlDetail}>{detail}</Text> : null}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

function FlowchartBlock({ block }: { block: VisualBlock }) {
    // Rendered as a vertical connected flow of nodes (label + optional note).
    const steps: any[] = Array.isArray(block.data?.steps) ? block.data.steps : [];
    const norm = steps.map((st) => (typeof st === 'string' ? { label: st } : st));
    if (!norm.length) return null;
    return (
        <View style={s.card}>
            <BlockTitle title={block.title} />
            {norm.map((st, i) => {
                const note = txt(st?.note);
                return (
                    <View key={i}>
                        <View style={s.fcNode}>
                            <Text style={s.fcLabel}>{txt(st?.label)}</Text>
                            {note ? <Text style={s.fcNote}>{note}</Text> : null}
                        </View>
                        {i < norm.length - 1 ? (
                            <View style={s.fcArrow}>
                                <Ionicons name="arrow-down" size={15} color={MUTE} />
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}

function StatCardsBlock({ block }: { block: VisualBlock }) {
    const cards: any[] = Array.isArray(block.data?.cards) ? block.data.cards : [];
    if (!cards.length) return null;
    // Transparent stack of one-line liquid-glass pills: the number leads, the
    // label trails on the same line, both in the chat's own system font. No
    // opaque card — the glass floats on the white chat surface.
    return (
        <View style={s.statStack}>
            {cards.slice(0, 4).map((c, i) => {
                const hint = txt(c?.hint);
                return (
                    <LiquidGlass key={i} radius={13} spec={0.85} style={s.statPill} contentStyle={s.statPillContent}>
                        <View style={s.statLine}>
                            <Text style={s.statValueLine} numberOfLines={1}>{txt(c?.value)}</Text>
                            <Text style={s.statLabelLine} numberOfLines={2}>{txt(c?.label)}</Text>
                        </View>
                        {hint ? <Text style={s.statHint} numberOfLines={2}>{hint}</Text> : null}
                    </LiquidGlass>
                );
            })}
        </View>
    );
}

function ChecklistBlock({ block }: { block: VisualBlock }) {
    const rawItems: any[] = Array.isArray(block.data?.items) ? block.data.items : [];
    const items = rawItems.map((it) => (typeof it === 'string' ? { text: it, done: false } : it));
    if (!items.length) return null;
    return (
        <View style={s.card}>
            <BlockTitle title={block.title} />
            {items.map((it, i) => (
                <View key={i} style={s.clRow}>
                    <Ionicons
                        name={it?.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={17}
                        color={it?.done ? GOOD : MUTE}
                        style={{ marginRight: 9 }}
                    />
                    <Text style={s.clText}>{txt(it?.text)}</Text>
                </View>
            ))}
        </View>
    );
}

// "5am" / "5:30pm" → "5:00 AM" / "5:30 PM" (anything else passes through).
function clockLabel(v: any): string {
    const t = txt(v).trim();
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(t);
    if (!m) return t;
    return `${m[1]}:${m[2] ?? '00'} ${m[3].toUpperCase()}`;
}

// An AI program's plan (Sleepmax, …): one calm card — program icon + name,
// then a slim timeline of time · habit · minutes · days. Replaces the old
// bullet list so the plan reads like the planner, not a wall of text.
function PlanBlock({ block }: { block: VisualBlock }) {
    const d: any = block.data || {};
    const items: any[] = (Array.isArray(d.items) ? d.items : []).filter((it: any) => it && typeof it === 'object' && txt(it.title));
    if (!items.length) return null;
    const accent = /^#[0-9a-f]{6}$/i.test(txt(d.color)) ? txt(d.color) : CHAT_INK;
    const thumb = maxxThumbCut(txt(d.program));
    const perDay = Number(d.total_minutes) || 0;
    return (
        <View style={s.planCard}>
            <View style={s.planHead}>
                {thumb ? <ExpoImage source={thumb} style={s.planIcon} contentFit="contain" /> : null}
                <Text style={s.planTitle} numberOfLines={1}>{txt(block.title) || 'Your plan'}</Text>
                {perDay > 0 ? <Text style={s.planMeta}>{perDay} min a day</Text> : null}
            </View>
            {items.map((it, i) => {
                const last = i === items.length - 1;
                const mins = Number(it.minutes) || 0;
                const sub = [mins ? `${mins} min` : '', txt(it.days)].filter(Boolean).join(' · ');
                return (
                    <View key={i} style={s.planRow}>
                        <Text style={s.planTime}>{clockLabel(it.time)}</Text>
                        <View style={s.planRail}>
                            <View style={[s.planDot, { backgroundColor: accent }]} />
                            {!last ? <View style={s.planLine} /> : null}
                        </View>
                        <View style={[s.planBody, !last && s.planBodyGap]}>
                            <Text style={s.planHabit}>{txt(it.title)}</Text>
                            {sub ? <Text style={s.planSub}>{sub}</Text> : null}
                        </View>
                    </View>
                );
            })}
            {txt(d.note) ? (
                <View style={s.planFoot}>
                    <Ionicons name="checkmark-circle" size={14} color={accent} />
                    <Text style={s.planNote}>{txt(d.note)}</Text>
                </View>
            ) : null}
        </View>
    );
}

function OneBlock({ block }: { block: VisualBlock }) {
    switch (block?.type) {
        case 'table': return <TableBlock block={block} />;
        case 'comparison': return <ComparisonBlock block={block} />;
        case 'timeline': return <TimelineBlock block={block} />;
        case 'flowchart': return <FlowchartBlock block={block} />;
        case 'stat_cards': return <StatCardsBlock block={block} />;
        case 'checklist': return <ChecklistBlock block={block} />;
        case 'plan': return <PlanBlock block={block} />;
        default: return null;
    }
}

export default function MessageBlocks({ blocks }: { blocks?: VisualBlock[] | null }) {
    if (!blocks || blocks.length === 0) return null;
    return (
        <View style={s.wrap}>
            {blocks.map((b, i) => <OneBlock key={i} block={b} />)}
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { marginTop: 8, gap: 8 },
    // plan
    planCard: {
        backgroundColor: CARD, borderRadius: 18, borderCurve: 'continuous',
        paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    },
    planHead: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingBottom: 10, marginBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIR,
    },
    planIcon: { width: 26, height: 26 },
    planTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: CHAT_INK, letterSpacing: -0.2 },
    planMeta: { fontSize: 12.5, color: CHAT_MUTE, fontVariant: ['tabular-nums'] },
    planRow: { flexDirection: 'row' },
    planTime: { width: 70, fontSize: 13, color: CHAT_INK, fontWeight: '500', fontVariant: ['tabular-nums'], paddingTop: 1 },
    planRail: { width: 16, alignItems: 'center' },
    planDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
    planLine: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(0,0,0,0.10)', marginTop: 4, marginBottom: -2 },
    planBody: { flex: 1, paddingLeft: 6 },
    planBodyGap: { paddingBottom: 14 },
    planHabit: { fontSize: 15, color: CHAT_INK, lineHeight: 20 },
    planSub: { fontSize: 12.5, color: CHAT_MUTE, marginTop: 2 },
    planFoot: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 12, paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIR,
    },
    planNote: { fontSize: 12.5, color: CHAT_MUTE },
    card: {
        backgroundColor: CARD, borderRadius: 14, borderCurve: 'continuous',
        padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    blockTitle: { fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: INK, marginBottom: 8, letterSpacing: 0.2 },
    // table
    tr: { flexDirection: 'row' },
    trHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.14)', paddingBottom: 6, marginBottom: 4 },
    trAlt: { backgroundColor: 'rgba(0,0,0,0.02)' },
    th: { minWidth: 84, maxWidth: 150, paddingHorizontal: 8, fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK },
    td: { minWidth: 84, maxWidth: 150, paddingHorizontal: 8, paddingVertical: 5, fontFamily: fonts.sans, fontSize: 12.5, color: SUB },
    cellFirst: { minWidth: 96, maxWidth: 170 },
    // comparison
    cmpRow: { flexDirection: 'row' },
    cmpCol: { flex: 1, paddingHorizontal: 8 },
    cmpDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: HAIR },
    cmpName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, marginBottom: 6 },
    // No `gap` here: with gap, Yoga measures the wrapped Text too wide and clips
    // the end of lines ("jet lag, sh"). A margin on the icon is measured right.
    cmpLine: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
    cmpIcon: { marginTop: 1.5, marginRight: 5 },
    cmpPt: { flex: 1, flexShrink: 1, fontFamily: fonts.sans, fontSize: 12, color: INK, lineHeight: 16 },
    // timeline
    tlRow: { flexDirection: 'row', alignItems: 'stretch' },
    tlRail: { width: 18, alignItems: 'center' },
    tlDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD, marginTop: 3 },
    tlLine: { flex: 1, width: 2, backgroundColor: HAIR, marginTop: 2 },
    tlBody: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
    tlLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK },
    tlDetail: { fontFamily: fonts.sans, fontSize: 12.5, color: SUB, marginTop: 2, lineHeight: 17 },
    // flowchart
    fcNode: {
        backgroundColor: '#F6F5F2', borderRadius: 10, borderCurve: 'continuous',
        paddingVertical: 9, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR,
    },
    fcLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK, textAlign: 'center' },
    fcNote: { fontFamily: fonts.sans, fontSize: 11.5, color: MUTE, textAlign: 'center', marginTop: 2 },
    fcArrow: { alignItems: 'center', paddingVertical: 2 },
    // stat cards — transparent stack of one-line liquid-glass pills
    statStack: { gap: 7 },
    statPill: { borderRadius: 13, borderCurve: 'continuous' },
    statPillContent: { paddingVertical: 9, paddingHorizontal: 14 },
    statLine: { flexDirection: 'row', alignItems: 'baseline' },
    // System font (no fontFamily) to match the chat's assistant text exactly.
    statValueLine: { fontSize: 16, fontWeight: '700', color: CHAT_INK, letterSpacing: -0.2, fontVariant: ['tabular-nums'], marginRight: 10 },
    statLabelLine: { flex: 1, flexShrink: 1, fontSize: 14, color: CHAT_MUTE, letterSpacing: 0 },
    statHint: { fontSize: 12.5, color: CHAT_MUTE, marginTop: 3, lineHeight: 17 },
    // checklist
    clRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    clText: { flex: 1, flexShrink: 1, fontFamily: fonts.sans, fontSize: 13, color: INK, lineHeight: 18 },
});
