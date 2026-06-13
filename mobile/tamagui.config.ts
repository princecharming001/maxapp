/**
 * Tamagui design-system config for the Max app (glassy iOS-native aesthetic).
 *
 * This is the foundation of the aesthetic redo. It starts from Tamagui's
 * verified v4 default config and layers on:
 *   - glass surface color tokens (translucent whites + hairlines)
 *   - brand tokens (ink charcoal, gold)
 *
 * Fonts (Matter + Playfair) and the Reanimated animation driver are added in
 * deliberate, separately-verified follow-up steps so any config break is easy
 * to pinpoint. Keep this file the single source of truth for design tokens.
 */
import { defaultConfig } from '@tamagui/config/v4';
import { createTamagui } from 'tamagui';

export const config = createTamagui({
    ...defaultConfig,
    tokens: {
        ...defaultConfig.tokens,
        color: {
            ...defaultConfig.tokens.color,
            // Brand — Craft-inspired: warm paper, ink, one calm blue accent.
            // (token names kept for back-compat; `gold` now carries the accent
            // and `glass*` now carry flat-paper surfaces, no blur.)
            ink: '#1C1A17',
            gold: '#2C6BED',
            // Craft-style warm cream canvas — light + airy. White cards lift via
            // soft shadows + hairlines rather than a heavy background contrast.
            canvas: '#F7F0EA',
            // Flat paper surfaces (no translucency — Craft is matte, not glass)
            glass: '#FFFFFF',
            glassStrong: '#FFFFFF',
            glassBorder: '#E8E0D3',
            glassHairline: 'rgba(28,26,23,0.07)',
        },
    },
});

export type AppConfig = typeof config;

// Register the custom config so Tamagui component props are typed to our tokens.
declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
