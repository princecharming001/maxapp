/**
 * CreatorFeedScreen — thin shell over CreatorFeedList. Keeps the route +
 * params (deep links still land here) and the back-chrome top bar; the feed
 * body (posts, likes, comments, locked-post handling, identity header +
 * subscribe CTA) lives in components/creator/CreatorFeedList.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../theme/dark';
import CreatorFeedList from '../../components/creator/CreatorFeedList';

const INK = '#111113';
const BG = '#F1F1EF';

export default function CreatorFeedScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const maxxId: string = route.params?.maxxId;

    const [title, setTitle] = useState<string>('Updates');
    const onCreatorLoaded = useCallback((creator: any) => {
        if (creator?.display_name) setTitle(creator.display_name);
    }, []);

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <Text style={s.topTitle} numberOfLines={1}>{title}</Text>
                <View style={{ width: 32 }} />
            </View>

            <CreatorFeedList maxxId={maxxId} embedded={false} onCreatorLoaded={onCreatorLoaded} />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.sansSemiBold, fontSize: 16, color: INK },
});
