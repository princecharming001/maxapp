import assert from 'assert';
import { derivePersonalization, greetingForHour } from '../lib/personalization';

export const tests = {
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
