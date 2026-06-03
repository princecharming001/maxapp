/**
 * TimeRangeSlider — a tactile, dependency-free dual/single-thumb slider.
 *
 * Domain-agnostic: it operates purely on minute NUMBERS over [min, max]. The
 * caller converts clock strings ↔ minutes (the sleep slider works in
 * evening-normalised minutes so a 1 AM bedtime sits to the right of 11 PM).
 *
 * - `single` collapses to one thumb (an exact time); onChange emits [v, v].
 * - Otherwise two thumbs define a [start, end] range the user "falls between".
 * - Values snap to `step` (15 min) with a light haptic tick on each change.
 *
 * Built on PanResponder + plain Views (no reanimated / gesture-handler / svg)
 * so it drops into the existing tab stack with zero integration risk.
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '../../theme/dark';

const THUMB = 26;
const TRACK_H = 6;
const ROW_H = 46;

export type TimeRangeSliderProps = {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  onChangeEnd?: (v: [number, number]) => void;
  format: (m: number) => string;
  step?: number;
  single?: boolean;
  accent?: string;
  /** Tick spacing in minutes for the faint background grid. 0 hides it. */
  ticksEvery?: number;
};

export default function TimeRangeSlider({
  min,
  max,
  value,
  onChange,
  onChangeEnd,
  format,
  step = 15,
  single = false,
  accent = colors.foreground,
  ticksEvery = 60,
}: TimeRangeSliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Mutable mirror of props the (one-time) PanResponder closure must read live,
  // so toggling `single` or swapping the `onChange` identity never goes stale.
  const cfg = useRef({ min, max, step, single, onChange, onChangeEnd });
  cfg.current = { min, max, step, single, onChange, onChangeEnd };

  const active = useRef<0 | 1>(0);
  const grabCx = useRef(0);
  const lastSnap = useRef<number | null>(null);

  const span = Math.max(1, max - min);
  const usable = Math.max(1, width - THUMB);

  // value → thumb-centre x (px from the row's left edge).
  const centre = (v: number) => THUMB / 2 + ((v - min) / span) * usable;

  const applyCx = (cx: number) => {
    const c = cfg.current;
    const w = widthRef.current;
    const u = Math.max(1, w - THUMB);
    const sp = Math.max(1, c.max - c.min);
    let v = c.min + ((cx - THUMB / 2) / u) * sp;
    v = Math.max(c.min, Math.min(c.max, Math.round(v / c.step) * c.step));

    const cur = valueRef.current;
    let next: [number, number];
    if (c.single) {
      next = [v, v];
    } else if (active.current === 0) {
      next = [Math.min(v, cur[1]), cur[1]];
    } else {
      next = [cur[0], Math.max(v, cur[0])];
    }

    if (next[0] !== cur[0] || next[1] !== cur[1]) {
      if (lastSnap.current !== v) {
        lastSnap.current = v;
        Haptics.selectionAsync().catch(() => {});
      }
      valueRef.current = next;
      c.onChange(next);
    }
  };

  const pan = useRef(
    PanResponder.create({
      // Capture on start/move so a horizontal thumb drag reliably wins over a
      // parent vertical ScrollView (the editor sheet scrolls).
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const c = cfg.current;
        const w = widthRef.current;
        const u = Math.max(1, w - THUMB);
        const sp = Math.max(1, c.max - c.min);
        const locX = evt.nativeEvent.locationX;
        const v = valueRef.current;
        if (c.single) {
          active.current = 0;
        } else {
          const cx0 = THUMB / 2 + ((v[0] - c.min) / sp) * u;
          const cx1 = THUMB / 2 + ((v[1] - c.min) / sp) * u;
          // Tie-break toward the thumb the tap is heading past, so a tap on the
          // overlap point still lets you drag either direction sensibly.
          active.current =
            Math.abs(locX - cx0) < Math.abs(locX - cx1)
              ? 0
              : Math.abs(locX - cx0) > Math.abs(locX - cx1)
                ? 1
                : locX < cx0
                  ? 0
                  : 1;
        }
        lastSnap.current = null;
        grabCx.current = locX; // jump-to-touch: thumb snaps under the finger
        applyCx(locX);
      },
      onPanResponderMove: (_evt, g) => {
        applyCx(grabCx.current + g.dx);
      },
      onPanResponderRelease: () => {
        lastSnap.current = null;
        cfg.current.onChangeEnd?.(valueRef.current);
      },
      onPanResponderTerminate: () => {
        lastSnap.current = null;
        cfg.current.onChangeEnd?.(valueRef.current);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const cxA = centre(value[0]);
  const cxB = centre(value[1]);

  // Faint hour grid for spatial context (Google-Calendar-ish), drawn behind.
  const ticks: number[] = [];
  if (ticksEvery > 0 && width > 0) {
    const first = Math.ceil(min / ticksEvery) * ticksEvery;
    for (let t = first; t <= max; t += ticksEvery) ticks.push(t);
  }

  // Value pills above the thumbs; merge into one when the thumbs are close so
  // labels never collide.
  const merged = !single && cxB - cxA < 96;
  const PILL_W = 78;
  const MERGED_W = 132;

  const clampLeft = (left: number, w: number) =>
    Math.max(0, Math.min(width - w, left));

  // Text form of the current selection for screen readers.
  const a11yValueText = single
    ? format(value[0])
    : `${format(value[0])} to ${format(value[1])}`;
  const a11yLabel = single ? 'Time' : 'Time range';

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        {width > 0 &&
          (single ? (
            <View style={[styles.pill, { width: PILL_W, left: clampLeft(cxA - PILL_W / 2, PILL_W) }]}>
              <Text style={styles.pillText}>{format(value[0])}</Text>
            </View>
          ) : merged ? (
            <View
              style={[
                styles.pill,
                { width: MERGED_W, left: clampLeft((cxA + cxB) / 2 - MERGED_W / 2, MERGED_W) },
              ]}
            >
              <Text style={styles.pillText}>
                {format(value[0])}
                <Text style={styles.pillDash}> to </Text>
                {format(value[1])}
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.pill, { width: PILL_W, left: clampLeft(cxA - PILL_W / 2, PILL_W) }]}>
                <Text style={styles.pillText}>{format(value[0])}</Text>
              </View>
              <View style={[styles.pill, { width: PILL_W, left: clampLeft(cxB - PILL_W / 2, PILL_W) }]}>
                <Text style={styles.pillText}>{format(value[1])}</Text>
              </View>
            </>
          ))}
      </View>

      <View
        style={styles.trackRow}
        onLayout={onLayout}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={a11yLabel}
        accessibilityValue={{ text: a11yValueText }}
        {...pan.panHandlers}
      >
        <View style={styles.trackBg} />

        {ticks.map((t) => {
          const x = centre(t);
          const major = Math.round(t / 60) % 3 === 0;
          return (
            <View
              key={t}
              pointerEvents="none"
              style={[
                styles.tick,
                {
                  left: x - 0.5,
                  height: major ? 12 : 7,
                  opacity: major ? 0.5 : 0.28,
                },
              ]}
            />
          );
        })}

        {!single && (
          <View
            pointerEvents="none"
            style={[styles.fill, { left: cxA, width: Math.max(0, cxB - cxA), backgroundColor: accent }]}
          />
        )}

        <View pointerEvents="none" style={[styles.thumb, { left: cxA - THUMB / 2, borderColor: accent }]}>
          <View style={[styles.thumbDot, { backgroundColor: accent }]} />
        </View>
        {!single && (
          <View pointerEvents="none" style={[styles.thumb, { left: cxB - THUMB / 2, borderColor: accent }]}>
            <View style={[styles.thumbDot, { backgroundColor: accent }]} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  labelRow: { height: 26, marginBottom: 8, position: 'relative' },
  pill: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  pillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12.5,
    color: colors.foreground,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  pillDash: { color: colors.textMuted, fontFamily: fonts.sansMedium },
  trackRow: {
    height: ROW_H,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (ROW_H - TRACK_H) / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.surfaceLight,
  },
  tick: {
    position: 'absolute',
    top: ROW_H / 2 - 6,
    width: 1,
    backgroundColor: colors.textMuted,
    borderRadius: 1,
  },
  fill: {
    position: 'absolute',
    top: (ROW_H - TRACK_H) / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  // De-glossed knob: flat fill with a clean accent ring, no drop shadow.
  thumb: {
    position: 'absolute',
    top: (ROW_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.card,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDot: { width: 7, height: 7, borderRadius: 4 },
});
