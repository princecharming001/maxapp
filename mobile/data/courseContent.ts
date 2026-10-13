/**
 * Course-content schema + module registry.
 *
 * Each maxx ships its course in its own file under `./courses/{id}.ts`.
 * Adding a new module:
 *   1. Create `./courses/{id}.ts` exporting a `CourseModule`
 *   2. Import it here and register it in the COURSES map
 * The TOC + Reader render uniformly from this shape — no UI changes.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type CourseSection = {
    /** Slug, e.g. "what-skin-is". Stable across renders. */
    id: string;
    /** Outline number, e.g. "1.1". */
    number: string;
    /** Slide title — Playfair serif, ≤ 28 chars. */
    title: string;
    /** One-sentence framing, ≤ 110 chars. */
    subtitle: string;
    /** Ionicons -outline name. */
    icon: string;
    /** 4–6 short bullets. Keep each ≤ 90 chars. */
    bullets: string[];
    /** Optional longer paragraph for high-depth sections. */
    body?: string;
    /** "3 min", "1 min", etc. — surfaced as a small pill. */
    eta?: string;
};

export type CourseChapter = {
    id: string;
    /** 1-indexed. */
    number: number;
    title: string;
    subtitle: string;
    /** Ionicons -outline icon for the TOC row. */
    icon: string;
    sections: CourseSection[];
};

/** Attribution for a creator-authored course (creator courses only). */
export type CourseCreator = {
    name: string;
    handle?: string;
    verified?: boolean;
    /** One-line "what they do" shown under the byline. */
    tagline?: string;
};

export type CourseModule = {
    /**
     * Native maxx id, or a creator-course id (e.g. 'coloringmax'). Native maxes
     * pull their header (title/icon/description) from the API; creator courses
     * are self-contained and supply their own title / subtitle / icon / creator
     * below, so they render with no backend row.
     */
    maxxId:
        | 'skinmax' | 'hairmax' | 'fitmax' | 'bonemax' | 'heightmax' | 'coloringmax'
        // AI biohacking programs (biohack pivot).
        | 'sleepmax' | 'energymax' | 'focusmax' | 'calmmax' | 'trainmax' | 'skinhairmax' | 'longevitymax'
        | 'suppmax' | 'peptidemax';
    /** Creator-course display title (used when there is no API maxx row). */
    title?: string;
    /** Creator-course one-line description for the header. */
    subtitle?: string;
    /** Creator-course header icon (Ionicons -outline). */
    icon?: string;
    /** Set on creator-authored courses; absent on native maxes. */
    creator?: CourseCreator;
    /** Single accent color the entire course view tints with. */
    accent: string;
    /** ~10% opacity tint of `accent` for soft backgrounds. */
    accentSoft: string;
    /** ~18% opacity tint for borders / mid-strength highlights. */
    accentMid: string;
    /** Pre-TOC caption (legacy — most surfaces no longer render this). */
    caption?: string;
    chapters: CourseChapter[];
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

import { SKINMAX_COURSE } from './courses/skinmax';
import { HAIRMAX_COURSE } from './courses/hairmax';
import { FITMAX_COURSE } from './courses/fitmax';
import { BONEMAX_COURSE } from './courses/bonemax';
import { HEIGHTMAX_COURSE } from './courses/heightmax';
import { COLORINGMAX_COURSE } from './courses/coloringmax';
import { SLEEPMAX_COURSE } from './courses/sleepmax';
import { ENERGYMAX_COURSE } from './courses/energymax';
import { FOCUSMAX_COURSE } from './courses/focusmax';
import { CALMMAX_COURSE } from './courses/calmmax';
import { TRAINMAX_COURSE } from './courses/trainmax';
import { SKINHAIRMAX_COURSE } from './courses/skinhairmax';
import { LONGEVITYMAX_COURSE } from './courses/longevitymax';
import { SUPPMAX_COURSE } from './courses/suppmax';
import { PEPTIDEMAX_COURSE } from './courses/peptidemax';

const COURSES: Record<string, CourseModule> = {
    skinmax: SKINMAX_COURSE,
    hairmax: HAIRMAX_COURSE,
    fitmax: FITMAX_COURSE,
    bonemax: BONEMAX_COURSE,
    heightmax: HEIGHTMAX_COURSE,
    // First creator course — authored by Clay, self-contained (no API row).
    coloringmax: COLORINGMAX_COURSE,
    // AI biohacking programs. trainmax displays as "Fitmax"; skinhairmax as "Skin & Hair".
    sleepmax: SLEEPMAX_COURSE,
    energymax: ENERGYMAX_COURSE,
    focusmax: FOCUSMAX_COURSE,
    calmmax: CALMMAX_COURSE,
    trainmax: TRAINMAX_COURSE,
    skinhairmax: SKINHAIRMAX_COURSE,
    longevitymax: LONGEVITYMAX_COURSE,
    suppmax: SUPPMAX_COURSE,
    peptidemax: PEPTIDEMAX_COURSE,
};

/** True when this course is creator-authored rather than a native maxx. */
export function isCreatorCourse(course: CourseModule | null | undefined): boolean {
    return !!course?.creator;
}

export function getCourseForMaxx(maxxId: string): CourseModule | null {
    return COURSES[maxxId] ?? null;
}

/** Flatten chapters into a single ordered section list with chapter context. */
export function flattenSections(course: CourseModule): Array<{
    chapter: CourseChapter;
    section: CourseSection;
    globalIndex: number;
}> {
    const out: Array<{
        chapter: CourseChapter;
        section: CourseSection;
        globalIndex: number;
    }> = [];
    let i = 0;
    for (const ch of course.chapters) {
        for (const s of ch.sections) {
            out.push({ chapter: ch, section: s, globalIndex: i++ });
        }
    }
    return out;
}

/* Re-export the bundled modules so callers can grab a specific one. */
export {
    SKINMAX_COURSE, HAIRMAX_COURSE, FITMAX_COURSE, BONEMAX_COURSE, HEIGHTMAX_COURSE, COLORINGMAX_COURSE,
    SLEEPMAX_COURSE, ENERGYMAX_COURSE, FOCUSMAX_COURSE, CALMMAX_COURSE, TRAINMAX_COURSE,
    SKINHAIRMAX_COURSE, LONGEVITYMAX_COURSE, SUPPMAX_COURSE, PEPTIDEMAX_COURSE,
};
