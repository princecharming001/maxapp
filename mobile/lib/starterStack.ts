/**
 * starterStack — the "your first stack" preview shown at the end of the
 * onboarding intro, BEFORE the paywall.
 *
 * Pure + deterministic: goals × level × the user's real day in, a short list
 * of timed habits out. Nothing here is persisted as a schedule — the real plan
 * is built after purchase. The preview only has to be honest about two things:
 * the habits fit the time budget the level implies, and every one lands in a
 * real gap in their day (never inside work, never outside wake → bedtime).
 *
 * Copy rule: routines and timing only. No supplements, doses or treatment
 * claims (App Store 1.4.1 / FTC).
 */

export type BiohackGoal =
    | 'energy'
    | 'sleep'
    | 'focus'
    | 'stress'
    | 'training'
    | 'skin_hair'
    | 'longevity';

export type BiohackLevel = 'low' | 'medium' | 'high';

export const BIOHACK_GOALS: { id: BiohackGoal; label: string; tagline: string; icon: string }[] = [
    { id: 'energy', label: 'Energy', tagline: 'steadier energy all day', icon: 'flash-outline' },
    { id: 'sleep', label: 'Sleep', tagline: 'fall asleep faster, wake up rested', icon: 'moon-outline' },
    { id: 'focus', label: 'Focus', tagline: 'longer stretches of deep work', icon: 'locate-outline' },
    { id: 'stress', label: 'Stress', tagline: 'calmer days, quicker resets', icon: 'leaf-outline' },
    { id: 'training', label: 'Training and recovery', tagline: 'move more, recover better', icon: 'barbell-outline' },
    { id: 'skin_hair', label: 'Skin and hair', tagline: 'simple daily care that adds up', icon: 'sparkles-outline' },
    { id: 'longevity', label: 'Longevity basics', tagline: 'the habits that compound', icon: 'infinite-outline' },
];

export const MAX_GOALS = 2;

export const BIOHACK_LEVELS: { id: BiohackLevel; label: string; sub: string; minutes: number; habits: number }[] = [
    { id: 'low', label: 'Low', sub: 'two small habits, easy to keep on busy days', minutes: 10, habits: 2 },
    { id: 'medium', label: 'Medium', sub: 'a few habits spread through your day', minutes: 25, habits: 4 },
    { id: 'high', label: 'Hard', sub: 'the full stack, for days you can give it more', minutes: 45, habits: 6 },
];

/** The time slider: minutes a day the user commits, continuous within this range. */
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 60;
export const DEFAULT_MINUTES = 25;

/** The "how much can you give this" scale: named levels, not minutes. Each
 *  still carries a minute budget under the hood, because the planner fits
 *  habits into a daily budget. */
export const INTENSITY_LEVELS: { id: string; label: string; sub: string; minutes: number; bars: number }[] = [
    { id: 'minimal', label: 'Minimal', sub: 'one or two tiny habits, for packed days', minutes: 10, bars: 1 },
    { id: 'steady', label: 'Steady', sub: 'a few easy habits through your day', minutes: 25, bars: 2 },
    { id: 'committed', label: 'Committed', sub: 'a real routine, morning to night', minutes: 40, bars: 3 },
    { id: 'intense', label: 'Intense', sub: 'the full stack, for when you are all in', minutes: 60, bars: 4 },
];

/** The level a stored minute budget belongs to (older drafts saved minutes). */
export function intensityForMinutes(m: number): (typeof INTENSITY_LEVELS)[number] {
    return INTENSITY_LEVELS.reduce((best, l) => (Math.abs(l.minutes - m) < Math.abs(best.minutes - m) ? l : best));
}

/** Coarse level for a minute budget (drives the scheduler's intensity ramp). */
export function levelForMinutes(m: number): BiohackLevel {
    if (m <= 15) return 'low';
    if (m <= 35) return 'medium';
    return 'high';
}

/** How many habits a minute budget holds (5 min → 1 … 50+ min → 6). */
export function habitsForMinutes(m: number): number {
    return Math.max(1, Math.min(6, 1 + Math.floor(m / 10)));
}

/** Scheduler intensity token each level maps onto (backend `intensity_preference`). */
export const LEVEL_TO_INTENSITY: Record<BiohackLevel, 'chill' | 'standard' | 'sweatmode'> = {
    low: 'chill',
    medium: 'standard',
    high: 'sweatmode',
};

/** Legacy `effort_level` token, kept in sync for anything still reading it. */
export const LEVEL_TO_EFFORT: Record<BiohackLevel, 'light' | 'steady' | 'all_in'> = {
    low: 'light',
    medium: 'steady',
    high: 'all_in',
};

