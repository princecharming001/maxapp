/**
 * App design tokens. Typography presets are wired to the loaded Matter grotesk
 * (weight-specific files) so real type renders app-wide instead of the system
 * font. The planner surface layers its own editorial palette on top of these
 * neutral tokens (see components/planner/plannerTheme.ts) — the warmer colour /
 * radius direction is being proven there before any app-wide rollout.
 */

export const colors = {
    background: '#f8f8fa',
    surface: '#f0f0f3',
    surfaceLight: '#eaeaed',
    card: '#ffffff',

    foreground: '#111113',
    primary: '#111113',
    primaryLight: '#2a2a2e',
    primaryDark: '#000000',

    accent: '#111113',
    accentLight: '#2a2a2e',
    accentMuted: 'rgba(17, 17, 19, 0.05)',

    textPrimary: '#111113',
    textSecondary: '#71717a',
    textMuted: '#a1a1aa',

    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    premium: '#D4A017',
    premiumLight: '#D4A01718',
    premiumBorder: '#D4A01740',

    border: '#e4e4e7',
    borderLight: '#f0f0f3',
    divider: '#e4e4e7',

    gradientStart: '#f8f8fa',
    gradientEnd: '#f0f0f3',

    buttonText: '#fafafa',

    overlay: 'rgba(0, 0, 0, 0.45)',
    blur: 'rgba(255, 255, 255, 0.82)',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
};

export const borderRadius = {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 28,
    full: 9999,
};

export const fonts = {
    serif: 'PlayfairDisplay',
    serifItalic: 'PlayfairDisplay-Italic',
    sans: 'Matter-Regular',
    sansMedium: 'Matter-Medium',
    sansSemiBold: 'Matter-SemiBold',
    sansBold: 'Matter-Bold',
    sansLight: 'Matter-Light',
};

// Typography presets map to the loaded Matter weight FILES (not a numeric
// fontWeight on the system font). Each preset names the specific weight file so
// the grotesk actually renders — and so iOS/Android never fake-bold a single
// family. Display/serif (Playfair) stays a per-surface choice, not forced here.
export const typography = {
    h1: {
        fontFamily: fonts.sansBold,
        fontSize: 32,
        color: colors.textPrimary,
        letterSpacing: -0.8,
    },
    h2: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 22,
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    h3: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 17,
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    body: {
        fontFamily: fonts.sans,
        fontSize: 15,
        color: colors.textPrimary,
        lineHeight: 22,
    },
    bodySmall: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    caption: {
        fontFamily: fonts.sansMedium,
        fontSize: 11,
        color: colors.textMuted,
    },
    label: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        color: colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase' as const,
    },
    button: {
        fontFamily: fonts.sansSemiBold,
        fontSize: 15,
        color: colors.buttonText,
        letterSpacing: -0.1,
    },
    hero: {
        fontFamily: fonts.sans,
        fontSize: 48,
        color: colors.textPrimary,
        letterSpacing: -2,
    },
};

export const shadows = {
    sm: {
        shadowColor: '#18181b',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#18181b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
    },
    lg: {
        shadowColor: '#18181b',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 8,
    },
    xl: {
        shadowColor: '#18181b',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.16,
        shadowRadius: 48,
        elevation: 12,
    },
};

export default {
    colors,
    spacing,
    borderRadius,
    typography,
    shadows,
    fonts,
};
