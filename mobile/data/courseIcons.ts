/**
 * Course visual icons — the glossy 3D "jelly" language for the course-docs
 * screens (CourseHero / CourseReader / CourseTimeline).
 *
 * P2 wires the course's own jelly mascot (assets/maxxThumbs/cut/<id>.png) as the
 * section/chapter/hero visual so those screens are photo-free and carried by the
 * jelly language instead of flat Ionicons discs.
 *
 * P3 adds a small set (≤ ~8) of distinct generated jelly objects in
 * COURSE_SECTION_ICONS, keyed by a section's Ionicons `icon` name (a stable,
 * theme-meaningful key already present on every section/chapter). `sectionJellyIcon`
 * prefers a generated icon when one is mapped and otherwise falls back to the
 * course mascot — so nothing is ever a broken require() or a plain Ionicons disc.
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

/**
 * Distinct generated jelly section icons (P3), keyed by a section's Ionicons
 * `icon` name (e.g. 'water-outline' → a droplet jelly). Empty until P3 generates
 * them; until then sectionJellyIcon() returns the course mascot.
 */
export const COURSE_SECTION_ICONS: Record<string, any> = {};

/** Best jelly icon for a section/chapter: a mapped generated icon, else mascot. */
export function sectionJellyIcon(maxxId?: string, iconKey?: string): any | null {
    if (iconKey && COURSE_SECTION_ICONS[iconKey]) return COURSE_SECTION_ICONS[iconKey];
    return courseJellyIcon(maxxId);
}
