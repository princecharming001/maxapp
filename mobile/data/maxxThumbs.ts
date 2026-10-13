/**
 * One source of truth for the native programs' glossy 3D glass icons.
 *
 *   • MAXX_THUMBS      — opaque, light backdrop (assets/maxxThumbs/<file>.png)
 *   • MAXX_THUMBS_CUT  — background-removed (assets/maxxThumbs/cut/<file>.png)
 *
 * Keyed by normalized maxx id. The 7 biohacking programs come first; the legacy
 * looks-program ids (skinmax/hairmax/heightmax/bonemax/fitmax) stay mapped so an
 * old schedule row that hasn't been migrated yet still gets an icon. Unknown ids
 * resolve to null and callers fall back (monogram / no icon).
 *
 * File names don't always equal the id: trainmax uses fitmax.png (the new
 * dumbbell art) and skinhairmax uses skinhair.png.
 */
import { normalizeMaxxId } from '../utils/scheduleAggregation';

export const MAXX_THUMBS: Record<string, any> = {
    sleepmax: require('../assets/maxxThumbs/sleepmax.png'),
    energymax: require('../assets/maxxThumbs/energymax.png'),
    focusmax: require('../assets/maxxThumbs/focusmax.png'),
    calmmax: require('../assets/maxxThumbs/calmmax.png'),
    trainmax: require('../assets/maxxThumbs/fitmax.png'),
    skinhairmax: require('../assets/maxxThumbs/skinhair.png'),
    longevitymax: require('../assets/maxxThumbs/longevitymax.png'),
    suppmax: require('../assets/maxxThumbs/suppmax.png'),
    peptidemax: require('../assets/maxxThumbs/peptidemax.png'),
    // Legacy (pre-biohacking) programs.
    skinmax: require('../assets/maxxThumbs/skinmax.png'),
    hairmax: require('../assets/maxxThumbs/hairmax.png'),
    heightmax: require('../assets/maxxThumbs/heightmax.png'),
    bonemax: require('../assets/maxxThumbs/bonemax.png'),
    fitmax: require('../assets/maxxThumbs/fitmax.png'),
};

export const MAXX_THUMBS_CUT: Record<string, any> = {
    sleepmax: require('../assets/maxxThumbs/cut/sleepmax.png'),
    energymax: require('../assets/maxxThumbs/cut/energymax.png'),
    focusmax: require('../assets/maxxThumbs/cut/focusmax.png'),
    calmmax: require('../assets/maxxThumbs/cut/calmmax.png'),
    trainmax: require('../assets/maxxThumbs/cut/fitmax.png'),
    skinhairmax: require('../assets/maxxThumbs/cut/skinhair.png'),
    longevitymax: require('../assets/maxxThumbs/cut/longevitymax.png'),
    suppmax: require('../assets/maxxThumbs/cut/suppmax.png'),
    peptidemax: require('../assets/maxxThumbs/cut/peptidemax.png'),
    // Legacy (pre-biohacking) programs.
    skinmax: require('../assets/maxxThumbs/cut/skinmax.png'),
    hairmax: require('../assets/maxxThumbs/cut/hairmax.png'),
    heightmax: require('../assets/maxxThumbs/cut/heightmax.png'),
    bonemax: require('../assets/maxxThumbs/cut/bonemax.png'),
    fitmax: require('../assets/maxxThumbs/cut/fitmax.png'),
};

function lookup(map: Record<string, any>, id: unknown): any | null {
    const key = normalizeMaxxId(id);
    return key && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

/** Opaque glass icon for a native program id, or null. */
export function maxxThumb(id: unknown): any | null {
    return lookup(MAXX_THUMBS, id);
}

/** Transparent (cut-out) glass icon for a native program id, or null. */
export function maxxThumbCut(id: unknown): any | null {
    return lookup(MAXX_THUMBS_CUT, id);
}
