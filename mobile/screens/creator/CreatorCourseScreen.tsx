/**
 * CreatorCourseScreen — thin shell over CreatorCourseList. Keeps the route +
 * params (deep links still land here) and the back-chrome top bar; the course
 * body (modules → lesson rows, locked → paywall, full-screen Reader) lives in
 * components/creator/CreatorCourseList.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../theme/dark';
import CreatorCourseList, { type Course } from '../../components/creator/CreatorCourseList';

const INK = '#111113';
const MUTE = '#6B6B6B';
const BG = '#F1F1EF';

export default function CreatorCourseScreen() {
    const nav = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const maxxId: string = route.params?.maxxId;

    const [head, setHead] = useState<{ title: string; meta: string }>({ title: 'Course', meta: '' });
    const onLoaded = useCallback((course: Course) => {
        const meta =
            `${course.lesson_count} lesson${course.lesson_count === 1 ? '' : 's'}` +
            (course.free_preview_count > 0 ? ` · ${course.free_preview_count} free` : '');
        setHead({ title: course?.creator?.display_name || 'Course', meta });
    }, []);

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.topBar}>
                <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.back} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={INK} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{head.title}</Text>
                    {head.meta ? <Text style={s.meta}>{head.meta}</Text> : null}
                </View>
            </View>

            <CreatorCourseList maxxId={maxxId} embedded={false} onLoaded={onLoaded} />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    topBar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, gap: 6 },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    title: { fontFamily: fonts.serif, fontSize: 24, color: INK, letterSpacing: -0.3 },
    meta: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 4 },
});
