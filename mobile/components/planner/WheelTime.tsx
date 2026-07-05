/**
 * WheelTime — the planner's ONE way to pick a time, lifted from the onboarding
 * day-shape flow so the planner sheets read as the same app that first set the
 * schedule (drum wheel + white cards, not a bespoke horizontal rail).
 *
 * Two pieces:
 *   • <WheelTimeRow> — a tappable notification-style row (label + big value +
 *     chevron) that lives inside a white card.
 *   • <WheelTimeOverlay> — the drum-wheel sheet itself, rendered as an
 *     ABSOLUTE-FILL OVERLAY (NOT a <Modal>). The planner editor sheets are
 *     already <Modal>s; stacking a second Modal is the iOS two-modal deadlock
 *     (taps freeze app-wide → restart). Keeping the wheel in the same modal
 *     tree sidesteps it entirely.
 *
 * Palette + metrics mirror OnboardingV2Screen's Stoic wheel one-to-one.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../theme/dark';

// ── Onboarding-matched palette ──────────────────────────────────────────────
export const WT = {
  INK: '#000000',
  ON_INK: '#FFFFFF',
  BG: '#F1F1EF',
  CARD: '#FFFFFF',
  SUB: '#6B6B6B',
  MUTE: '#9A9A9A',
  HAIR: 'rgba(0,0,0,0.06)',
  WASH: 'rgba(0,0,0,0.05)',
} as const;

export const CARD_SOFT = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const ITEM_H = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

function decompose(min: number) {
  const h24 = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  const p = h24 >= 12 ? 1 : 0;
  const h12 = h24 % 12 || 12;
  return { h: h12 - 1, m, p };
}
function compose(hIdx: number, m: number, p: number) {
  const h12 = hIdx + 1;
  const base = h12 % 12;
  const h24 = p === 1 ? base + 12 : base;
  return ((h24 * 60) + m) % 1440;
}

// A single snapping column — uncontrolled after its initial scroll; reports the
// centred index up via onChange (fires on scroll, so it works on web too).
function Wheel({
  values,
  initialIndex,
  onChange,
  width = 62,
  loop = false,
}: {
  values: string[];
  initialIndex: number;
  onChange: (i: number) => void;
  width?: number;
  // A looping column repeats its values so an edge value (the 12 o'clock hour)
  // keeps neighbours in BOTH directions — otherwise the hour wheel dead-ends at
  // 12 and later times feel unreachable. Enabled for the hour column.
  loop?: boolean;
}) {
  const ref = React.useRef<ScrollView>(null);
  const inited = React.useRef(false);
  const N = values.length;
  const REPEATS = loop ? 5 : 1;
  const offset = loop ? N * Math.floor(REPEATS / 2) : 0;
  const display = loop
    ? Array.from({ length: N * REPEATS }, (_, i) => values[i % N])
    : values;
  const startIndex = offset + initialIndex;
  const [active, setActive] = useState(startIndex);
  const lastReal = React.useRef(initialIndex);

  const settle = (y: number) => {
    const raw = Math.max(0, Math.min(display.length - 1, Math.round(y / ITEM_H)));
    if (raw !== active) setActive(raw);
    const real = ((raw % N) + N) % N;
    if (real !== lastReal.current) { lastReal.current = real; onChange(real); }
  };

  return (
    <View style={{ width, height: ITEM_H * VISIBLE }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onLayout={() => {
          if (!inited.current) {
            inited.current = true;
            ref.current?.scrollTo({ y: startIndex * ITEM_H, animated: false });
          }
        }}
        onScroll={(e) => settle(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {display.map((v, i) => (
          <View key={i} style={styles.wheelItem}>
            <Text style={[styles.wheelText, i === active && styles.wheelTextActive]}>{v}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** The drum-wheel picker as an in-sheet overlay (never its own Modal). */
export function WheelTimeOverlay({
  title,
  value,
  onClose,
  onConfirm,
}: {
  title: string;
  value: number;
  onClose: () => void;
  onConfirm: (v: number) => void;
}) {
  const init = decompose(value);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [p, setP] = useState(init.p);

  // A plain View sheet (NOT a TouchableOpacity) — a touchable ancestor steals
  // the pan gesture from the nested wheel ScrollViews on iOS.
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.overlayBackdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.overlaySheet}>
        <Text style={styles.overlayTitle}>{title}</Text>
        <View style={styles.wheelRow}>
          <View style={styles.wheelBand} pointerEvents="none" />
          <Wheel values={HOURS} initialIndex={init.h} onChange={setH} loop />
          <Wheel values={MINUTES} initialIndex={init.m} onChange={setM} />
          <Wheel values={PERIODS} initialIndex={init.p} onChange={setP} width={56} />
        </View>
        <TouchableOpacity
          style={styles.overlayDone}
          activeOpacity={0.9}
          onPress={() => onConfirm(compose(h, m, p))}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.overlayDoneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Notification-style row: small label (+ optional caption) left, big time +
 *  chevron right. Sits inside a white card; caller draws hairline dividers. */
export function WheelTimeRow({
  label,
  caption,
  display,
  onPress,
  dim,
}: {
  label: string;
  caption?: string;
  display: string;
  onPress: () => void;
  dim?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${display}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      <Text style={[styles.rowValue, dim && styles.rowValueDim]}>{display}</Text>
      <Ionicons name="chevron-forward" size={18} color={WT.MUTE} style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: WT.SUB },
  rowCaption: { fontFamily: fonts.sans, fontSize: 11.5, color: WT.MUTE, marginTop: 1 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 19, color: WT.INK, letterSpacing: -0.3 },
  rowValueDim: { color: WT.MUTE, fontFamily: fonts.sansMedium },

  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  overlaySheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: WT.BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderCurve: 'continuous',
    paddingTop: 22, paddingBottom: 34, paddingHorizontal: 24,
    alignItems: 'center',
  },
  overlayTitle: { fontFamily: fonts.sansSemiBold, fontSize: 17, color: WT.INK, marginBottom: 8 },
  wheelRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_H * VISIBLE, position: 'relative' },
  wheelBand: { position: 'absolute', left: 12, right: 12, top: ITEM_H * 2, height: ITEM_H, borderRadius: 12, backgroundColor: WT.WASH },
  wheelItem: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontFamily: fonts.sansMedium, fontSize: 21, color: WT.MUTE },
  wheelTextActive: { fontFamily: fonts.sansSemiBold, color: WT.INK },
  overlayDone: {
    marginTop: 18, height: 52, minWidth: 200, paddingHorizontal: 48,
    borderRadius: 999, borderCurve: 'continuous', backgroundColor: WT.INK,
    alignItems: 'center', justifyContent: 'center',
    ...CARD_SOFT,
  },
  overlayDoneText: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: WT.ON_INK, letterSpacing: 0.2 },
});
