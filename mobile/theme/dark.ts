/**
 * Sleek modern SaaS design system
 * Clean, shadowed, typographic
 */

// Craft-inspired palette: warm paper canvas, white surfaces, warm ink, one
// calm blue accent. Flat and matte - no glass, no glow.
export const colors = {
    background: '#F7F0EA',    // Craft-style warm cream canvas (light + airy)
    surface: '#EFE7DC',      // subtle inset
    surfaceLight: '#F9F3EC',
    card: '#FFFFFF',

    foreground: '#1C1A17',   // warm near-black ink
    primary: '#1C1A17',
    primaryLight: '#3A352B',
    primaryDark: '#000000',

    accent: '#2C6BED',       // Craft blue (interactive / selected)
    accentLight: '#5A8CF2',
    accentMuted: 'rgba(44, 107, 237, 0.10)',

    textPrimary: '#1C1A17',
    textSecondary: '#5C574E',
    textMuted: '#97928A',

    success: '#2F9E60',
    warning: '#B5791C',
    error: '#C0452C',
    info: '#2C6BED',

    premium: '#2C6BED',
    premiumLight: '#2C6BED18',
    premiumBorder: '#2C6BED40',

    border: '#E8E0D3',       // warm hairline
    borderLight: '#F0E9DE',
    divider: '#E8E0D3',

    gradientStart: '#F7F0EA',
    gradientEnd: '#F0E8DD',

    buttonText: '#FFFFFF',

    overlay: 'rgba(28, 26, 23, 0.40)',
    blur: 'rgba(247, 240, 234, 0.9)',
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

export const typography = {
    h1: {
        fontSize: 32,
        fontWeight: '700' as const,
        color: colors.textPrimary,
        letterSpacing: -0.8,
    },
    h2: {
        fontSize: 22,
        fontWeight: '600' as const,
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    h3: {
        fontSize: 17,
        fontWeight: '600' as const,
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    body: {
        fontSize: 15,
        fontWeight: '400' as const,
        color: colors.textPrimary,
        lineHeight: 22,
    },
    bodySmall: {
        fontSize: 13,
        fontWeight: '400' as const,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    caption: {
        fontSize: 11,
        fontWeight: '500' as const,
        color: colors.textMuted,
    },
    label: {
        fontSize: 11,
        fontWeight: '600' as const,
        color: colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase' as const,
    },
    button: {
        fontSize: 15,
        fontWeight: '600' as const,
        color: colors.buttonText,
        letterSpacing: -0.1,
    },
    hero: {
        fontSize: 48,
        fontWeight: '400' as const,
        color: colors.textPrimary,
        letterSpacing: -2,
    },
};

// Whisper-soft, warm-toned shadows (Craft barely lifts surfaces off the page).
export const shadows = {
    sm: {
        shadowColor: '#3A352B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    md: {
        shadowColor: '#3A352B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 3,
    },
    lg: {
        shadowColor: '#3A352B',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 24,
        elevation: 6,
    },
    xl: {
        shadowColor: '#3A352B',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.09,
        shadowRadius: 36,
        elevation: 9,
    },
};

export const fonts = {
    serif: 'Fraunces',
    serifSemiBold: 'Fraunces-SemiBold',
    serifItalic: 'Fraunces-Italic',
    sans: 'Matter-Regular',
    sansMedium: 'Matter-Medium',
    sansSemiBold: 'Matter-SemiBold',
    sansBold: 'Matter-Bold',
    sansLight: 'Matter-Light',
};

export default {
    colors,
    spacing,
    borderRadius,
    typography,
    shadows,
    fonts,
};
