/**
 * MyProductsScreen — settings page that surfaces every catalog product
 * relevant to the user's hyperpersonalized schedule.
 *
 * Backend: GET /users/me/products. Server reads onboarding signals
 * (skin concern, hair-loss state, fitmax goal, posture flag, etc.)
 * and runs each into product_catalog.find_products() with the user's
 * fact filters (vegan / fragrance-allergy / etc) applied. Result is
 * the union, deduped by id.
 *
 * UI: pull-to-refresh, grouped by module (Skin / Hair / Fit / etc.),
 * each card shows brand · name · short rationale · price-tier chip.
 * Tapping a card opens the Amazon product page.
 *
 * Refresh: ONLY pull-down. No timed interval, no on-focus auto-refresh
 * spinner. The user explicitly asked for the Instagram-pattern.
 */

import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Linking,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import api from '../../services/api';
import { borderRadius, colors, fonts, spacing, typography } from '../../theme/dark';

type Product = {
    id: string;
    name: string;
    brand: string;
    module: string;
    url: string;
    price_tier: string;
    rationale: string;
    tags: Record<string, boolean | null>;
};

const MODULE_LABEL: Record<string, string> = {
    skinmax: 'Skin',
    hairmax: 'Hair',
    fitmax: 'Fit',
    bonemax: 'Bone',
    heightmax: 'Height',
    general: 'General',
};

const TIER_LABEL: Record<string, string> = {
    budget: 'budget',
    mid: 'mid',
    premium: 'premium',
};

export default function MyProductsScreen() {
    const navigation = useNavigation<any>();
    const qc = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    const productsQuery = useQuery({
        queryKey: ['users', 'me', 'products'],
        queryFn: () => api.getMyProducts(),
        // Pull-to-refresh is the only refresh path. Stale time long
        // enough that mounting from settings doesn't re-fetch silently.
        staleTime: 60 * 60 * 1000,
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await productsQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    }, [productsQuery]);

    // Re-fetch when the user navigates BACK to this screen after editing
    // their lifestyle (concerns may have changed). Silent — no spinner.
    useFocusEffect(
        useCallback(() => {
            qc.invalidateQueries({ queryKey: ['users', 'me', 'products'] });
        }, [qc])
    );

    const openProduct = useCallback((url: string) => {
        Linking.canOpenURL(url).then((ok) => {
            if (ok) Linking.openURL(url);
            else Alert.alert("Can't open link", url);
        });
    }, []);

    const products = productsQuery.data?.products ?? [];

    // Group by module.
    const groups = React.useMemo(() => {
        const out: Record<string, Product[]> = {};
        for (const p of products) {
            const k = p.module || 'general';
            (out[k] ||= []).push(p);
        }
        return Object.entries(out);
    }, [products]);

    const isLoading = productsQuery.isPending && !productsQuery.data;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={22} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>My products</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.foreground}
                    />
                }
            >
                <Text style={styles.lede}>
                    The products your routine actually calls for. Pull down to
                    refresh after you change your plan.
                </Text>

                {isLoading ? (
                    <View style={styles.empty}>
                        <ActivityIndicator color={colors.foreground} />
                    </View>
                ) : products.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>Nothing yet</Text>
                        <Text style={styles.emptyHint}>
                            Once you complete onboarding and start a maxx, products will
                            appear here matched to your concerns.
                        </Text>
                    </View>
                ) : (
                    groups.map(([mod, items]) => (
                        <View key={mod} style={styles.group}>
                            <Text style={styles.groupLabel}>{MODULE_LABEL[mod] || mod.toUpperCase()}</Text>
                            {items.map((p) => (
                                <TouchableOpacity
                                    key={p.id}
                                    style={styles.card}
                                    activeOpacity={0.85}
                                    onPress={() => openProduct(p.url)}
                                >
                                    <View style={styles.cardTop}>
                                        <View style={{ flex: 1, marginRight: 12 }}>
                                            <Text style={styles.brand} numberOfLines={1}>{p.brand || 'Unknown'}</Text>
                                            <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
                                        </View>
                                        <View style={styles.tierPill}>
                                            <Text style={styles.tierText}>{TIER_LABEL[p.price_tier] || p.price_tier}</Text>
                                        </View>
                                    </View>
                                    {p.rationale ? (
                                        <Text style={styles.rationale} numberOfLines={3}>
                                            {p.rationale}
                                        </Text>
                                    ) : null}
                                    <View style={styles.cardFooter}>
                                        {/* Specific item — no marketplace name. Tap tells
                                            you which product you're opening. */}
                                        <Text style={styles.openText} numberOfLines={1}>
                                            Open {p.brand || p.name}
                                        </Text>
                                        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    backBtn: { padding: 4, minWidth: 36 },
    headerTitle: {
        fontFamily: fonts.serif,
        fontSize: 22,
        fontWeight: '400',
        letterSpacing: -0.4,
        color: colors.foreground,
    },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
    lede: {
        fontSize: 13.5,
        color: colors.textMuted,
        lineHeight: 19,
        letterSpacing: 0.05,
        marginBottom: spacing.lg,
    },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xxl,
        gap: 8,
    },
    emptyTitle: {
        fontFamily: fonts.serif,
        fontSize: 20,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -0.3,
    },
    emptyHint: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 19,
        maxWidth: 280,
    },
    group: { marginBottom: spacing.xl },
    groupLabel: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 10,
        color: colors.textMuted,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        marginBottom: spacing.md,
        opacity: 0.7,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: spacing.lg,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    cardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    brand: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textMuted,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 3,
    },
    name: {
        fontFamily: fonts.serif,
        fontSize: 17,
        fontWeight: '400',
        color: colors.foreground,
        letterSpacing: -0.2,
        lineHeight: 23,
    },
    tierPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    tierText: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textMuted,
        letterSpacing: 0.6,
        textTransform: 'lowercase',
    },
    rationale: {
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 19,
        marginTop: 2,
        marginBottom: 10,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    openText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.foreground,
        letterSpacing: 0.2,
    },
});
