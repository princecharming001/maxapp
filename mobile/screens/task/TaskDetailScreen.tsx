import React, { useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    useWindowDimensions,
} from 'react-native'
import { Alert } from '../../components/InAppAlert';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTaskDetail, type TaskStep, type TaskProduct } from '../../data/taskStepCatalog';

const INK    = '#000000';
const ON_INK = '#FFFFFF';
const BG     = '#F1F1EF';
const MUTE   = '#9A9A9A';
const HAIR   = 'rgba(0,0,0,0.06)';

type Params = {
    TaskDetail: {
        title: string;
        catalog_id?: string;
        description?: string;
        moduleLabel?: string;
        moduleColor?: string;
        task_id: string;
    };
};

function padNum(n: number) {
    return String(n).padStart(2, '0');
}

function buildFallbackSteps(description?: string): TaskStep[] {
    if (!description) return [{ instruction: 'Complete this task as part of your routine.' }];
    return description
        .split(/\.\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => ({ instruction: s.endsWith('.') ? s : `${s}.` }));
}

export default function TaskDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<Params, 'TaskDetail'>>();
    const { title, catalog_id, description, moduleLabel, moduleColor } = route.params;
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const detail = getTaskDetail(catalog_id);
    const steps: TaskStep[] = detail?.steps ?? buildFallbackSteps(description);
    const products: TaskProduct[] = detail?.products ?? [];

    const [currentIndex, setCurrentIndex] = useState(0);

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
            const first = viewableItems[0];
            if (first && first.index != null) {
                setCurrentIndex(first.index);
            }
        },
        [],
    );

    const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

    const handleWatch = () => {
        Alert.alert('Coming Soon', 'Video tutorials are coming soon!');
    };

    const accentColor = moduleColor ?? INK;

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* ── Top bar ── */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.topIconBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                >
                    <Ionicons name="close" size={22} color={INK} />
                </TouchableOpacity>

                {moduleLabel ? (
                    <Text style={styles.moduleLabel} numberOfLines={1}>
                        {moduleLabel}
                    </Text>
                ) : (
                    <View style={{ flex: 1 }} />
                )}

                <TouchableOpacity
                    onPress={handleWatch}
                    style={styles.watchBtn}
                    activeOpacity={0.7}
                    accessibilityLabel="Watch tutorial"
                    accessibilityRole="button"
                >
                    <Ionicons name="play-circle-outline" size={15} color={INK} />
                    <Text style={styles.watchText}>Watch</Text>
                </TouchableOpacity>
            </View>

            {/* ── Step pager ── */}
            <View style={styles.pagerContainer}>
                <FlatList
                    data={steps}
                    keyExtractor={(_, i) => String(i)}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig.current}
                    decelerationRate="fast"
                    renderItem={({ item, index }) => (
                        <ScrollView
                            style={{ width }}
                            contentContainerStyle={styles.stepPage}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={false}
                        >
                            {/* Module color accent stripe */}
                            <View style={[styles.accentStripe, { backgroundColor: accentColor }]} />

                            <Text style={styles.stepCounter}>
                                STEP {padNum(index + 1)} / {padNum(steps.length)}
                            </Text>

                            <Text style={styles.stepInstruction}>{item.instruction}</Text>

                            {item.tip ? (
                                <View style={styles.tipCard}>
                                    <Text style={styles.tipLabel}>PRO TIP</Text>
                                    <Text style={styles.tipText}>{item.tip}</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                    )}
                />

                {/* Right-side progress dots */}
                {steps.length > 1 ? (
                    <View style={styles.dotsContainer} pointerEvents="none">
                        {steps.map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.dot,
                                    i === currentIndex ? styles.dotActive : styles.dotInactive,
                                ]}
                            />
                        ))}
                    </View>
                ) : null}

                {/* Swipe hint — only on first step if more steps exist */}
                {steps.length > 1 && currentIndex === 0 ? (
                    <View style={styles.swipeHint} pointerEvents="none">
                        <Ionicons name="chevron-forward" size={12} color={MUTE} />
                        <Text style={styles.swipeHintText}>swipe</Text>
                    </View>
                ) : null}
            </View>

            {/* ── Products section ── */}
            {products.length > 0 ? (
                <View style={[styles.productsSection, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.productsDivider} />
                    <Text style={styles.productsLabel}>You'll need</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.productsScroll}
                    >
                        {products.map((p, i) => (
                            <TouchableOpacity
                                key={i}
                                style={styles.productChip}
                                onPress={() => Linking.openURL(p.url)}
                                activeOpacity={0.7}
                                accessibilityLabel={`Open ${p.label} on Amazon`}
                                accessibilityRole="link"
                            >
                                <Text style={styles.productChipText} numberOfLines={1}>
                                    {p.label}
                                </Text>
                                <Ionicons name="open-outline" size={11} color={MUTE} style={styles.productChipArrow} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            ) : (
                <View style={{ paddingBottom: insets.bottom + 20 }} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
    },

    // Top bar
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        height: 52,
    },
    topIconBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
    },
    moduleLabel: {
        flex: 1,
        fontFamily: 'Matter-SemiBold',
        fontSize: 12,
        letterSpacing: 0.8,
        color: MUTE,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    watchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.1)',
        backgroundColor: ON_INK,
    },
    watchText: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 13,
        color: INK,
    },

    // Pager
    pagerContainer: {
        flex: 1,
        position: 'relative',
    },
    stepPage: {
        paddingHorizontal: 28,
        paddingTop: 12,
        paddingBottom: 40,
        paddingRight: 52,
    },
    accentStripe: {
        width: 28,
        height: 3,
        borderRadius: 2,
        marginBottom: 28,
    },
    stepCounter: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 11,
        letterSpacing: 1.4,
        color: MUTE,
        marginBottom: 18,
    },
    stepInstruction: {
        fontFamily: 'Matter-Bold',
        fontSize: 27,
        lineHeight: 35,
        letterSpacing: -0.5,
        color: INK,
        marginBottom: 28,
    },
    tipCard: {
        backgroundColor: HAIR,
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 3,
        borderLeftColor: INK,
    },
    tipLabel: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 10,
        letterSpacing: 1.2,
        color: MUTE,
        marginBottom: 6,
    },
    tipText: {
        fontFamily: 'Matter-Regular',
        fontSize: 14,
        lineHeight: 21,
        color: INK,
    },

    // Progress dots
    dotsContainer: {
        position: 'absolute',
        right: 20,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotActive: {
        backgroundColor: INK,
    },
    dotInactive: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: MUTE,
    },

    // Swipe hint
    swipeHint: {
        position: 'absolute',
        bottom: 16,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    swipeHintText: {
        fontFamily: 'Matter-Regular',
        fontSize: 11,
        color: MUTE,
        letterSpacing: 0.4,
    },

    // Products
    productsSection: {
        paddingTop: 0,
    },
    productsDivider: {
        height: 1,
        backgroundColor: HAIR,
        marginHorizontal: 20,
        marginBottom: 16,
    },
    productsLabel: {
        fontFamily: 'Matter-SemiBold',
        fontSize: 11,
        letterSpacing: 0.9,
        color: MUTE,
        textTransform: 'uppercase',
        marginHorizontal: 20,
        marginBottom: 10,
    },
    productsScroll: {
        paddingHorizontal: 20,
        paddingBottom: 2,
    },
    productChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.1)',
        marginRight: 8,
        backgroundColor: ON_INK,
        maxWidth: 200,
    },
    productChipText: {
        fontFamily: 'Matter-Regular',
        fontSize: 13,
        color: INK,
        flexShrink: 1,
    },
    productChipArrow: {
        marginLeft: 5,
        flexShrink: 0,
    },
});
