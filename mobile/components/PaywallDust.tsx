/**
 * PaywallDust — the Max Pro background: soft wisps of colored "dust" drifting
 * over the cream canvas, tinted in the exact brand hues of the Explore page's
 * glossy max icons (utils/maxxBrand). Each wisp is a large radial gradient that
 * fades to transparent, so they overlap into a quiet nebula rather than hard
 * blobs — legible behind the title, plans, and CTA. Pure react-native-svg, no
 * new native deps.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Ellipse, G } from 'react-native-svg';

const CREAM = '#F4EEE3';

// Brand jelly-icon hues (skin / height / hair / bone / fit), placed as a warm→
// cool drift down the screen. cx/cy are fractions of width/height; rx/ry are
// fractions too, so the wisps scale with the device.
const WISPS: { c: string; cx: number; cy: number; rx: number; ry: number; o: number }[] = [
  { c: '#E879A9', cx: 0.16, cy: 0.10, rx: 0.62, ry: 0.34, o: 0.60 }, // skin pink — top left
  { c: '#8B5CF6', cx: 0.90, cy: 0.06, rx: 0.55, ry: 0.32, o: 0.52 }, // height purple — top right
  { c: '#3B82F6', cx: 0.04, cy: 0.44, rx: 0.52, ry: 0.34, o: 0.40 }, // hair blue — mid left
  { c: '#F59E0B', cx: 0.98, cy: 0.52, rx: 0.50, ry: 0.34, o: 0.40 }, // bone amber — mid right
  { c: '#E879A9', cx: 0.62, cy: 0.40, rx: 0.40, ry: 0.26, o: 0.30 }, // pink echo — center
  { c: '#10B981', cx: 0.46, cy: 0.86, rx: 0.72, ry: 0.40, o: 0.42 }, // fit green — bottom
];

export default function PaywallDust() {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {WISPS.map((w, i) => (
          <RadialGradient key={i} id={`wisp${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={w.c} stopOpacity={w.o} />
            <Stop offset="48%" stopColor={w.c} stopOpacity={w.o * 0.38} />
            <Stop offset="100%" stopColor={w.c} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={CREAM} />
      <G>
        {WISPS.map((w, i) => (
          <Ellipse
            key={i}
            cx={W * w.cx}
            cy={H * w.cy}
            rx={W * w.rx}
            ry={H * w.ry}
            fill={`url(#wisp${i})`}
          />
        ))}
      </G>
    </Svg>
  );
}
