/**
 * Program courses teach biology, never productivity (data/courses/*).
 *
 * Superpower is a biohacking app: every lesson in an AI-program course has to
 * be about a physiological lever (light, temperature, caffeine, compounds,
 * food, water, movement, breathing, rest, sleep, air, the senses, the skin, or
 * tracking a body signal). Focusmax used to teach a planner (top 3, deep-work
 * blocks, inbox batching, a shutdown ritual) and Calmmax a journal (brain dump,
 * gratitude, expressive writing, reaching out to friends). These tests pin that
 * out of every registered AI-program course, and keep the course shape honest
 * (numbering, schema length limits, captions that match the real counts).
 */
import assert from 'assert';
import { getCourseForMaxx, type CourseModule } from '../data/courseContent';

/** Every AI program with a course. trainmax displays as "Fitmax". */
const AI_PROGRAM_COURSES = [
    'focusmax', 'calmmax', 'energymax', 'sleepmax', 'trainmax',
    'longevitymax', 'skinhairmax', 'suppmax', 'peptidemax',
] as const;

/**
 * Planner / productivity / journaling language. Mirrors _PRODUCTIVITY in
 * backend/services/biohack_scope.py, plus "attention residue" / task-switching
 * theory and a bare "inbox". Phrases, not single words: "plan" and "list" are
 * everywhere in honest text ("your plan", "the list of side effects").
 */
const PRODUCTIVITY = new RegExp(
    '\\b(' +
        [
            'to-?do(?:s| list)?', 'todo list', 'top (?:3|three)',
            "plan (?:your|the|tomorrow'?s?) (?:day|tasks|top|priorities|week)",
            'priorit(?:y|ies|i[sz]e) (?:list|tasks)', 'daily planner', 'weekly planner', 'planner pad',
            'deep[- ]work', 'time[- ]block(?:s|ing)?', 'pomodoro', 'single[- ]task(?:ing)?', 'one tab', 'single[- ]tab',
            'batch(?:ing)? (?:your |the )?(?:inbox|email|messages)', 'inbox(?: zero)?', 'e-?mail batch',
            'notification (?:cleanup|audit|diet)', 'turn off notifications',
            'shutdown ritual', 'work(?:day)? shutdown', 'weekly review', 'meeting[- ]free',
            'journal(?:ing|s|ed)?', 'gratitude', 'brain ?dump', 'expressive writing', 'worry list', 'tomorrow list',
            'write (?:down|out) (?:your|the|three|3|what|tomorrow)', 'three lines',
            'reach out to', 'call a friend', 'text a friend', 'connect ping',
            'goal[- ]setting', 'set (?:your )?goals', 'write (?:your )?goals', 'vision board', 'affirmations?',
            'attention residue', 'task[- ]switch(?:ing|es)?',
        ].join('|') +
        ')\\b',
    'i',
);

/** Wall-clock times ("3 pm", "11:30pm"). Plans run on each person's own wake and bed times. */
const CLOCK_TIME = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)(?![a-z])/i;

/** Keys that hold identifiers or styling, not reader-facing text ("journal-outline" is a real icon). */
const NON_TEXT_KEYS = new Set(['id', 'icon', 'number', 'eta', 'maxxId', 'accent', 'accentSoft', 'accentMid']);

/** Every reader-facing string in a course, with a path for the failure message. */
function courseText(course: CourseModule): Array<{ where: string; text: string }> {
    const out: Array<{ where: string; text: string }> = [];
    const walk = (v: unknown, where: string) => {
        if (typeof v === 'string') {
            out.push({ where, text: v });
        } else if (Array.isArray(v)) {
            v.forEach((x, i) => walk(x, `${where}[${i}]`));
        } else if (v && typeof v === 'object') {
            for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
                if (!NON_TEXT_KEYS.has(k)) walk(x, `${where}.${k}`);
            }
        }
    };
    walk(course, course.maxxId);
    return out;
}

function course(id: string): CourseModule {
    const c = getCourseForMaxx(id);
    assert.ok(c, `${id}: no course registered in data/courseContent.ts`);
    return c!;
}

