/**
 * BlockPreviewScreen (DEV ONLY) — renders one of every chat visual-block type
 * through the REAL MessageBlocks renderer + the confidence popover, from fixed
 * fixtures. Lets us eyeball each type's styling on the actual component without
 * depending on the LLM to emit it. Reached from the DevDrawer.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import MessageBlocks from '../../components/MessageBlocks';
import ConfidenceInfoButton from '../../components/ConfidenceInfoButton';
import { fonts } from '../../theme/dark';
import type { VisualBlock } from '../../services/api';

const INK = '#111113';
const SUB = '#6B6B6B';
const BG = '#FFFFFF'; // match the chat surface (white) so glass previews faithfully

const BLOCKS: { label: string; block: VisualBlock }[] = [
    { label: 'table', block: { type: 'table', title: 'Jaw routine', data: {
        columns: ['Exercise', 'Sets', 'Reps'],
        rows: [['neck curls', '3', '15'], ['chin tucks', '2', '20'], ['hard-gum chew', '—', '20 min']],
    } } },
    { label: 'comparison', block: { type: 'comparison', title: 'Mewing vs gum', data: {
        options: [
            { name: 'mewing', pros: ['free', 'improves posture'], cons: ['slow', 'thin long-term data'] },
            { name: 'hard gum', pros: ['builds masseter', 'measurable'], cons: ['jaw fatigue', 'can overdevelop'] },
        ],
    } } },
    { label: 'timeline', block: { type: 'timeline', title: '4-week acne plan', data: {
        steps: [
            { label: 'week 1', detail: 'gentle cleanser AM/PM, nothing else' },
            { label: 'week 2', detail: 'add 2.5% benzoyl peroxide spot-treat' },
            { label: 'week 3–4', detail: 'introduce adapalene 2 nights/week' },
        ],
    } } },
    { label: 'flowchart', block: { type: 'flowchart', title: 'AM routine', data: {
        steps: [
            { label: 'cleanse', note: 'lukewarm water' },
            { label: 'treat', note: 'vitamin C' },
            { label: 'moisturize' },
            { label: 'sunscreen', note: 'SPF 30+' },
        ],
    } } },
    { label: 'stat_cards', block: { type: 'stat_cards', data: {
        cards: [
            { value: '−30%', label: 'acne with 8h sleep', hint: 'vs <6h' },
            { value: '14d', label: 'first visible change' },
            { value: '92%', label: 'stick with AM+PM' },
        ],
    } } },
    { label: 'checklist', block: { type: 'checklist', title: 'Daily', data: {
        items: ['double cleanse at night', 'spf every morning', 'change pillowcase 2×/week', 'hands off — no picking'],
    } } },
];

const CONFIDENCE = [
    { title: 'mewing', confidence: 45, rationale: 'anecdotal, limited long-term evidence' },
    { title: 'hard-gum chewing', confidence: 72, rationale: 'masseter hypertrophy is well established' },
];

export default function BlockPreviewScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back}>
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Chat visual blocks</Text>
                <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
                {BLOCKS.map(({ label, block }) => (
                    <View key={label} style={s.section}>
                        <Text style={s.label}>{label}</Text>
                        <MessageBlocks blocks={[block]} />
                    </View>
                ))}
                <View style={s.section}>
                    <Text style={s.label}>method confidence (the “i” button)</Text>
                    <View style={s.confRow}>
                        <Text style={s.confHint}>tap →</Text>
                        <ConfidenceInfoButton methods={CONFIDENCE} />
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.serif, fontSize: 18, color: INK },
    section: { marginTop: 18 },
    label: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1, color: SUB, textTransform: 'uppercase', marginBottom: 6 },
    confRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    confHint: { fontFamily: fonts.sans, fontSize: 13, color: SUB },
});
