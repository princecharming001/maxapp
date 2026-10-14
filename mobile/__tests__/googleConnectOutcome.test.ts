import assert from 'assert';
import {
    connectOutcomeMessage,
    formatLastSynced,
    parseConnectRedirect,
} from '../lib/googleConnectOutcome';

export const tests = {
    'success redirect reads as connected': () => {
        assert.equal(parseConnectRedirect('cannon://google-connected?connected=1'), 'connected');
        assert.equal(parseConnectRedirect('exp://1.2.3.4:8081/--/google-connected?connected=1'), 'connected');
    },
    'backend error codes map to outcomes': () => {
        assert.equal(parseConnectRedirect('cannon://google-connected?error=denied'), 'denied');
        assert.equal(parseConnectRedirect('cannon://google-connected?error=no_calendar'), 'no_calendar');
        assert.equal(parseConnectRedirect('cannon://google-connected?error=failed'), 'failed');
        assert.equal(parseConnectRedirect('cannon://google-connected?error=something_new'), 'failed');
    },
    'no url means the poll decides': () => {
        assert.equal(parseConnectRedirect(undefined), 'unknown');
        assert.equal(parseConnectRedirect('cannon://google-connected'), 'unknown');
    },
    'only real failures get a message': () => {
        assert.equal(connectOutcomeMessage('connected'), null);
        assert.equal(connectOutcomeMessage('cancelled'), null);
        assert.equal(connectOutcomeMessage('unknown'), null);
        assert.ok(connectOutcomeMessage('denied'));
        assert.match(connectOutcomeMessage('no_calendar')!.body, /calendar box/);
        assert.ok(connectOutcomeMessage('failed'));
    },
    'last synced shows a date when it is not today': () => {
        assert.equal(formatLastSynced(null), null);
        assert.equal(formatLastSynced('not a date'), null);
        assert.match(formatLastSynced(new Date().toISOString())!, /^today /);
        assert.doesNotMatch(formatLastSynced('2020-01-05T10:00:00Z')!, /^today/);
    },
};
