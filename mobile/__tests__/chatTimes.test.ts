import assert from 'assert';
import { clock12, formatTime12, normalizeChatTimes } from '../lib/chatTimes';

export const tests = {
    'clock12 covers midnight, noon and the afternoon': () => {
        assert.strictEqual(clock12(0, 5), '12:05 AM');
        assert.strictEqual(clock12(12, 0), '12:00 PM');
        assert.strictEqual(clock12(16, 15), '4:15 PM');
        assert.strictEqual(clock12(7, 30), '7:30 AM');
    },

    'formatTime12 reads 24h fields and am/pm tokens, passes the rest through': () => {
        assert.strictEqual(formatTime12('07:00'), '7:00 AM');
        assert.strictEqual(formatTime12('19:30'), '7:30 PM');
        assert.strictEqual(formatTime12('5am'), '5:00 AM');
        assert.strictEqual(formatTime12('5:30 p.m.'), '5:30 PM');
        assert.strictEqual(formatTime12('12am'), '12:00 AM');
        assert.strictEqual(formatTime12('evening'), 'evening');
        assert.strictEqual(formatTime12('25:00'), '25:00');
        assert.strictEqual(formatTime12(null), '');
    },

    'chat prose: 24h tokens and am/pm tokens become one style': () => {
        assert.strictEqual(
            normalizeChatTimes('No caffeine after 16:15. Wake at 07:00, light by 7:30am.'),
            'No caffeine after 4:15 PM. Wake at 7:00 AM, light by 7:30 AM.',
        );
        assert.strictEqual(normalizeChatTimes('Lights out at 11pm, or 10:30 PM'), 'Lights out at 11:00 PM, or 10:30 PM');
        assert.strictEqual(normalizeChatTimes('Work 09:00-17:00'), 'Work 9:00 AM-5:00 PM');
        assert.strictEqual(normalizeChatTimes('**8am** walk'), '**8:00 AM** walk');
    },

    'ambiguous bare times stay as written unless the text is 24h-style': () => {
        // The coach's "6:30" / "10:30" with no am/pm could mean either.
        assert.strictEqual(normalizeChatTimes('Dinner at 6:30, bed at 10:30'), 'Dinner at 6:30, bed at 10:30');
        // A reply that is clearly 24h reads its 10-12 hours as 24h too.
        assert.strictEqual(normalizeChatTimes('Wind down 21:30, sleep 10:30? no: 22:30'), 'Wind down 9:30 PM, sleep 10:30 AM? no: 10:30 PM');
    },

    'sentence-ending a.m. keeps its full stop': () => {
        assert.strictEqual(normalizeChatTimes('Wake at 5 a.m. Then water.'), 'Wake at 5:00 AM. Then water.');
        assert.strictEqual(normalizeChatTimes('Wake at 5 a.m.'), 'Wake at 5:00 AM.');
    },

    'code, urls, ratios, timestamps and words are untouched': () => {
        assert.strictEqual(normalizeChatTimes('Run `cron 16:00` now'), 'Run `cron 16:00` now');
        assert.strictEqual(normalizeChatTimes('```\nat 16:00\n```'), '```\nat 16:00\n```');
        assert.strictEqual(normalizeChatTimes('see https://x.com/a?t=16:00 ok'), 'see https://x.com/a?t=16:00 ok');
        assert.strictEqual(normalizeChatTimes('mix 1:1 with water'), 'mix 1:1 with water');
        assert.strictEqual(normalizeChatTimes('at 2026-10-18T16:00'), 'at 2026-10-18T16:00');
        assert.strictEqual(normalizeChatTimes('12:30:45 elapsed'), '12:30:45 elapsed');
        assert.strictEqual(normalizeChatTimes('I am 2 amps short'), 'I am 2 amps short');
        assert.strictEqual(normalizeChatTimes('no digits here'), 'no digits here');
        assert.strictEqual(normalizeChatTimes(''), '');
    },
};
