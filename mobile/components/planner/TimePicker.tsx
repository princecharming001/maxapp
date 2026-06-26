/**
 * TimePicker — the planner's one way to change a time.
 *
 * A horizontal RAIL (not the usual iOS vertical drum): times slide left/right and
 * snap, the centred one is the selection — shown large in the Fraunces serif so it
 * reads as a deliberate, editorial control rather than a stock picker. A window
 * stacks two rails (From / To) and keeps them ordered.
 *
 * Pure JS (no native module): a snapping horizontal ScrollView whose offset drives
 * per-item opacity/scale, plus tap-an-item-to-centre.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing } from '../../theme/dark';

const ITEM_W = 112; // width of one time slot (fits "12:45 AM" on one line)
const RAIL_H = 64;
const SHEET_BG = '#FFFFFF';   // the editor sheet surface (rail fades into it)
const CAP_W = ITEM_W - 8;     // centered selection capsule width

type Fmt = (m: number) => string;

function Rail({
  value,
  onChange,
  min,
  max,
  step,
  format,
  accent,
  label,
}: {
  value: number;
  onChange: (m: number) => void;
  min: number;
  max: number;
  step: number;
  format: Fmt;
  accent: string;
  label?: string;
}) {
  const { width: winW } = useWindowDimensions();
  // The rail spans the sheet's content width (sheet has spacing.lg padding/side).
  const railW = Math.max(220, winW - spacing.lg * 2);
  const PAD = (railW - ITEM_W) / 2;

  const items = useMemo(() => {
    const a: number[] = [];
    for (let m = min; m <= max; m += step) a.push(m);
    return a;
  }, [min, max, step]);

  const idxOf = (v: number) =>
    Math.max(0, Math.min(items.length - 1, Math.round((v - min) / step)));

  const scrollX = useRef(new Animated.Value(0)).current;
  const ref = useRef<ScrollView>(null);
  // Last settled value, so an external change (clamp / mode switch) re-centres
  // the rail without fighting a gesture the user is mid-scroll on.
  const settled = useRef(value);

  useEffect(() => {
    const i = idxOf(value);
    const t = setTimeout(() => ref.current?.scrollTo({ x: i * ITEM_W, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railW]);

  useEffect(() => {
    if (value === settled.current) return;
    settled.current = value;
    ref.current?.scrollTo({ x: idxOf(value) * ITEM_W, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(x / ITEM_W)));
    const v = items[i];
    settled.current = v;
    if (v !== value) {
      Haptics.selectionAsync().catch(() => {});
      onChange(v);
    }
  };

  return (
    <View style={styles.railBlock}>
      {label ? <Text style={styles.railLabel}>{label}</Text> : null}
      <View style={[styles.rail, { width: railW }]}>
        {/* Centred selection capsule — a soft focus pane the chosen time sits in. */}
        <View pointerEvents="none" style={styles.capsule} />
        <Animated.ScrollView
          ref={ref as any}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_W}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={settle}
          contentContainerStyle={{ paddingHorizontal: PAD }}
        >
          {items.map((m, i) => {
            const inputRange = [
              (i - 2) * ITEM_W,
              (i - 1) * ITEM_W,
              i * ITEM_W,
              (i + 1) * ITEM_W,
              (i + 2) * ITEM_W,
            ];
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.12, 0.45, 1, 0.45, 0.12],
              extrapolate: 'clamp',
            });
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.74, 0.86, 1, 0.86, 0.74],
              extrapolate: 'clamp',
            });
            const selected = m === value;
            return (
              <TouchableOpacity
                key={m}
                activeOpacity={0.7}
                onPress={() => {
                  settled.current = m;
                  ref.current?.scrollTo({ x: i * ITEM_W, animated: true });
                  if (m !== value) onChange(m);
                }}
              >
                <Animated.View style={[styles.item, { width: ITEM_W, opacity, transform: [{ scale }] }]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.itemText, selected && { color: colors.foreground }]}
                  >
                    {format(m)}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </Animated.ScrollView>
        {/* Edge fades — the side times dissolve into the sheet (editorial mask). */}
        <LinearGradient
          pointerEvents="none"
          colors={[SHEET_BG, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, { left: 0, width: PAD }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', SHEET_BG]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, { right: 0, width: PAD }]}
        />
      </View>
    </View>
  );
}

export default function TimePicker({
  value,
  onChange,
  min,
  max,
  step = 15,
  format,
  accent = colors.foreground,
  single,
  minSpan,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
  min: number;
  max: number;
  step?: number;
  format: Fmt;
  accent?: string;
  single?: boolean;
  minSpan?: number;
}) {
  const span = minSpan ?? step;

  if (single) {
    return (
      <View style={styles.wrap}>
        <Rail
          value={value[0]}
          onChange={(m) => onChange([m, m])}
          min={min}
          max={max}
          step={step}
          format={format}
          accent={accent}
        />
      </View>
    );
  }

  // Window: two rails kept at least `span` apart. Moving one past that gap
  // nudges the other along.
  const setStart = (m: number) => {
    const end = m + span > value[1] ? Math.min(max, m + span) : value[1];
    onChange([m, end]);
  };
  const setEnd = (m: number) => {
    const start = m - span < value[0] ? Math.max(min, m - span) : value[0];
    onChange([start, m]);
  };

  return (
    <View style={styles.wrap}>
      <Rail
        label="From"
        value={value[0]}
        onChange={setStart}
        min={min}
        max={max - span}
        step={step}
        format={format}
        accent={accent}
      />
      <Rail
        label="To"
        value={value[1]}
        onChange={setEnd}
        min={min + span}
        max={max}
        step={step}
        format={format}
        accent={accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  railBlock: { marginVertical: 6, alignItems: 'center' },
  railLabel: {
    alignSelf: 'flex-start',
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  rail: { height: RAIL_H, justifyContent: 'center', overflow: 'hidden' },
  // Soft centered focus pane the selected time sits in — warm cream wash + hairline.
  capsule: {
    position: 'absolute',
    alignSelf: 'center',
    width: CAP_W,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F4F2ED',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  // Left/right dissolve so the rail melts into the sheet at the edges.
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  item: { height: RAIL_H, alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.foreground,
    letterSpacing: -0.4,
  },
});
