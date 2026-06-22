import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { colors, spacing, borderRadius, typography } from '../../theme/dark';
import { CachedImage } from '../../components/CachedImage';
import { useAuth } from '../../context/AuthContext';
import { canAccessCourseDocs } from '../../utils/maxxLimits';

export default function CourseListScreen() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const isLocked = !canAccessCourseDocs(user);
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadCourses(); }, []);
    const loadCourses = async () => {
        try {
            const result = await api.getCourses();
            setCourses(result.courses || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    // Direct nav — no intermediate alert. Tap → Payment. The lock
    // pill on each card already signals "this is paid"; an extra
    // confirm-tap to reach the upgrade screen was friction.
    const goToUpgrade = () => navigation.navigate('Payment');

    const handlePress = (item: any) => {
        if (isLocked) { goToUpgrade(); return; }
        navigation.navigate('CourseDetail', { courseId: item.id });
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.courseCard} onPress={() => handlePress(item)} activeOpacity={0.85}>
            <View style={styles.thumbWrap}>
                {item.thumbnail_url ? (
                    <CachedImage
                        uri={item.thumbnail_url}
                        style={[styles.thumbnail, isLocked && styles.thumbnailLocked]}
                    />
                ) : (
                    <View style={[styles.thumbnail, styles.thumbnailPlaceholder, isLocked && styles.thumbnailLocked]} />
                )}
                {isLocked ? (
                    <View pointerEvents="none" style={styles.lockOverlay}>
                        <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed" size={11} color={colors.foreground} />
                            <Text style={styles.lockBadgeText}>PREMIUM</Text>
                        </View>
                    </View>
                ) : null}
            </View>
            <View style={styles.cardContent}>
                <View style={styles.badgeContainer}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{(item.category || '').toUpperCase()}</Text>
                    </View>
                    <View style={[styles.badge, styles.badgeOutline]}>
                        <Text style={styles.badgeOutlineText}>{(item.difficulty || '').toUpperCase()}</Text>
                    </View>
                </View>
                <Text style={[styles.title, isLocked && styles.titleLocked]}>{item.title}</Text>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                <View style={styles.footer}>
                    <Text style={styles.duration}>{item.estimated_weeks} weeks</Text>
                    {isLocked ? (
                        <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
                    ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );

    if (loading) return (
        <View style={[styles.container, styles.center]}>
            <ActivityIndicator size="large" color={colors.foreground} />
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={22} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>All Courses</Text>
                <View style={{ width: 40 }} />
            </View>
            {isLocked ? (
                <TouchableOpacity style={styles.premiumStrip} onPress={goToUpgrade} activeOpacity={0.8}>
                    <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                    <Text style={styles.premiumStripText}>
                        Course library is a Chad feature. Tap any course to upgrade.
                    </Text>
                </TouchableOpacity>
            ) : null}
            <FlatList
                data={courses}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <Ionicons name="book-outline" size={40} color={colors.textMuted} />
                        <Text style={styles.emptyText}>No courses yet. Check back soon.</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 64, paddingBottom: spacing.md },
    backButton: { padding: spacing.xs },
    headerTitle: { ...typography.h3 },
    list: { padding: spacing.lg },
    courseCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        marginBottom: spacing.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    thumbWrap: { position: 'relative' },
    thumbnail: { width: '100%', height: 180, resizeMode: 'cover' },
    /** Neutral surface fill when a course has no thumbnail — avoids a 404 / external request. */
    thumbnailPlaceholder: { backgroundColor: colors.surface },
    /** Subtle, not punitive — preserves the design while signalling locked. */
    thumbnailLocked: { opacity: 0.55 },
    lockOverlay: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
    },
    lockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(245,245,243,0.92)',
        borderRadius: borderRadius.full,
        paddingHorizontal: 9,
        paddingVertical: 4,
    },
    lockBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: colors.foreground,
    },
    cardContent: { padding: spacing.md },
    badgeContainer: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, backgroundColor: colors.foreground },
    badgeText: { fontSize: 10, fontWeight: '600', color: colors.buttonText, letterSpacing: 0.5 },
    badgeOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    badgeOutlineText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.5 },
    title: { fontSize: 16, fontWeight: '600', color: colors.foreground, marginBottom: 4 },
    titleLocked: { color: colors.textSecondary },
    description: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    duration: { fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.3 },
    /** Soft top strip — single explanatory line, no big CTA shouting at the user. */
    premiumStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        borderRadius: borderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.card,
    },
    premiumStripText: {
        flex: 1,
        fontSize: 12.5,
        color: colors.textSecondary,
        letterSpacing: 0.1,
    },
    emptyWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xxxl,
        gap: spacing.md,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
    },
});