/**
 * Nearest existing program token per goal (the `priority_order` vocabulary the
 * scheduler's collision tie-break understands). Goals without a program yet
 * map to nothing — the token list only ever ranks programs that exist.
 */
export const GOAL_TO_PROGRAM_TOKENS: Record<BiohackGoal, string[]> = {
    energy: [],
    sleep: [],
    focus: [],
    stress: [],
    training: ['body'],
    skin_hair: ['skin', 'hair'],
    longevity: [],
};

/**
 * The AI program (maxx id) that serves each onboarding goal — what the app
 * opens when it nudges a user toward their #1 goal (e.g. the Home empty state
 * → that program's detail page). Ids match GET /api/maxes.
 */
export const GOAL_TO_MAXX: Record<BiohackGoal, string> = {
    sleep: 'sleepmax',
    energy: 'energymax',
    focus: 'focusmax',
    stress: 'calmmax',
    training: 'trainmax',
    skin_hair: 'skinhairmax',
    longevity: 'longevitymax',
};

/** The program for a raw goal id, or undefined for unknown/legacy goals. */
export function maxxForGoal(goal: unknown): string | undefined {
    const g = String(goal ?? '').toLowerCase().trim();
    return Object.prototype.hasOwnProperty.call(GOAL_TO_MAXX, g) ? GOAL_TO_MAXX[g as BiohackGoal] : undefined;
}

export function priorityTokensFor(goals: string[]): string[] {
    const out: string[] = [];
    for (const g of goals) {
        for (const t of GOAL_TO_PROGRAM_TOKENS[g as BiohackGoal] ?? []) {
            if (!out.includes(t)) out.push(t);
        }
    }
    return out;
}

/** Where in the day a habit wants to sit. Resolved against the user's real day. */
type Anchor =
    | 'wake'
    | 'get_ready'
    | 'before_work'
    | 'lunch'
    | 'afternoon'
    | 'after_work'
    | 'dinner'
    | 'workout'
    | 'wind_down'
    | 'pre_bed';

type Card = {
    id: string;
    title: string;
    minutes: number;
    why: string;
    how: string;
    anchor: Anchor;
    /** 1–10: what to keep first when the level's budget is tight. */
    value: number;
};

