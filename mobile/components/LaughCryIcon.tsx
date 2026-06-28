/**
 * LaughCryIcon — a soft frosted 3D "jelly" court jester (Explore icon language /
 * c.md: warm coral-amber top → glowing core → cool blue base) laughing until it
 * cries, on an infinite seamless loop:
 *   • the jester giggle-jiggles — a gentle bob + squash + head tilt (which swings
 *     the hat bells), and
 *   • a single small tear wells up at each eye, then rolls down the cheek with
 *     gravity (accelerating) and fades — one per eye, alternating, with a gap so
 *     it reads as occasional tears of joy, not a stream.
 * Each tear fades to nothing at the ends of its cycle, so the loop has no seam.
 * Tears ride inside the tilting frame, so they stay on the eyes. Pure Reanimated + SVG.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse } from 'react-native-svg';

const FACE = require('../assets/jesterFace.png');
const C = Extrapolation.CLAMP;

const EYE_Y = 0.57; // tear origin (just below the eyes), fraction of the box
const FALL = 0.24; // how far down the cheek the tear rolls, fraction of the box
// One tear per eye, offset half a cycle so they alternate (never a stream).
const TEARS = [
  { x: 0.42, dir: -1, off: 0 },
  { x: 0.60, dir: 1, off: 0.5 },
];

function Tear({ tear, size, x, dir, off, idx }: { tear: SharedValue<number>; size: number; x: number; dir: number; off: number; idx: number }) {
  const tw = size * 0.09;
  const th = tw * 1.55;
  const gid = `tdrop${idx}`;

  const style = useAnimatedStyle(() => {
    const p = (tear.value + off) % 1;
    const roll = interpolate(p, [0.16, 0.82], [0, 1], C); // 0..1 down the cheek
    const yy = (EYE_Y + FALL * roll * roll) * size; // ease-in: slow start, gravity pulls
    const xx = (x + dir * 0.02) * size;
    const sc = interpolate(p, [0.05, 0.2, 0.85, 0.92], [0.3, 1, 1, 0.7], C);
    return {
      // wells in, holds while rolling, fades; then a gap (no tear) before the next.
      opacity: interpolate(p, [0.05, 0.16, 0.82, 0.92], [0, 1, 1, 0], C),
      transform: [{ translateX: xx - tw / 2 }, { translateY: yy }, { scale: sc }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width: tw, height: th }, style]}>
      <Svg width={tw} height={th} viewBox="0 0 50 70">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#DCEEFF" />
            <Stop offset="0.55" stopColor="#7FB6F5" />
            <Stop offset="1" stopColor="#5B8FE0" />
          </LinearGradient>
        </Defs>
        <Path d="M25 2 C25 2 47 36 47 49 A22 22 0 1 1 3 49 C3 36 25 2 25 2 Z" fill={`url(#${gid})`} />
        <Ellipse cx="17" cy="46" rx="5" ry="8" fill="rgba(255,255,255,0.5)" />
      </Svg>
    </Animated.View>
  );
}

export function LaughCryIcon({ size = 88 }: { size?: number }) {
  const laugh = useSharedValue(0);
  const tear = useSharedValue(0);

  useEffect(() => {
    laugh.value = withRepeat(withTiming(1, { duration: 290, easing: Easing.inOut(Easing.quad) }), -1, true);
    tear.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(laugh);
      cancelAnimation(tear);
    };
  }, [laugh, tear]);

  // Gentle bob + squash + head tilt (tilt swings the hat bells). Tears ride inside
  // this frame, so they stay on the eyes and lean with the head.
  const frame = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(laugh.value, [0, 1], [0, -size * 0.03], C) },
      { scaleX: interpolate(laugh.value, [0, 1], [1, 1.03], C) },
      { scaleY: interpolate(laugh.value, [0, 1], [1, 0.97], C) },
      { rotate: `${interpolate(laugh.value, [0, 1], [-2, 2], C)}deg` },
    ],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, frame]}>
        <Animated.Image source={FACE} resizeMode="contain" style={{ width: size, height: size }} />
        {TEARS.map((t, i) => (
          <Tear key={i} tear={tear} size={size} x={t.x} dir={t.dir} off={t.off} idx={i} />
        ))}
      </Animated.View>
      <View style={StyleSheet.absoluteFill} accessibilityRole="image" accessibilityLabel="Jester laughing with tears of joy" pointerEvents="none" />
    </View>
  );
}

export default LaughCryIcon;
