/**
 * CreatorCourseList — the subscriber-facing course body (module/lesson list +
 * the full-screen Reader modal over the unlocked flat list). Extracted from
 * CreatorCourseScreen so the same list renders standalone (CreatorCourseScreen
 * keeps its route + back chrome) AND embedded inside CreatorMaxxHomeScreen's
 * Course tab. Locked rows deep-link to CreatorPaywall in both modes.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fonts } from '../../theme/dark';
import { hexA } from '../../utils/scheduleAggregation';
import { renderRichText } from '../../utils/chatMarkdown';
import CreatorVideo from './CreatorVideo';

const INK = '#111113';
const MUTE = '#6B6B6B';

export type Lesson = {
    id: string;
    module_number: number;
    sort: number;
    title: string;
    subtitle?: string | null;
    icon?: string | null;
    duration_minutes?: number | null;
    is_free_preview?: boolean;
    has_video?: boolean;
    locked?: boolean;
    /** Redacted ('' / null) by the server when locked. */
    body_md?: string;
    video_url?: string | null;
    poster_url?: string | null;
};
export type CourseModule = { module_number: number; title: string; lessons: Lesson[] };
export type Course = {
    creator: any;
    modules: CourseModule[];
    course_version: number;
    has_access: boolean;
    lesson_count: number;
    free_preview_count: number;
};

