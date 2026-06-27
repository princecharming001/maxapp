/**
 * LiquidGlass — the one canonical "Apple liquid glass" surface for the app.
 *
 * The goal (see docs/RALPH_LIQUID_GLASS.md) is a CLEAR, see-through pane that
 * reads as a curved sheet of glass floating above the content: you see the
 * background through it (only brightened), bright specular glints catch one
 * corner, a luminous rim lenses the edge, and a soft shadow floats it off the
 * surface. It only truly reads as glass over a contrasty backdrop.
 *
 * It can't do real edge REFRACTION (that needs a Skia/GL shader = a native
 * module = OUT OF SCOPE) — so it fakes the optics with the real native iOS
 * frosted material + react-native-svg speculars + gradient rims + a drop shadow.
 *
 * Layering (bottom → top):
 *   1. BlurView with a native UIBlurEffect material tint (iOS) — content-
 *      adaptive, cool-toned, genuinely glassy. Frost fallback on Android.
 *   2. Corner speculars — svg radial gradients: a big soft glow at the top-left
 *      edge + a smaller hotspot near the bottom-right (the light direction).
 *   3. A top specular sheen — linear gradient, bright top → transparent.
 *   4. A luminous rim — bright top edge, softer left, faint bottom + a 1px
 *      light border (edge lensing).
 *   5. A faint inner bottom shadow for glass thickness.
 *   6. The OUTER wrapper carries borderCurve:'continuous' + the soft float
 *      drop shadow (overflow:hidden on the inner clip would clip its own
 *      shadow, so the shadow lives on the un-clipped outer view).
 *
 * All decorative layers are pointerEvents="none"; children render on top.
 */
import React from 'react';
import { View, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const IS_IOS = Platform.OS === 'ios';

export type LiquidGlassProps = {
    children?: React.ReactNode;
    /** Sizing / layout style for the OUTER (shadow) wrapper. */
    style?: StyleProp<ViewStyle>;
    /** Padding / layout for the inner content area (sits above the glass). */
    contentStyle?: StyleProp<ViewStyle>;
    /** Corner radius — continuous (squircle). */
    radius?: number;
    /** Native iOS material. Default leans thin for the clear, see-through look. */
    tint?: BlurTint;
    /** Blur intensity (iOS material strength). */
    intensity?: number;
    /** Dark glass (dark material + dark-tuned rims). */
    dark?: boolean;
    /** Drop the float shadow (e.g. when the surface sits flush in a bar). */
    noShadow?: boolean;
    /** Strength multiplier for the specular highlights (0 = none, 1 = default). */
    spec?: number;
};

export function LiquidGlass({
    children,
    style,
    contentStyle,
    radius = 24,
    tint,
    intensity,
    dark = false,
    noShadow = false,
    spec = 1,
}: LiquidGlassProps) {
    // The light border doubles as all-around edge lensing; the rest of the
    // optics live in <LiquidGlassFill> so the wrapper and the fill stay in sync.
    const border = dark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.62)';

    const floatShadow = noShadow
        ? null
        : IS_IOS
        ? {
              shadowColor: dark ? '#000000' : '#3A3358',
              shadowOpacity: dark ? 0.36 : 0.22,
              shadowRadius: 26,
              shadowOffset: { width: 0, height: 14 },
          }
        : { elevation: 7 };

    return (
        <View style={[{ borderRadius: radius, borderCurve: 'continuous' }, floatShadow, style]}>
            <View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        borderRadius: radius,
                        borderCurve: 'continuous',
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: border,
                    },
                ]}
                pointerEvents="none"
            >
                <LiquidGlassFill dark={dark} tint={tint} intensity={intensity} spec={spec} />
            </View>

            {/* Content sits above all the glass layers. */}
            <View style={[styles.content, contentStyle]}>{children}</View>
        </View>
    );
}

/**
 * LiquidGlassFill — the decorative glass OPTICS as an absolute-fill layer, with
 * no clip / border / float of its own. Drop this behind content inside a card
 * that already owns its rounded clip + shadow (it inherits the parent's corner
 * via overflow:hidden). The wrapper <LiquidGlass> composes this same fill, so
 * every glass surface — wrapper or fill — shares one set of optics.
 */
export function LiquidGlassFill({
    dark = false,
    tint,
    intensity,
    spec = 1,
    idSuffix = '',
}: Pick<LiquidGlassProps, 'dark' | 'tint' | 'intensity' | 'spec'> & {
    /** Unique-ify the svg gradient ids when several fills mount in one screen. */
    idSuffix?: string;
}) {
    const material: BlurTint = tint ?? (IS_IOS
        ? (dark ? 'systemThinMaterialDark' : 'systemThinMaterialLight')
        : (dark ? 'dark' : 'light'));
    const blurIntensity = intensity ?? (IS_IOS ? 88 : 24);
    const frostFallback = dark ? 'rgba(20,22,30,0.42)' : 'rgba(244,246,251,0.30)';
    const rimTop = dark ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.98)';
    const rimLeft = dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.58)';
    const rimBottom = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.42)';
    const sheen = Math.min(1, Math.max(0, spec));
    const tlId = `lgTL${idSuffix}`;
    const brId = `lgBR${idSuffix}`;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* 1. Real iOS frosted-glass material (or frost fallback). */}
            <BlurView
                intensity={blurIntensity}
                tint={material}
                style={StyleSheet.absoluteFill}
                experimentalBlurMethod={IS_IOS ? undefined : 'dimezisBlurView'}
                pointerEvents="none"
            />
            {!IS_IOS ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: frostFallback }]} />
            ) : null}

            {/* 2. Corner speculars — a bright concentrated glint at the top-left
                edge + a smaller hotspot near the bottom-right (the light
                direction). Tight + bright so they read as glints, not a wash. */}
            {sheen > 0 ? (
                <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Defs>
                        <RadialGradient id={tlId} cx="2%" cy="0%" r="72%">
                            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.98 * sheen} />
                            <Stop offset="16%" stopColor="#FFFFFF" stopOpacity={0.55 * sheen} />
                            <Stop offset="42%" stopColor="#FFFFFF" stopOpacity={0.12 * sheen} />
                            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                        </RadialGradient>
                        <RadialGradient id={brId} cx="100%" cy="100%" r="50%">
                            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.72 * sheen} />
                            <Stop offset="30%" stopColor="#FFFFFF" stopOpacity={0.20 * sheen} />
                            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${tlId})`} />
                    <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${brId})`} />
                </Svg>
            ) : null}

            {/* 3. Top specular sheen — the main horizontal light-catch. */}
            <LinearGradient
                pointerEvents="none"
                colors={[`rgba(255,255,255,${0.55 * sheen})`, `rgba(255,255,255,${0.08 * sheen})`, 'rgba(255,255,255,0)']}
                locations={[0, 0.34, 0.72]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.topSheen}
            />

            {/* 5. Inner bottom shadow — glass thickness / depth. */}
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(30,28,46,0)', `rgba(30,28,46,${dark ? 0.18 : 0.07})`]}
                start={{ x: 0, y: 0.7 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* 4. Luminous rims — edge lensing. */}
            <View pointerEvents="none" style={[styles.rimTop, { backgroundColor: rimTop }]} />
            <View pointerEvents="none" style={[styles.rimLeft, { backgroundColor: rimLeft }]} />
            <View pointerEvents="none" style={[styles.rimBottom, { backgroundColor: rimBottom }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    content: { flex: 0 },
    topSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '46%' },
    rimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
    rimLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1 },
    rimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 },
});

export default LiquidGlass;
