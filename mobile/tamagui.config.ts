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
            // Brand
            ink: '#111113',
            gold: '#D4A017',
            canvas: '#F4F5F8',
            // Glass surfaces (translucent — pair with expo-blur for the frost)
            glass: 'rgba(255,255,255,0.55)',
            glassStrong: 'rgba(255,255,255,0.78)',
            glassBorder: 'rgba(255,255,255,0.60)',
            glassHairline: 'rgba(17,17,19,0.08)',
        },
    },
});

export type AppConfig = typeof config;

// Register the custom config so Tamagui component props are typed to our tokens.
declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
