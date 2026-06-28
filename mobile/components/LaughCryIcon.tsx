/**
 * LaughCryIcon — a glossy 3D "jelly" court jester (Explore icon language, see
 * c.md) laughing with tears of joy, on an infinite seamless loop:
 *   • the whole jester giggle-jiggles — a quick bob + squash + head tilt, which
 *     also swings the hat's bells, and
 *   • glossy blue teardrops stream from both eyes (two per eye on offset phases)
 *     down the face, fading to nothing at each cycle's ends so there's no seam
 *     (first frame == last frame).
 * The tears live inside the tilting frame, so they stay glued to the eyes and
 * lean with the head. Pure Reanimated + SVG, no Skia/Lottie.
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

// Eye anchor points (fractions of the box) measured off the jester asset.
const EYE_Y = 0.63;
const TEARS = [
  { x: 0.41, dir: -1, off: 0 },
  { x: 0.41, dir: -1, off: 0.5 },
  { x: 0.59, dir: 1, off: 0.28 },
  { x: 0.59, dir: 1, off: 0.78 },
];

function Tear({ tear, size, x, dir, off, idx }: { tear: SharedValue<number>; size: number; x: number; dir: number; off: number; idx: number }) {
  const tw = size * 0.15;
  const th = tw * 1.4;
  const fall = 0.22; // fraction of size the tear travels down
  const gid = `tdrop${idx}`;

  const style = useAnimatedStyle(() => {
    const p = (tear.value + off) % 1;
    const yy = (EYE_Y + fall * p) * size;
    const xx = x * size + dir * size * 0.045 * p;
    const sc = interpolate(p, [0, 0.18, 0.8, 1], [0.4, 1, 1, 0.55], C);
    return {
      opacity: interpolate(p, [0, 0.1, 0.82, 1], [0, 1, 1, 0], C),
      transform: [{ translateX: xx - tw / 2 }, { translateY: yy }, { scale: sc }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, width: tw, height: th }, style]}>
      <Svg width={tw} height={th} viewBox="0 0 50 70">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#CFE8FF" />
            <Stop offset="0.55" stopColor="#5BA0F2" />
            <Stop offset="1" stopColor="#3B82F6" />
          </LinearGradient>
        </Defs>
        <Path d="M25 2 C25 2 47 36 47 49 A22 22 0 1 1 3 49 C3 36 25 2 25 2 Z" fill={`url(#${gid})`} />
        <Ellipse cx="17" cy="46" rx="6" ry="9" fill="rgba(255,255,255,0.55)" />
      </Svg>
    </Animated.View>
  );
}

export function LaughCryIcon({ size = 88 }: { size?: number }) {
  const laugh = useSharedValue(0);
  const tear = useSharedValue(0);

  useEffect(() => {
    laugh.value = withRepeat(withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }), -1, true);
    tear.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(laugh);
      cancelAnimation(tear);
    };
  }, [laugh, tear]);

  // Bob + squash + head-tilt — the tilt swings the hat + bells. Tears ride inside
  // this frame, so they stay on the eyes and lean with the head.
  const frame = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(laugh.value, [0, 1], [0, -size * 0.04], C) },
      { scaleX: interpolate(laugh.value, [0, 1], [1, 1.04], C) },
      { scaleY: interpolate(laugh.value, [0, 1], [1, 0.96], C) },
      { rotate: `${interpolate(laugh.value, [0, 1], [-3, 3], C)}deg` },
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
