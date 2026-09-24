import assert from 'assert';
import { __resetOverlayTurns, isOverlayUp, setOverlayUp } from '../lib/overlayTurns';

export const tests = {
    'overlays start down and flip independently': () => {
        __resetOverlayTurns();
        assert.equal(isOverlayUp('celebration'), false);
        assert.equal(isOverlayUp('primer'), false);
        setOverlayUp('celebration', true);
        assert.equal(isOverlayUp('celebration'), true);
        assert.equal(isOverlayUp('primer'), false);
        setOverlayUp('celebration', false);
        assert.equal(isOverlayUp('celebration'), false);
    },
    'setting the same value twice is a no-op': () => {
        __resetOverlayTurns();
        setOverlayUp('primer', true);
        setOverlayUp('primer', true);
        assert.equal(isOverlayUp('primer'), true);
        __resetOverlayTurns();
    },
};