export const tests = {
    'every AI program has a registered course with the matching maxxId': () => {
        for (const id of AI_PROGRAM_COURSES) {
            assert.strictEqual(course(id).maxxId, id);
        }
    },

    'the productivity pattern catches planner and journal language': () => {
        for (const bad of [
            'Plan your top 3', 'Write the 3 outcomes for your to-do list', 'One protected deep-work block',
            'Time block your morning', 'A 25-minute pomodoro', 'Batch your inbox twice a day',
            'The workday shutdown ritual', 'The Weekly Review', 'A gratitude journal', 'The 3-minute brain dump',
            'Expressive writing for 15 minutes', 'The Tomorrow List', 'Write down your worries', 'The worry list',
            'Reach out to someone this week', 'Goal setting for the month', 'Set your goals',
            'Every switch leaves attention residue', 'Task switching costs focus', 'Journaling before bed',
        ]) {
            assert.ok(PRODUCTIVITY.test(bad), `pattern should catch: ${bad}`);
        }
        for (const ok of [
            'Your plan is a draft', 'A caffeine cutoff about 9 hours before bed', 'Log your resting heart rate',
            'Rate your energy 1 to 5', 'Weekly protocol review', 'Weekly skin check-in', 'Breathe out slowly',
            'Write the mixing date on the vial', 'Take one tablet with food', 'Tick the missing ones at your checkup',
        ]) {
            assert.ok(!PRODUCTIVITY.test(ok), `pattern should not catch: ${ok}`);
        }
    },

    'no course text teaches a productivity, planner or journaling habit': () => {
        const hits: string[] = [];
        for (const id of AI_PROGRAM_COURSES) {
            for (const { where, text } of courseText(course(id))) {
                const m = text.match(PRODUCTIVITY);
                if (m) hits.push(`${where}: "${m[0]}" in ${JSON.stringify(text)}`);
            }
        }
        assert.deepStrictEqual(hits, []);
    },

    'no course text uses wall-clock times (habits follow each person\'s own day)': () => {
        const hits: string[] = [];
        for (const id of AI_PROGRAM_COURSES) {
            for (const { where, text } of courseText(course(id))) {
                const m = text.match(CLOCK_TIME);
                if (m) hits.push(`${where}: "${m[0]}" in ${JSON.stringify(text)}`);
            }
        }
        assert.deepStrictEqual(hits, []);
    },

    'focusmax and calmmax teach their biology levers': () => {
        const all = (id: string) => courseText(course(id)).map((t) => t.text).join('\n').toLowerCase();
        const focus = all('focusmax');
        for (const lever of ['adenosine', 'caffeine cutoff', 'green tea', 'morning outdoor light', 'micro-break',
            '6 m away', 'water before you focus', 'post-lunch dip', 'nsdr', 'nap', 'cold finish', 'co2', 'nicotine',
            'binaural', 'blue-light', 'dopamine detox', 'hyperventilation', '988']) {
            assert.ok(focus.includes(lever), `focusmax should cover: ${lever}`);
        }
        const calm = all('calmmax');
        for (const lever of ['cyclic sighing', 'box breathing', '6 breaths a minute', 'dive reflex', 'cold shower finish',
            'sauna', 'nsdr', 'muscle release', 'slow yoga', 'aerobic', 'nature walk', 'screens off', 'caffeine ceiling',
            '1-to-5', 'hrv', '988', 'samaritans 116 123']) {
            assert.ok(calm.includes(lever), `calmmax should cover: ${lever}`);
        }
    },

    'chapters and lessons are numbered in order with unique ids': () => {
        for (const id of AI_PROGRAM_COURSES) {
            const c = course(id);
            const ids = new Set<string>();
            c.chapters.forEach((ch, i) => {
                assert.strictEqual(ch.number, i + 1, `${id} chapter ${ch.id} number`);
                assert.ok(!ids.has(`ch:${ch.id}`), `${id}: duplicate chapter id ${ch.id}`);
                ids.add(`ch:${ch.id}`);
                assert.ok(ch.sections.length > 0, `${id} chapter ${ch.number} is empty`);
                ch.sections.forEach((s, j) => {
                    assert.strictEqual(s.number, `${ch.number}.${j + 1}`, `${id} ${s.id} number`);
                    assert.ok(!ids.has(s.id), `${id}: duplicate lesson id ${s.id}`);
                    ids.add(s.id);
                });
            });
        }
    },

    'lessons stay inside the schema limits (title 28, subtitle 110, 4 to 6 bullets of 90)': () => {
        const over: string[] = [];
        for (const id of AI_PROGRAM_COURSES) {
            for (const ch of course(id).chapters) {
                for (const s of ch.sections) {
                    const at = `${id} ${s.number}`;
                    if (s.title.length > 28) over.push(`${at} title ${s.title.length}: ${s.title}`);
                    if (s.subtitle.length > 110) over.push(`${at} subtitle ${s.subtitle.length}: ${s.subtitle}`);
                    if (s.bullets.length < 4 || s.bullets.length > 6) over.push(`${at} has ${s.bullets.length} bullets`);
                    for (const b of s.bullets) if (b.length > 90) over.push(`${at} bullet ${b.length}: ${b}`);
                }
            }
        }
        assert.deepStrictEqual(over, []);
    },

    'captions state the real chapter and lesson counts': () => {
        for (const id of AI_PROGRAM_COURSES) {
            const c = course(id);
            const m = (c.caption || '').match(/^(\d+) chapters · (\d+) lessons/);
            if (!m) continue;
            const lessons = c.chapters.reduce((n, ch) => n + ch.sections.length, 0);
            assert.strictEqual(Number(m[1]), c.chapters.length, `${id} caption chapters`);
            assert.strictEqual(Number(m[2]), lessons, `${id} caption lessons`);
        }
    },
};