const CARDS: Record<BiohackGoal, Card[]> = {
    energy: [
        { id: 'morning_light', title: 'Morning light', minutes: 10, value: 10, anchor: 'wake', why: 'sets your body clock for the day', how: 'Step outside within an hour of waking. No sunglasses, phone in your pocket.' },
        { id: 'water_first', title: 'Water before coffee', minutes: 2, value: 7, anchor: 'wake', why: 'you wake up a little dehydrated', how: 'A full glass of water before anything else, a pinch of salt if you like.' },
        { id: 'movement_snack', title: 'Movement snack', minutes: 5, value: 6, anchor: 'afternoon', why: 'beats the afternoon slump', how: 'Stand up: 20 squats, 10 push-ups, a minute of stretching.' },
        { id: 'caffeine_cutoff', title: 'Last coffee', minutes: 1, value: 5, anchor: 'lunch', why: 'caffeine lingers for hours', how: 'Make this your final coffee or energy drink of the day.' },
    ],
    sleep: [
        { id: 'caffeine_cutoff', title: 'Last coffee', minutes: 1, value: 9, anchor: 'lunch', why: 'caffeine lingers for hours', how: 'Make this your final coffee or energy drink of the day.' },
        { id: 'dim_screens', title: 'Dim lights, screens down', minutes: 10, value: 10, anchor: 'wind_down', why: 'bright light delays sleepiness', how: 'Lamps instead of overhead lights. Phone on the charger outside reach.' },
        { id: 'morning_light', title: 'Morning light', minutes: 10, value: 8, anchor: 'wake', why: 'sets your body clock for the day', how: 'Step outside within an hour of waking. No sunglasses, phone in your pocket.' },
        { id: 'cool_room', title: 'Cool, dark room', minutes: 2, value: 6, anchor: 'pre_bed', why: 'a cooler room helps you stay asleep', how: 'Drop the thermostat a couple of degrees and close the blinds.' },
    ],
    focus: [
        { id: 'top_three', title: 'Pick your top 3', minutes: 5, value: 10, anchor: 'before_work', why: 'decide before the day decides for you', how: 'Write down the three things that would make today a win.' },
        { id: 'breathing_reset', title: 'Breathing reset', minutes: 3, value: 7, anchor: 'afternoon', why: 'a fast way to clear your head', how: 'Box breathing: in 4, hold 4, out 4, hold 4. Repeat for three minutes.' },
        { id: 'lunch_walk', title: 'Walk after lunch', minutes: 10, value: 8, anchor: 'lunch', why: 'a sharper afternoon', how: 'A ten-minute walk right after you eat, outside if you can.' },
        { id: 'shutdown', title: 'Shutdown ritual', minutes: 5, value: 5, anchor: 'after_work', why: 'stops work following you home', how: 'Close tabs, note tomorrow’s first task, say "done for today".' },
    ],
    stress: [
        { id: 'breathing_reset', title: 'Breathing reset', minutes: 3, value: 9, anchor: 'afternoon', why: 'a fast way to clear your head', how: 'Box breathing: in 4, hold 4, out 4, hold 4. Repeat for three minutes.' },
        { id: 'outside_walk', title: 'Walk outside', minutes: 15, value: 8, anchor: 'after_work', why: 'a real break between work and home', how: 'Fifteen minutes outside, no podcast, just walk.' },
        { id: 'three_lines', title: 'Write three lines', minutes: 5, value: 7, anchor: 'wind_down', why: 'gets the day out of your head', how: 'What happened, what’s on your mind, one thing that went well.' },
        { id: 'body_scan', title: 'Body scan', minutes: 10, value: 6, anchor: 'pre_bed', why: 'helps you switch off', how: 'Lie down, eyes closed, and slowly relax from your feet to your face.' },
    ],
    training: [
        { id: 'mobility', title: 'Morning mobility', minutes: 8, value: 8, anchor: 'get_ready', why: 'loosens you up for the day', how: 'Hip openers, cat-cow, shoulder circles. Slow and easy.' },
        { id: 'training_session', title: 'Training session', minutes: 30, value: 10, anchor: 'workout', why: 'strength is the base for everything else', how: 'Full-body strength: squat, push, pull, hinge. Three rounds.' },
        { id: 'protein_breakfast', title: 'Protein-first breakfast', minutes: 5, value: 6, anchor: 'get_ready', why: 'fuels recovery and keeps you full', how: 'Build breakfast around eggs, yogurt or another protein you like.' },
        { id: 'stretch_down', title: 'Evening stretch', minutes: 8, value: 5, anchor: 'wind_down', why: 'recovery starts before bed', how: 'Hamstrings, hips and chest. Hold each stretch for 30 seconds.' },
    ],
    skin_hair: [
        { id: 'am_skin', title: 'Cleanse and SPF', minutes: 5, value: 10, anchor: 'get_ready', why: 'daily sun protection matters most', how: 'Gentle cleanser, moisturizer, then sunscreen as the last step.' },
        { id: 'pm_skin', title: 'Evening cleanse', minutes: 5, value: 8, anchor: 'wind_down', why: 'washes off the day', how: 'Cleanse, then moisturize. Keep it simple and consistent.' },
        { id: 'scalp_massage', title: 'Scalp massage', minutes: 4, value: 6, anchor: 'wind_down', why: 'a calm habit for your scalp', how: 'Fingertips, small circles, front to back for a few minutes.' },
    ],
    longevity: [
        { id: 'zone2_walk', title: 'Brisk walk', minutes: 20, value: 10, anchor: 'after_work', why: 'easy cardio adds up over years', how: 'A pace where you can talk but not sing. Twenty minutes.' },
        { id: 'morning_light', title: 'Morning light', minutes: 10, value: 7, anchor: 'wake', why: 'sets your body clock for the day', how: 'Step outside within an hour of waking. No sunglasses, phone in your pocket.' },
        { id: 'strength_snack', title: 'Strength snack', minutes: 5, value: 8, anchor: 'afternoon', why: 'muscle is a long-term asset', how: 'Two sets of squats and push-ups, wherever you are.' },
        { id: 'dinner_walk', title: 'Walk after dinner', minutes: 10, value: 6, anchor: 'dinner', why: 'an easy win after your biggest meal', how: 'Ten minutes around the block after you eat.' },
    ],
};

/** The parts of the user's day the preview places habits around (minutes from midnight). */
export type DayShape = {
    wakeMin: number;
    getReadyMin: number;
    windDownMin: number;
    bedMin: number;
    works: boolean;
    workStartMin: number;
    workEndMin: number;
    commuteMin: number;
    lunchMin?: number;
    dinnerMin?: number;
    /** When they usually work out; training habits land there. */
    workoutMin?: number;
};

export type StackItem = {
    id: string;
    title: string;
    minutes: number;
    why: string;
    how: string;
    /** Minutes from midnight. */
    timeMin: number;
};

// A wind-down / bedtime past midnight is treated as later the same evening so
// ordering and the "before bed" ceiling stay correct for night owls.
const DAY_BOUNDARY = 4 * 60;
const eve = (m: number) => (m < DAY_BOUNDARY ? m + 1440 : m);

