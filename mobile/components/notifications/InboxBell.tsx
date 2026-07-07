import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { LiquidGlass } from '../glass/LiquidGlass';
import api, { type InboxMessage } from '../../services/api';

export default function InboxBell() {
    const navigation = useNavigation<any>();
    const [unread, setUnread] = useState(0);
    const [preview, setPreview] = useState<InboxMessage | null>(null);

    const refresh = useCallback(async () => {
        try {
            const { unread: n } = await api.getInboxUnreadCount();
            setUnread(n);
            if (n > 0) {
                const { messages } = await api.getInboxMessages();
                const first = messages.find((m) => !m.read_at);
                if (first) setPreview(first);
            } else {
                setPreview(null);
            }
        } catch { /* best-effort */ }
    }, []);

    useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
    useEffect(() => { void refresh(); }, [refresh]);

    const openInbox = () => {
        setPreview(null);
        navigation.navigate('InAppNotifications');
    };

    return (
        <>
            <TouchableOpacity onPress={openInbox} activeOpacity={0.8} accessibilityLabel="Notifications">
                <LiquidGlass radius={20} intensity={55} noShadow style={s.bellWrap} contentStyle={s.bellInner}>
                    <Ionicons name="notifications-outline" size={20} color="#111" />
                    {unread > 0 ? <View style={s.dot} /> : null}
                </LiquidGlass>
            </TouchableOpacity>

            <Modal visible={preview != null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
                <Pressable style={s.backdrop} onPress={() => setPreview(null)}>
                    <Pressable style={s.popup} onPress={() => {}}>
                        <LiquidGlass radius={24} intensity={70} style={{ width: '100%' }} contentStyle={s.popupInner}>
                            <Text style={s.popupTitle}>{preview?.title}</Text>
                            <Text style={s.popupBody} numberOfLines={4}>{preview?.body}</Text>
                            <TouchableOpacity style={s.popupBtn} onPress={openInbox}>
                                <Text style={s.popupBtnText}>View all</Text>
                            </TouchableOpacity>
                        </LiquidGlass>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    bellWrap: { width: 40, height: 40 },
    bellInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    dot: {
        position: 'absolute', top: 6, right: 6, width: 9, height: 9,
        borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#fff',
    },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    popup: { width: '100%', maxWidth: 360, alignSelf: 'center' },
    popupInner: { padding: 20, gap: 10 },
    popupTitle: { fontFamily: 'Matter-Bold', fontSize: 18, color: '#111' },
    popupBody: { fontFamily: 'Matter-Regular', fontSize: 15, color: '#444', lineHeight: 22 },
    popupBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
    popupBtnText: { fontFamily: 'Matter-SemiBold', fontSize: 14, color: '#fff' },
});
