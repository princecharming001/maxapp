/**
 * Course visual icons — the glossy 3D "jelly" language for the course-docs
 * screens (CourseHero / CourseReader / CourseTimeline).
 *
 * Two layers:
 *   • courseJellyIcon(maxxId) — the course's own jelly MASCOT
 *     (assets/maxxThumbs/cut/<id>.png). Used for the CourseHero watermark.
 *   • sectionJellyIcon(iconKey) — a generated glossy jelly SECTION icon, picked
 *     from a small themed set (P3) by bucketing the section's Ionicons `icon`
 *     name. Used for the reader slide disc, timeline chapter nodes, and lesson
 *     glyphs so every section reads as the jelly language, not a flat Ionicons
 *     disc. Falls back to the course mascot if no theme resolves.
 *
 * The section set is intentionally small (6 abstract objects, generated in the
 * exact maxxThumbs style — smooth glossy 3D forms, warm-to-cool iridescent
 * gradient, transparent background) and reused across the ~50 distinct section
 * icon names via theme buckets.
 */
import { normalizeMaxxId } from '../utils/scheduleAggregation';

const JELLY_BY_MAXX: Record<string, any> = {
    skinmax: require('../assets/maxxThumbs/cut/skinmax.png'),
    hairmax: require('../assets/maxxThumbs/cut/hairmax.png'),
    fitmax: require('../assets/maxxThumbs/cut/fitmax.png'),
    bonemax: require('../assets/maxxThumbs/cut/bonemax.png'),
    heightmax: require('../assets/maxxThumbs/cut/heightmax.png'),
};

/** The course's own jelly mascot (null for creator courses w/ no native icon). */
export function courseJellyIcon(maxxId?: string): any | null {
    return JELLY_BY_MAXX[normalizeMaxxId(maxxId)] || null;
}

/* ── Generated section icons (P3) — glossy 3D jelly objects, transparent ──── */
type IconTheme = 'droplet' | 'leaf' | 'orb' | 'crystal' | 'flame' | 'shield';

export const COURSE_SECTION_ICONS: Record<IconTheme, any> = {
    droplet: require('../assets/courseIcons/droplet.png'),
    leaf: require('../assets/courseIcons/leaf.png'),
    orb: require('../assets/courseIcons/orb.png'),
    crystal: require('../assets/courseIcons/crystal.png'),
    flame: require('../assets/courseIcons/flame.png'),
    shield: require('../assets/courseIcons/shield.png'),
};

/**
 * Bucket a section's Ionicons `icon` name into one of the 6 jelly themes.
 * Keyword-ordered (most specific first) so every name resolves; the catch-all
 * is the neutral `orb`.
 */
function iconTheme(key?: string): IconTheme {
    const k = (key || '').toLowerCase();
    if (/(shield|close|alert|warn|remove|ban|lock|hand|skull|nuclear|bug|sad|thumbs-down)/.test(k)) return 'shield';
    if (/(flame|fitness|barbell|pulse|flash|walk|bicycle|run|trending-up|rocket|trophy|medal|speed|heart|bonfire|thunder|battery)/.test(k)) return 'flame';
    if (/(water|flask|medical|bandage|rainy|nutrition|restaurant|beer|wine|cafe|fill|drop|fish|leaf-cleanse)/.test(k)) return 'droplet';
    if (/(leaf|bed|moon|flower|paw|sleep|cloud|happy|partly|rose)/.test(k)) return 'leaf';
    if (/(layers|options|analytics|construct|build|grid|cube|diamond|sparkle|prism|palette|stats|chart|pie|extension|hardware|cog|settings|swap|git|infinite|albums|apps)/.test(k)) return 'crystal';
    return 'orb';
}

/** Best jelly icon for a section/chapter: a themed generated icon, else mascot. */
export function sectionJellyIcon(maxxId?: string, iconKey?: string): any | null {
    return COURSE_SECTION_ICONS[iconTheme(iconKey)] || courseJellyIcon(maxxId);
}
