/**
 * GlassBar — a progress/segment fill rendered as CLEAR glass, the same material
 * as the app's glass DNA logo: a frosted milky body, a neutral silver
 * rim, and a bright gleam along the top. (It used to be black "obsidian" glass.)
 *
 * Layering (bottom → top):
 *   1. Silver rim — a thin neutral band that shows around the
 *      body (the chromatic edge on every glass icon in the app).
 *   2. Frosted body — milky white to soft pearl, top to bottom, so the bar
 *      reads as a rounded rod of glass on light tracks.
 *   3. A cylindrical gleam — bright along the centre-line, tapering at both
 *      ends, clipped to the upper band. The curvature cue.
 *   4. A bottom bounce — a faint cool tint where light exits the glass.
 *   5. A travelling specular sweep every ~5s (Reanimated, UI-thread). Slow and
 *      rare so it reads as light moving on glass, not a loading shimmer.
 *
 * `from`/`to` still pick a slice of one continuous ramp, so a row of segment
 * bars shifts hue gently across the row and reads as one piece of glass.
 * Everything is decorative and pointer-transparent.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

export type GlassBarProps = {
    /** Start position (0→1) on the shared rim ramp. */
    from?: number;
    /** End position (0→1) on the shared rim ramp. */
    to?: number;
    /** Sizing (width / height / radius) for the bar. */
    style?: StyleProp<ViewStyle>;
    /** Corner radius; keep >= half the height so the rod stays capsule-ended. */
    radius?: number;
    /**
     * Extra delay (ms) before each sweep pass. Give adjacent bars in a row a
     * rising stagger (i * ~200ms) so the reflection appears to travel across
     * the whole row as one light, instead of every bar flashing in phase.
     */
    sweepDelayMs?: number;
};

// Rim ramp, sampled by from/to: neutral silver with the faintest warm/cool
// drift (it used to be a loud magenta → cyan iridescence).
const RIM_STOPS: [number, number, number][] = [[178, 176, 182], [162, 166, 174], [184, 182, 186], [168, 168, 176]];
function rimAt(t: number, alpha = 0.78): string {
    const x = Math.max(0, Math.min(1, t)) * (RIM_STOPS.length - 1);
    const i = Math.min(RIM_STOPS.length - 2, Math.floor(x));
    const f = x - i;
    const c = RIM_STOPS[i].map((v, k) => Math.round(v + (RIM_STOPS[i + 1][k] - v) * f));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
const RIM = 1.25;

export default function GlassBar({ from = 0, to = 1, style, radius = 5, sweepDelayMs = 0 }: GlassBarProps) {
    const [width, setWidth] = useState(0);
    const mid = (from + to) / 2;
    return (
        // OUTER: carries the float shadow and must NOT clip — `overflow:'hidden'`
        // on the rounding layer would clip the view's own shadow away.
        <View
            style={[
                { borderRadius: radius, borderCurve: 'continuous', backgroundColor: '#F4F4F7' },
                styles.float,
                style,
            ]}
            pointerEvents="none"
        >
            <View
                style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius, borderCurve: 'continuous' }]}
                pointerEvents="none"
                onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            >
                {/* 1. Iridescent rim. */}
                <LinearGradient
                    colors={[rimAt(from), rimAt(mid), rimAt(to)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />

                {/* 2. Frosted body, inset so the rim shows around it. */}
                <View
                    style={[styles.body, { borderRadius: Math.max(0, radius - RIM) }]}
                    pointerEvents="none"
                >
                    <LinearGradient
                        colors={['#FFFFFF', '#F1F1F5', '#E2E3EA']}
                        locations={[0, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />

                    {/* 3. Cylindrical gleam — the curvature cue. */}
                    <LinearGradient
                        colors={[
                            'rgba(255,255,255,0)',
                            'rgba(255,255,255,0.75)',
                            'rgba(255,255,255,1)',
                            'rgba(255,255,255,0.7)',
                            'rgba(255,255,255,0)',
                        ]}
                        locations={[0, 0.22, 0.5, 0.78, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gleam}
                    />

                    {/* 4. Bottom bounce — a faint cool tint where light exits. */}
                    <LinearGradient
                        colors={['rgba(255,255,255,0)', 'rgba(150,152,160,0.22)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.bounce}
                    />

                    {/* 5. Travelling specular — the motion cue. */}
                    {width > 0 ? <SweepGleam width={width} delayMs={sweepDelayMs} /> : null}
                </View>
            </View>
        </View>
    );
}

function SweepGleam({ width, delayMs }: { width: number; delayMs: number }) {
    // The band starts fully off the left edge and exits off the right.
    const band = Math.max(28, width * 0.22);
    const x = useSharedValue(-band);
    useEffect(() => {
        x.value = -band;
        // ~1.6s sweep, then rest ~3.4s — one pass every 5s. withSequence puts
        // the rest INSIDE the repeated unit so the pause recurs between passes.
        // The stagger (delayMs) is applied ONCE, outside the repeat: inside it
        // would stretch this bar's cycle and the row would drift out of phase.
        x.value = withDelay(
            delayMs,
            withRepeat(
                withSequence(
                    withDelay(3_400, withTiming(-band, { duration: 0 })),
                    withTiming(width + band, { duration: 1_600, easing: Easing.inOut(Easing.quad) }),
                ),
                -1,
                false,
            ),
        );
        // Reanimated cancels the loop on unmount; re-arm if the bar resizes.
    }, [band, width, delayMs, x]);

    const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { skewX: '-18deg' }] }));

    return (
        <Animated.View pointerEvents="none" style={[styles.sweep, { width: band }, anim]}>
            <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    clip: { overflow: 'hidden' },
    // Tight and low-opacity: a bar sits close to the surface, so a card-sized
    // float shadow would read as a smudge rather than lift.
    // Soft, cool and low: clear glass casts a faint tinted shadow, not a dark one.
    float: Platform.select({
        ios: { shadowColor: '#6E5AA8', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
        default: { elevation: 2 },
    })!,
    body: { position: 'absolute', top: RIM, left: RIM, right: RIM, bottom: RIM, overflow: 'hidden' },
    // Sits just below the top rim so the rim stays the brightest line, and stops
    // well short of the middle — a gleam that reaches halfway reads as a flat
    // sheet catching light, not a tube.
    gleam: { position: 'absolute', left: 0, right: 0, top: 1.5, height: '32%' },
    bounce: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%' },
    sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
