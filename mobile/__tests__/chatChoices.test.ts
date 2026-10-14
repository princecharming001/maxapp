/**
 * Multi-select chat chips (lib/chatChoices).
 *
 * Pins: "None" is exclusive — the sim sent "None, Pregnant or recently gave
 * birth" to the Fitmax intake because both stayed selected.
 */
import assert from 'assert';
import { isExclusiveChoice, toggleChoice } from '../lib/chatChoices';

export const tests = {
    'none-like options are exclusive': () => {
        for (const c of ['None', 'none of these', 'No', 'Nothing', 'Prefer not to say', 'Not really']) {
            assert.ok(isExclusiveChoice(c), c);
        }
        for (const c of ['Heart or blood pressure condition', 'Noon–3 pm', 'Nonstop travel']) {
            assert.ok(!isExclusiveChoice(c), c);
        }
    },

    'picking None clears the rest, picking an answer clears None': () => {
        let s = toggleChoice(new Set(), 'Current pain or injury');
        s = toggleChoice(s, 'Heart or blood pressure condition');
        assert.deepStrictEqual([...s].sort(), ['Current pain or injury', 'Heart or blood pressure condition']);
        s = toggleChoice(s, 'None');
        assert.deepStrictEqual([...s], ['None']);
        s = toggleChoice(s, 'Pregnant or recently gave birth');
        assert.deepStrictEqual([...s], ['Pregnant or recently gave birth']);
        s = toggleChoice(s, 'Pregnant or recently gave birth');
        assert.deepStrictEqual([...s], []);
    },
};
