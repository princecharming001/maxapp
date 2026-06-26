import assert from 'assert';
import { parseReferralCode } from '../lib/referralLink';

export const tests = {
    'parses scheme path form': () => {
        assert.equal(parseReferralCode('maxapp://referral/ANISH20'), 'ANISH20');
        assert.equal(parseReferralCode('maxapp://referral/anish20'), 'ANISH20');
    },
    'parses https path form': () => {
        assert.equal(parseReferralCode('https://usemaxapp.com/referral/VIP2024'), 'VIP2024');
    },
    'parses query param forms': () => {
        assert.equal(parseReferralCode('maxapp://pay?code=save20'), 'SAVE20');
        assert.equal(parseReferralCode('https://x.com/join?ref=Friend-1'), 'FRIEND1');
    },
    'strips noise + url-decodes': () => {
        assert.equal(parseReferralCode('maxapp://referral/AN%49SH'), 'ANISH'); // %49 = I
        assert.equal(parseReferralCode('maxapp://referral/a_b-c'), 'ABC');
    },
    'returns null for no code': () => {
        assert.equal(parseReferralCode('maxapp://home'), null);
        assert.equal(parseReferralCode(''), null);
        assert.equal(parseReferralCode(null), null);
        assert.equal(parseReferralCode(undefined), null);
    },
};
