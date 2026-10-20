/**
 * PostHog privacy rules (lib/posthog): API errors carry an endpoint PATTERN
 * (ids stripped), and the coach chat / task guides are never recorded.
 */
import assert from 'assert';
import { endpointPattern, UNRECORDED_SCREENS, PH_AUTOCAPTURE } from '../lib/posthog';

export const tests = {
    'endpoint ids are stripped': () => {
        assert.strictEqual(
            endpointPattern('https://maxapp-api-va.onrender.com/api/schedules/6b1f2c3d-aaaa-bbbb-cccc-123456789abc/tasks/9c2e8f10-1111-2222-3333-444455556666/guide?x=1'),
            '/api/schedules/:id/tasks/:id/guide',
        );
        assert.strictEqual(endpointPattern('/users/me'), '/users/me');
        assert.strictEqual(endpointPattern('/forums/threads/12345'), '/forums/threads/:id');
    },
    'health screens are never recorded': () => {
        for (const s of ['Chat', 'TaskGuide', 'ChannelChat', 'AdminUserChat']) assert.ok(UNRECORDED_SCREENS.has(s), s);
        assert.ok(!UNRECORDED_SCREENS.has('Home'));
    },
    'touch autocapture keeps text and labels out': () => {
        assert.deepStrictEqual([...PH_AUTOCAPTURE.propsToCapture], ['testID', 'ph-label']);
        assert.strictEqual(PH_AUTOCAPTURE.captureScreens, false);
    },
};
