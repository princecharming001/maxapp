import assert from 'assert';
import { achievementXp } from '../lib/achievementXp';

export const tests = {
    'uses the server-sent xp when present': () => {
        assert.equal(achievementXp({ code: 'streak_7', tier: 'silver', xp: 75 }), 75);
        assert.equal(achievementXp({ code: 'first_routine', tier: 'bronze', xp: 10 }), 10);
    },
    'setup badges pay 10 (they used to show +50)': () => {
        for (const code of ['first_routine', 'first_scan', 'two_maxxes', 'knows_me']) {
            assert.equal(achievementXp({ code, tier: 'bronze' }), 10);
        }
    },
    'tier fallback mirrors the backend table': () => {
        assert.equal(achievementXp({ code: 'streak_3', tier: 'bronze' }), 25);
        assert.equal(achievementXp({ code: 'tasks_50', tier: 'silver' }), 75);
        assert.equal(achievementXp({ code: 'streak_30', tier: 'gold' }), 200);
        assert.equal(achievementXp({ code: 'streak_100', tier: 'gold' }), 500);
        assert.equal(achievementXp({ code: 'mystery', tier: null }), 25);
    },
    'ignores junk xp values': () => {
        assert.equal(achievementXp({ code: 'streak_3', tier: 'bronze', xp: NaN }), 25);
        assert.equal(achievementXp({ code: 'streak_3', tier: 'bronze', xp: 0 }), 25);
        assert.equal(achievementXp({ code: 'streak_3', tier: 'bronze', xp: null }), 25);
    },
};
