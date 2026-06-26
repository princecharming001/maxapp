import assert from 'assert';
import {
    derivePersonalization,
    greetingForHour,
    rankByGoals,
    experienceTier,
    streakMilestone,
    archetypeLine,
} from '../lib/personalization';

const idOf = (x: { id: string }) => x.id;

export const tests = {
    'rankByGoals: matches come first in goal-priority order, stable rest': () => {
        const items = [
            { id: 'hairmax' },
            { id: 'fitmax' },
            { id: 'skinmax' },
            { id: 'bonemax' },
        ];
        const out = rankByGoals(items, ['skinmax', 'fitmax'], idOf).map(idOf);
        assert.deepEqual(out, ['skinmax', 'fitmax', 'hairmax', 'bonemax']);
    },

    'rankByGoals: reorder only — every item preserved, none added': () => {
        const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const out = rankByGoals(items, ['c'], idOf);
        assert.equal(out.length, items.length);
        assert.deepEqual(out.map(idOf).sort(), ['a', 'b', 'c']);
    },

    'rankByGoals: no goals → original order (cold start)': () => {
        const items = [{ id: 'b' }, { id: 'a' }];
        assert.deepEqual(rankByGoals(items, [], idOf).map(idOf), ['b', 'a']);
    },

    'archetypeLine only when archetype present; factual': () => {
        assert.equal(archetypeLine('', 7), undefined);
        assert.equal(archetypeLine(undefined), undefined);
        assert.equal(archetypeLine(null, 5), undefined);
        const withScore = archetypeLine('The Striker', 7.2);
        assert.ok(withScore && withScore.includes('The Striker'));
        assert.ok(withScore && withScore.includes('7.2/10'));
        const noScore = archetypeLine('The Striker');
        assert.equal(noScore, 'Your features read closest to The Striker.');
    },

    'streakMilestone fires only on 3/7/30/100': () => {
        assert.equal(streakMilestone(3), 3);
        assert.equal(streakMilestone(7), 7);
        assert.equal(streakMilestone(30), 30);
        assert.equal(streakMilestone(100), 100);
        // non-milestones
        for (const n of [0, 1, 2, 4, 6, 8, 29, 31, 99, 101, 365]) {
            assert.equal(streakMilestone(n), null);
        }
        assert.equal(streakMilestone(undefined), null);
        assert.equal(streakMilestone(NaN), null);
        assert.equal(streakMilestone(7.5), null);
    },

    'experienceTier normalizes + unknown falls through': () => {
        assert.equal(experienceTier('beginner'), 'beginner');
        assert.equal(experienceTier('Just starting out'), 'beginner');
        assert.equal(experienceTier('intermediate'), 'intermediate');
        assert.equal(experienceTier('Advanced'), 'advanced');
        assert.equal(experienceTier('expert'), 'advanced');
        assert.equal(experienceTier(''), 'unknown');
        assert.equal(experienceTier(undefined), 'unknown');
        assert.equal(experienceTier('🤷 dunno'), 'unknown');
    },

    'rankByGoals: case-insensitive id match + deterministic': () => {
        const items = [{ id: 'Fitmax' }, { id: 'SKINMAX' }];
        const a = rankByGoals(items, ['skinmax'], idOf).map(idOf);
        const b = rankByGoals(items, ['skinmax'], idOf).map(idOf);
        assert.deepEqual(a, ['SKINMAX', 'Fitmax']);
        assert.deepEqual(a, b);
    },

    'greetingForHour buckets the day': () => {
        assert.equal(greetingForHour(0), 'Good morning');
        assert.equal(greetingForHour(8), 'Good morning');
        assert.equal(greetingForHour(11), 'Good morning');
        assert.equal(greetingForHour(12), 'Good afternoon');
        assert.equal(greetingForHour(16), 'Good afternoon');
        assert.equal(greetingForHour(17), 'Good evening');
        assert.equal(greetingForHour(23), 'Good evening');
        // non-finite guarded
        assert.equal(greetingForHour(NaN), 'Good morning');
    },

    'cold start: null user → generic-safe, no undefined leakage': () => {
        const p = derivePersonalization(null, 9);
        assert.equal(p.firstName, undefined);
        assert.equal(p.greeting, 'Good morning');
        assert.equal(p.personaId, 'default');
        assert.equal(p.primaryGoalLabel, undefined);
        assert.deepEqual(p.goalLabels, []);
        assert.deepEqual(p.goalIds, []);
        assert.equal(p.topValue, undefined);
        assert.equal(p.topMotivation, undefined);
        assert.equal(p.archetype, undefined);
        assert.equal(p.streakDays, 0);
        assert.equal(p.experienceLevel, undefined);
    },

    'empty onboarding object behaves like cold start': () => {
        const p = derivePersonalization({ onboarding: {}, profile: {} }, 13);
        assert.equal(p.firstName, undefined);
        assert.deepEqual(p.goalLabels, []);
        assert.equal(p.streakDays, 0);
        assert.equal(p.personaId, 'default');
    },

    'derives name, persona, goals, streak, archetype, experience': () => {
        const p = derivePersonalization(
            {
                first_name: '  Anish ',
                coaching_tone: 'hardcore',
                onboarding: {
                    goals: ['skinmax', 'fitmax', 'skinmax'],
                    experience_level: 'advanced',
                    facial_scan_summary: { archetype: 'The Striker' },
                },
                profile: { streak_days: 7 },
            },
            18,
        );
        assert.equal(p.firstName, 'Anish');
        assert.equal(p.greeting, 'Good evening');
        assert.equal(p.personaId, 'hardcore');
        assert.deepEqual(p.goalIds, ['skinmax', 'fitmax']); // deduped, ordered
        assert.equal(p.primaryGoalLabel, 'Skinmax');
        assert.equal(p.goalLabels[1], 'Fitmax');
        assert.equal(p.archetype, 'The Striker');
        assert.equal(p.streakDays, 7);
        assert.equal(p.experienceLevel, 'advanced');
    },

    'topValue / topMotivation only when explicitly present': () => {
        const none = derivePersonalization({ onboarding: {} }, 9);
        assert.equal(none.topValue, undefined);
        assert.equal(none.topMotivation, undefined);

        const some = derivePersonalization(
            { onboarding: { values: ['confidence', 'discipline'], motivations: 'feel better in photos' } },
            9,
        );
        assert.equal(some.topValue, 'confidence');
        assert.equal(some.topMotivation, 'feel better in photos');

        // empty strings/arrays must not leak
        const empties = derivePersonalization({ onboarding: { values: ['  ', ''], motivations: '' } }, 9);
        assert.equal(empties.topValue, undefined);
        assert.equal(empties.topMotivation, undefined);
    },

    'bad streak value coerces to 0': () => {
        const p = derivePersonalization({ profile: { streak_days: NaN } }, 9);
        assert.equal(p.streakDays, 0);
    },

    'deterministic for fixed inputs': () => {
        const u = { first_name: 'Sam', onboarding: { goals: ['hairmax'] } };
        assert.deepEqual(derivePersonalization(u, 10), derivePersonalization(u, 10));
    },
};
