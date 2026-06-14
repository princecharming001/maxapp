/**
 * TimePicker — the single, clean way to change a time in the planner.
 *
 * A quiet iOS-style drum: times scroll vertically and snap, the centred row is
 * the selection, neighbours fade and shrink away. For a window we show two
 * drums (From / To) and keep them ordered. Replaces the old drag slider.
 *
 * Pure JS (no native picker module): a snapping ScrollView with an Animated
 * scroll position driving per-row opacity/scale, plus tap-a-row-to-select.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { colors, fonts } from '../../theme/dark';

const ITEM_H = 40;
const VISIBLE = 5; // odd, so one row sits dead-centre
const WHEEL_H = ITEM_H * VISIBLE;
const PAD = (WHEEL_H - ITEM_H) / 2;

type Fmt = (m: number) => string;

function Wheel({
  value,
  onChange,
  min,
  max,
  step,
  format,
  accent,
}: {
  value: number;
  onChange: (m: number) => void;
  min: number;
  max: number;
  step: number;
  format: Fmt;
  accent: string;
}) {
  const items = useMemo(() => {
    const a: number[] = [];
    for (let m = min; m <= max; m += step) a.push(m);
    return a;
  }, [min, max, step]);

  const idxOf = (v: number) =>
    Math.max(0, Math.min(items.length - 1, Math.round((v - min) / step)));

  const scrollY = useRef(new Animated.Value(0)).current;
  const ref = useRef<ScrollView>(null);
  // Last value we settled on, so an external value change (clamp / mode switch)
  // re-centres the drum without fighting a scroll the user is mid-gesture on.
  const settled = useRef(value);

  useEffect(() => {
    const i = idxOf(value);
    // Jump to the seed position once mounted (no animation on first paint).
    const t = setTimeout(() => ref.current?.scrollTo({ y: i * ITEM_H, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value === settled.current) return;
    settled.current = value;
    ref.current?.scrollTo({ y: idxOf(value) * ITEM_H, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    const v = items[i];
    settled.current = v;
    if (v !== value) onChange(v);
  };

  return (
    <View style={styles.wheel}>
      {/* Centre selection band */}
      <View pointerEvents="none" style={styles.band} />
      <Animated.ScrollView
        ref={ref as any}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {items.map((m, i) => {
          const inputRange = [
            (i - 2) * ITEM_H,
            (i - 1) * ITEM_H,
            i * ITEM_H,
            (i + 1) * ITEM_H,
            (i + 2) * ITEM_H,
          ];
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.18, 0.45, 1, 0.45, 0.18],
            extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.78, 0.9, 1, 0.9, 0.78],
            extrapolate: 'clamp',
          });
          const selected = m === value;
          return (
            <TouchableOpacity
              key={m}
              activeOpacity={0.7}
              onPress={() => {
                settled.current = m;
                ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
                if (m !== value) onChange(m);
              }}
            >
              <Animated.View style={[styles.item, { opacity, transform: [{ scale }] }]}>
                <Text style={[styles.itemText, selected && { color: accent }]}>{format(m)}</Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>
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
      <View style={styles.singleWrap}>
        <Wheel
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

  // Window: two drums kept at least `span` apart. Moving one past that gap
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
    <View style={styles.rangeWrap}>
      <View style={styles.col}>
        <Text style={styles.colLabel}>From</Text>
        <Wheel
          value={value[0]}
          onChange={setStart}
          min={min}
          max={max - span}
          step={step}
          format={format}
          accent={accent}
        />
      </View>
      <View style={styles.colDivider} />
      <View style={styles.col}>
        <Text style={styles.colLabel}>To</Text>
        <Wheel
          value={value[1]}
          onChange={setEnd}
          min={min + span}
          max={max}
          step={step}
          format={format}
          accent={accent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { height: WHEEL_H, alignSelf: 'stretch', justifyContent: 'center' },
  band: {
    position: 'absolute',
    top: PAD,
    height: ITEM_H,
    left: 0,
    right: 0,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 19,
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  singleWrap: { marginTop: 4 },
  rangeWrap: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  col: { flex: 1, alignItems: 'center' },
  colDivider: { width: 1 },
  colLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
});