function anchorTime(anchor: Anchor, d: DayShape): number {
    const wake = d.wakeMin;
    const bed = eve(d.bedMin);
    const workStart = d.works ? d.workStartMin : null;
    const workEnd = d.works ? d.workEndMin : null;
    const commute = d.works ? Math.max(0, d.commuteMin) : 0;
    switch (anchor) {
        case 'wake':
            return wake + 10;
        case 'get_ready':
            return Math.max(wake + 15, d.getReadyMin);
        case 'before_work':
            return workStart != null ? workStart - commute - 20 : wake + 75;
        case 'lunch':
            return d.lunchMin ?? 12 * 60 + 30;
        case 'afternoon':
            return 15 * 60;
        case 'after_work':
            return workEnd != null ? workEnd + commute + 20 : 17 * 60 + 30;
        case 'dinner':
            return (d.dinnerMin ?? 19 * 60) + 30;
        case 'workout':
            return d.workoutMin ?? (workEnd != null ? workEnd + commute + 20 : 17 * 60 + 30);
        case 'wind_down':
            return eve(d.windDownMin);
        case 'pre_bed':
            return bed - 15;
    }
}

/** Habits that are fine during a working day: short breaks at a desk or at lunch. */
const WORK_BREAK_OK = new Set<Anchor>(['lunch', 'afternoon', 'workout']);

/**
 * Pick and place the stack. Round-robins the goals by card value so two goals
 * share the budget, keeps adding while the level's habit count and minute
 * budget allow, then resolves each card to a real time in the user's day.
 */
export function buildStarterStack(
    goals: string[],
    budgetIn: BiohackLevel | number,
    day: DayShape,
    opts: { maxPrograms?: number } = {},
): StackItem[] {
    // A level ('low' | 'medium' | 'high') or an exact minutes-a-day budget.
    const preset = typeof budgetIn === 'string' ? BIOHACK_LEVELS.find((l) => l.id === budgetIn) ?? BIOHACK_LEVELS[1] : null;
    const base = preset ?? { minutes: budgetIn as number, habits: habitsForMinutes(budgetIn as number) };
    const picked = goals.filter((g): g is BiohackGoal => g in CARDS).slice(0, opts.maxPrograms ?? MAX_GOALS);
    if (picked.length === 0) return [];
    // Each program past the first two (the preview lets people try more) adds a
    // habit and a little time, the way stacking another program does in the app.
    const extra = Math.max(0, picked.length - MAX_GOALS);
    const lvl = { minutes: base.minutes + extra * 10, habits: Math.min(9, base.habits + extra) };

    const queues = picked.map((g) => [...CARDS[g]].sort((a, b) => b.value - a.value));
    const chosen: Card[] = [];
    let minutes = 0;
    // A little headroom so a high-value 30-minute session still fits a 25+ budget.
    const budget = lvl.minutes * 1.25;

    let progressed = true;
    while (chosen.length < lvl.habits && progressed) {
        progressed = false;
        for (const q of queues) {
            if (chosen.length >= lvl.habits) break;
            while (q.length) {
                const c = q.shift()!;
                if (chosen.some((x) => x.id === c.id)) continue;
                // The first habit always fits, so a tight level never comes back empty.
                if (chosen.length > 0 && minutes + c.minutes > budget) continue;
                chosen.push(c);
                minutes += c.minutes;
                progressed = true;
                break;
            }
        }
    }

    const wake = day.wakeMin;
    const bed = eve(day.bedMin);
    const placed: StackItem[] = [];
    for (const c of chosen) {
        let t = anchorTime(c.anchor, day);
        // Inside work hours and not a break-sized habit: move it after work.
        if (
            day.works
            && !WORK_BREAK_OK.has(c.anchor)
            && t + c.minutes > day.workStartMin - day.commuteMin
            && t < day.workEndMin + day.commuteMin
        ) {
            t = day.workEndMin + day.commuteMin + 20;
        }
        // Keep it inside the waking day.
        t = Math.max(wake + 5, Math.min(bed - c.minutes - 5, t));
        // Nudge past any habit already at that time so nothing overlaps.
        for (const p of [...placed].sort((a, b) => a.timeMin - b.timeMin)) {
            if (t < p.timeMin + p.minutes && p.timeMin < t + c.minutes) {
                t = p.timeMin + p.minutes + 5;
            }
        }
        placed.push({ id: c.id, title: c.title, minutes: c.minutes, why: c.why, how: c.how, timeMin: Math.round(t / 5) * 5 });
    }
    return placed.sort((a, b) => a.timeMin - b.timeMin).map((p) => ({ ...p, timeMin: p.timeMin % 1440 }));
}

export function stackMinutes(items: StackItem[]): number {
    return items.reduce((s, i) => s + i.minutes, 0);
}