export default function CreatorCourseList({
    maxxId,
    embedded = false,
    onLoaded,
}: {
    maxxId: string;
    embedded?: boolean;
    /** Lets a standalone shell (CreatorCourseScreen) title its own top bar. */
    onLoaded?: (course: Course) => void;
}) {
    const nav = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [course, setCourse] = useState<Course | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Index into the flat UNLOCKED list; null = reader closed.
    const [readerIndex, setReaderIndex] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            const c = await api.getCreatorCourse(maxxId);
            setCourse(c);
            onLoaded?.(c);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Could not load the course.');
        } finally {
            setLoading(false);
        }
    }, [maxxId, onLoaded]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const accent = course?.creator?.accent_color || '#BC7A3C';

    // The reader pages across readable lessons only, in course order.
    const unlocked = useMemo<Lesson[]>(
        () => (course?.modules || []).flatMap((m) => m.lessons.filter((l) => !l.locked)),
        [course],
    );

    const openLesson = (lesson: Lesson) => {
        if (lesson.locked) {
            nav.navigate('CreatorPaywall', { maxxId });
            return;
        }
        const idx = unlocked.findIndex((l) => l.id === lesson.id);
        if (idx >= 0) setReaderIndex(idx);
    };

    return (
        <View style={{ flex: 1 }}>
            {loading ? (
                <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
            ) : error ? (
                <View style={s.errorWrap}>
                    <Text style={s.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={s.retryBtn}
                        onPress={() => { setLoading(true); void load(); }}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Retry"
                    >
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : !course || course.lesson_count === 0 ? (
                <Text style={s.empty}>No published lessons yet.</Text>
            ) : (
                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingTop: embedded ? 2 : 0,
                        paddingBottom: insets.bottom + 30,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {course.modules.map((m) => (
                        <View key={m.module_number} style={s.module}>
                            <Text style={s.kicker}>MODULE {m.module_number}</Text>
                            {m.title ? <Text style={s.moduleTitle}>{m.title}</Text> : null}
                            <View style={{ gap: 10, marginTop: 12 }}>
                                {m.lessons.map((l) => (
                                    <LessonRow key={l.id} lesson={l} accent={accent} onPress={() => openLesson(l)} />
                                ))}
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}

            <Reader
                lessons={unlocked}
                index={readerIndex}
                accent={accent}
                onClose={() => setReaderIndex(null)}
                onIndexChange={setReaderIndex}
            />
        </View>
    );
}

/* ── Lesson row ───────────────────────────────────────────────────────── */

function LessonRow({ lesson, accent, onPress }: { lesson: Lesson; accent: string; onPress: () => void }) {
    return (
        <TouchableOpacity
            style={s.row}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={lesson.locked ? `${lesson.title}, locked` : lesson.title}
        >
            <View style={[s.rowDisc, { backgroundColor: hexA(accent, 0.14) }]}>
                <Ionicons name={(lesson.icon || 'document-text-outline') as any} size={17} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
                <View style={s.rowTitleLine}>
                    <Text style={s.rowTitle} numberOfLines={1}>{lesson.title}</Text>
                    {lesson.is_free_preview ? (
                        <View style={s.freeChip}><Text style={s.freeChipText}>FREE</Text></View>
                    ) : null}
                </View>
                {lesson.subtitle ? <Text style={s.rowSub} numberOfLines={1}>{lesson.subtitle}</Text> : null}
            </View>
            {lesson.locked ? (
                <Ionicons name="lock-closed" size={16} color={MUTE} />
            ) : lesson.duration_minutes ? (
                <Text style={s.rowDuration}>{lesson.duration_minutes} min</Text>
            ) : lesson.has_video ? (
                <Ionicons name="play-circle-outline" size={18} color={accent} />
            ) : (
                <Ionicons name="chevron-forward" size={16} color={MUTE} />
            )}
        </TouchableOpacity>
    );
}

/* ── Reader — full-screen lesson view over the unlocked flat list ─────── */

function Reader({ lessons, index, accent, onClose, onIndexChange }: {
    lessons: Lesson[];
    index: number | null;
    accent: string;
    onClose: () => void;
    onIndexChange: (i: number) => void;
}) {
    const insets = useSafeAreaInsets();
    const lesson = index != null ? lessons[index] : null;
    const atStart = index == null || index <= 0;
    const atEnd = index == null || index >= lessons.length - 1;
    const video = lesson?.video_url ? api.resolveAttachmentUrl(lesson.video_url) : undefined;
    const poster = lesson?.poster_url ? api.resolveAttachmentUrl(lesson.poster_url) : undefined;

    return (
        <Modal visible={index != null} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={[r.root, { paddingTop: insets.top }]}>
                <View style={r.topBar}>
                    <TouchableOpacity onPress={onClose} hitSlop={12} style={r.closeBtn} accessibilityLabel="Close reader">
                        <Ionicons name="close" size={22} color={INK} />
                    </TouchableOpacity>
                </View>

                {lesson ? (
                    // key resets scroll to the top when paging between lessons.
                    <ScrollView key={lesson.id} contentContainerStyle={r.scroll} showsVerticalScrollIndicator={false}>
                        <Text style={[r.eyebrow, { color: accent }]}>
                            MODULE {lesson.module_number} · LESSON {(index ?? 0) + 1}
                        </Text>
                        <Text style={r.title}>{lesson.title}</Text>
                        {lesson.subtitle ? <Text style={r.subtitle}>{lesson.subtitle}</Text> : null}
                        <View style={[r.rule, { backgroundColor: accent }]} />
                        {video ? (
                            <View style={{ marginBottom: 22 }}>
                                <CreatorVideo uri={video} poster={poster ?? null} height={300} rounded={14} />
                            </View>
                        ) : null}
                        {lesson.body_md
                            ? renderRichText(lesson.body_md, {
                                baseStyle: { fontFamily: fonts.sans, fontSize: 15.5, lineHeight: 24, color: INK },
                                onLinkPress: (url: string) => { void Linking.openURL(url); },
                            })
                            : null}
                    </ScrollView>
                ) : null}

                <View style={[r.bottomBar, { paddingBottom: Math.max(insets.bottom + 6, 14) }]}>
                    <TouchableOpacity
                        onPress={() => { if (!atStart) onIndexChange((index ?? 0) - 1); }}
                        disabled={atStart}
                        style={r.arrowBtn}
                        hitSlop={10}
                        accessibilityLabel="Previous lesson"
                    >
                        <Ionicons name="arrow-back" size={18} color={atStart ? 'rgba(0,0,0,0.25)' : INK} />
                    </TouchableOpacity>
                    <Text style={r.counter}>
                        <Text style={r.counterBold}>{(index ?? 0) + 1}</Text>
                        <Text style={r.counterSlash}> / </Text>
                        {lessons.length}
                    </Text>
                    <TouchableOpacity
                        onPress={() => { if (!atEnd) onIndexChange((index ?? 0) + 1); }}
                        disabled={atEnd}
                        style={r.arrowBtn}
                        hitSlop={10}
                        accessibilityLabel="Next lesson"
                    >
                        <Ionicons name="arrow-forward" size={18} color={atEnd ? 'rgba(0,0,0,0.25)' : accent} />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
    errorWrap: { alignItems: 'center', marginTop: 48, paddingHorizontal: 32 },
    errorText: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', lineHeight: 20 },
    retryBtn: {
        marginTop: 16, paddingHorizontal: 22, height: 42, borderRadius: 999,
        backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    retryText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: INK },
    empty: { fontFamily: fonts.sans, fontSize: 14, color: MUTE, textAlign: 'center', marginTop: 48 },

    module: { marginTop: 18 },
    kicker: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.2, color: MUTE },
    moduleTitle: { fontFamily: fonts.serif, fontSize: 20, color: INK, marginTop: 6, letterSpacing: -0.3 },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFFFFF', borderRadius: 14, borderCurve: 'continuous', padding: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.07)',
    },
    rowDisc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { fontFamily: fonts.sansMedium, fontSize: 15, color: INK, flexShrink: 1 },
    rowSub: { fontFamily: fonts.sans, fontSize: 12.5, color: MUTE, marginTop: 2 },
    rowDuration: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: MUTE },
    freeChip: { backgroundColor: hexA('#B8860B', 0.14), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
    freeChipText: { fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: '#8A6D2E', letterSpacing: 0.4 },
});

const r = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 4 },
    closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    scroll: { paddingHorizontal: 24, paddingBottom: 28 },
    eyebrow: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.6, marginBottom: 14 },
    title: { fontFamily: fonts.serif, fontSize: 30, color: INK, lineHeight: 36, letterSpacing: -0.6 },
    subtitle: { fontFamily: fonts.sans, fontSize: 15.5, lineHeight: 23, color: MUTE, marginTop: 8 },
    rule: { width: 28, height: 2, borderRadius: 1, marginTop: 16, marginBottom: 22 },
    bottomBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 22, paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)',
    },
    arrowBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    counter: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 1.4, color: MUTE },
    counterBold: { fontFamily: fonts.sansSemiBold, color: INK },
    counterSlash: { color: 'rgba(0,0,0,0.3)' },
});
