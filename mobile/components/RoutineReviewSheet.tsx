/**
 * RoutineReviewSheet — the plain-language "here's your routine" review.
 *
 * Shown once after the first schedule for a Maxx exists (the schedule is
 * generated lazily by the coach, so this is the first honest moment to explain
 * it). It collapses the schedule into its distinct recurring PARTS, grouped by
 * time of day, in human terms — then lets the user prune anything that doesn't
 * fit their life. Pruning a part removes it across every day (series delete)
 * and keeps it gone, so the routine bends to the person, not the other way
 * round. Anything more nuanced (move it, swap it) routes to Max.
 *
 * Purely presentational: the parent owns the data + the remove/tweak actions.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { useSwipeDownDismiss } from '../hooks/useSwipeDownDismiss';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../theme/dark';
import type { RoutinePart } from '../utils/scheduleAggregation';

function formatTime12(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || '';
  const [h, m] = time24.split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return time24;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${period}`;
}

/** Avoid "Skinmax · Skinmax cleanse" — drop a leading module-label echo. */
function stripModulePrefix(title: string, moduleLabel: string): string {
  const t = (title || '').trim();
  const m = (moduleLabel || '').trim();
  if (!m || !t) return t;
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}\\s*([·•|\\-–:]\\s*)?`, 'i');
  const stripped = t.replace(re, '').trim();
  return stripped.length > 0 ? stripped : t;
}

type Bucket = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; parts: RoutinePart[] };

function bucketParts(parts: RoutinePart[]): Bucket[] {
  const morning: RoutinePart[] = [];
  const midday: RoutinePart[] = [];
  const evening: RoutinePart[] = [];
  const anytime: RoutinePart[] = [];
  for (const p of parts) {
    const h = p.time && p.time.includes(':') ? parseInt(p.time.split(':')[0], 10) : NaN;
    if (Number.isNaN(h)) anytime.push(p);
    else if (h < 12) morning.push(p);
    else if (h < 17) midday.push(p);
    else evening.push(p);
  }
  const out: Bucket[] = [
    { key: 'morning', label: 'Morning', icon: 'sunny-outline', parts: morning },
    { key: 'midday', label: 'Midday', icon: 'partly-sunny-outline', parts: midday },
    { key: 'evening', label: 'Evening', icon: 'moon-outline', parts: evening },
    { key: 'anytime', label: 'Anytime', icon: 'time-outline', parts: anytime },
  ];
  return out.filter((b) => b.parts.length > 0);
}

/** Soft, honest cadence label from how many of the materialised days a part
 *  shows up on. Stays silent when it can't tell, so we never over-claim. */
function cadenceLabel(dayCount: number, totalDays: number): string {
  if (totalDays <= 1) return '';
  if (dayCount >= Math.ceil(totalDays * 0.6)) return 'most days';
  if (dayCount <= 2) return 'weekly';
  return 'a few days a week';
}

export default function RoutineReviewSheet({
  visible,
  parts,
  totalDays,
  onRemovePart,
  onTweakPart,
  onDone,
}: {
  visible: boolean;
  parts: RoutinePart[];
  totalDays: number;
  onRemovePart: (part: RoutinePart) => void;
  onTweakPart: (part: RoutinePart) => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Parts the user pruned this session — hidden immediately so the list feels
  // responsive while the parent persists the removal.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const visibleParts = useMemo(
    () => parts.filter((p) => !removedKeys.has(p.key)),
    [parts, removedKeys],
  );
  const buckets = useMemo(() => bucketParts(visibleParts), [visibleParts]);
  const removedCount = removedKeys.size;

  const handleRemove = (part: RoutinePart) => {
    setConfirmingKey(null);
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.add(part.key);
      return next;
    });
    onRemovePart(part);
  };

  const { translateY, panHandlers } = useSwipeDownDismiss(onDone);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDone} />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY }] }]}>
          <View {...panHandlers}>
            <TouchableOpacity style={styles.closeX} onPress={onDone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.grabber} />

            <View style={styles.headerBlock}>
              <Text style={styles.title}>Your routine</Text>
              <Text style={styles.subhead}>
                Here's what I built around your days. Skim it. Anything that doesn't fit your
                life, cut it now and I'll work around it.
              </Text>
            </View>
          </View>

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {buckets.map((bucket) => (
              <View key={bucket.key} style={styles.bucket}>
                <View style={styles.bucketHead}>
                  <Ionicons name={bucket.icon} size={14} color={colors.textMuted} />
                  <Text style={styles.bucketLabel}>{bucket.label}</Text>
                </View>
                {bucket.parts.map((part) => {
                  const confirming = confirmingKey === part.key;
                  const cleanTitle = stripModulePrefix(part.title, part.moduleLabel);
                  const cadence = cadenceLabel(part.dayCount, totalDays);
                  return (
                    <View key={part.key} style={styles.partRow}>
                      <View style={[styles.accent, { backgroundColor: part.moduleColor }]} />
                      <View style={styles.partBody}>
                        <Text style={styles.partTitle}>{cleanTitle}</Text>
                        <Text style={styles.partMeta} numberOfLines={1}>
                          {[part.moduleLabel, formatTime12(part.time), cadence]
                            .filter(Boolean)
                            .join('  ·  ')}
                        </Text>
                        {part.description ? (
                          <Text style={styles.partDesc} numberOfLines={2}>
                            {part.description}
                          </Text>
                        ) : null}

                        {confirming ? (
                          <View style={styles.confirmRow}>
                            <Text style={styles.confirmQ}>Cut this from your routine?</Text>
                            <View style={styles.confirmBtns}>
                              <TouchableOpacity
                                onPress={() => handleRemove(part)}
                                style={[styles.confirmBtn, styles.confirmCut]}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.confirmCutText}>Cut it</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setConfirmingKey(null)}
                                style={styles.confirmBtn}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.confirmKeepText}>Keep</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              onPress={() => onTweakPart(part)}
                              style={styles.actionBtn}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            >
                              <Ionicons
                                name="chatbubble-ellipses-outline"
                                size={13}
                                color={colors.textSecondary}
                              />
                              <Text style={styles.actionText}>Change with Max</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setConfirmingKey(part.key)}
                              style={styles.actionBtn}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            >
                              <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
                              <Text style={styles.actionTextMuted}>Cut</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}

            {buckets.length === 0 ? (
              <Text style={styles.allClear}>
                That's your whole routine, trimmed to what you want. Nice.
              </Text>
            ) : null}

            {removedCount > 0 ? (
              <Text style={styles.removedNote}>
                Cut {removedCount} {removedCount === 1 ? 'thing' : 'things'}. Want it back later?
                Just ask Max.
              </Text>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={onDone} activeOpacity={0.9}>
            <Text style={styles.doneText}>This works</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  closeX: {
    position: 'absolute',
    top: 6,
    left: 4,
    zIndex: 3,
    padding: 6,
  },
  headerBlock: { marginBottom: spacing.sm },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: -0.4,
    color: colors.foreground,
  },
  subhead: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 6,
  },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  bucket: { marginTop: spacing.lg },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  bucketLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  accent: { width: 3, alignSelf: 'stretch', borderRadius: 2, opacity: 0.9, marginTop: 2 },
  partBody: { flex: 1, minWidth: 0 },
  partTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.foreground,
    letterSpacing: 0.1,
  },
  partMeta: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  partDesc: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 6,
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textSecondary },
  actionTextMuted: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.textMuted },
  confirmRow: { marginTop: 10 },
  confirmQ: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.foreground },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: 8 },
  confirmBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  confirmCut: { backgroundColor: colors.foreground },
  confirmCutText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.background },
  confirmKeepText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.textSecondary },
  allClear: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  removedNote: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  doneBtn: {
    backgroundColor: colors.foreground,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  doneText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.background,
    letterSpacing: 0.3,
  },
});
