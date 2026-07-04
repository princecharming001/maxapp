/**
 * CreatorSettingsScreen — edit the public profile (display name, tagline, bio),
 * see the subscription price + review status, and go live.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F5F5F5';

export default function CreatorSettingsScreen() {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const [creator, setCreator] = useState<any>(null);
    const [displayName, setDisplayName] = useState('');
    const [tagline, setTagline] = useState('');
    const [bio, setBio] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const c = await api.getMyCreator();
            setCreator(c);
            setDisplayName(c.display_name || '');
            setTagline(c.tagline || '');
            setBio(c.bio || '');
        } catch { /* keep */ }
        finally { setLoading(false); }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const save = async () => {
        setSaving(true);
        try {
            const c = await api.updateMyCreator({ display_name: displayName, tagline, bio });
            setCreator(c);
            Alert.alert('Saved');
        } catch (e: any) {
            Alert.alert('Could not save', e?.response?.data?.detail || 'Try again.');
        } finally { setSaving(false); }
    };

    const goLive = async () => {
        try {
            const c = await api.updateMyCreator({ go_live: true });
            setCreator(c);
            Alert.alert('You’re live', 'Your max is now listed.');
        } catch (e: any) {
            Alert.alert('Not yet', e?.response?.data?.detail || 'Try again.');
        }
    };

    if (loading) return <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={INK} /></View>;

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle}>Settings</Text>
                <TouchableOpacity onPress={save} hitSlop={12} disabled={saving} accessibilityLabel="Save">
                    {saving ? <ActivityIndicator size="small" color={INK} /> : <Text style={s.saveBtn}>Save</Text>}
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={s.label}>DISPLAY NAME</Text>
                    <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} maxLength={60} placeholder="Your name" placeholderTextColor={MUTE} />
                    <Text style={s.label}>TAGLINE</Text>
                    <TextInput style={s.input} value={tagline} onChangeText={setTagline} maxLength={120} placeholder="What your max is about" placeholderTextColor={MUTE} />
                    <Text style={s.label}>BIO</Text>
                    <TextInput style={[s.input, s.bio]} value={bio} onChangeText={setBio} maxLength={600} multiline placeholder="Tell subscribers who you are" placeholderTextColor={MUTE} />

                    <View style={s.infoCard}>
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Price</Text>
                            <Text style={s.infoValue}>${((creator?.price_cents || 0) / 100).toFixed(2)}/mo</Text>
                        </View>
                        <View style={s.divider} />
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Status</Text>
                            <Text style={[s.infoValue, creator?.status === 'live' && { color: '#2F9E60' }]}>{creator?.status}</Text>
                        </View>
                        <View style={s.divider} />
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Apple review</Text>
                            <Text style={s.infoValue}>{creator?.apple_review_status}</Text>
                        </View>
                    </View>

                    {creator?.status !== 'live' ? (
                        <TouchableOpacity style={s.liveBtn} onPress={goLive} activeOpacity={0.9}>
                            <Text style={s.liveText}>Go live</Text>
                        </TouchableOpacity>
                    ) : null}
                    <Text style={s.note}>Manage your subscription price with the Max team. Payouts are sent monthly.</Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: INK },
    saveBtn: { fontFamily: fonts.sansSemiBold, fontSize: 15.5, color: '#2C6BED' },
    label: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: MUTE, marginTop: 18, marginBottom: 8 },
    input: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.sans, fontSize: 16, color: INK, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
    bio: { minHeight: 90, paddingTop: 13 },
    infoCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginTop: 24, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    infoLabel: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: INK },
    infoValue: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: MUTE, textTransform: 'capitalize' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)' },
    liveBtn: { height: 52, borderRadius: 26, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
    liveText: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: '#FFFFFF' },
    note: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 16, lineHeight: 18, textAlign: 'center' },
});
