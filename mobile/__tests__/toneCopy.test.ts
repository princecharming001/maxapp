import assert from 'assert';
import { toneCopy, normalizePersonaId } from '../lib/toneCopy';

const variants = {
    default: 'Keep going.',
    gentle: 'You showed up — that counts.',
    hardcore: 'No days off. Move.',
    influencer: "Let's gooo 🔥",
};

export const tests = {
    'normalizePersonaId maps known + falls back': () => {
        assert.equal(normalizePersonaId('gentle'), 'gentle');
        assert.equal(normalizePersonaId('HARDCORE'), 'hardcore');
        assert.equal(normalizePersonaId('influencer'), 'influencer');
        assert.equal(normalizePersonaId('default'), 'default');
        assert.equal(normalizePersonaId(undefined), 'default');
        assert.equal(normalizePersonaId('bogus'), 'default');
        assert.equal(normalizePersonaId(null), 'default');
    },

    'toneCopy returns the matching variant': () => {
        assert.equal(toneCopy('gentle', variants), variants.gentle);
        assert.equal(toneCopy('hardcore', variants), variants.hardcore);
        assert.equal(toneCopy('influencer', variants), variants.influencer);
    },

    'toneCopy falls back to default for default/unknown/missing': () => {
        assert.equal(toneCopy('default', variants), variants.default);
        assert.equal(toneCopy('bogus', variants), variants.default);
        assert.equal(toneCopy(undefined, variants), variants.default);
        assert.equal(toneCopy(null, variants), variants.default);
    },

    'toneCopy falls back to default when the variant is absent': () => {
        const partial = { default: 'D', hardcore: 'H' };
        assert.equal(toneCopy('gentle', partial), 'D');
        assert.equal(toneCopy('hardcore', partial), 'H');
    },

    'toneCopy is deterministic (same input → same output)': () => {
        assert.equal(toneCopy('gentle', variants), toneCopy('gentle', variants));
    },
};
