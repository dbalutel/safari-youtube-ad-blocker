const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlayerRequest,
  addAdFreeParam,
  pruneAdFields,
  prunePlayerJson,
} = require('../extension/page.js');

test('isPlayerRequest matches only the player endpoint', () => {
  assert.equal(isPlayerRequest('https://www.youtube.com/youtubei/v1/player?prettyPrint=false'), true);
  assert.equal(isPlayerRequest('/youtubei/v1/player'), true);
  assert.equal(isPlayerRequest('https://www.youtube.com/youtubei/v1/get_watch'), false);
  assert.equal(isPlayerRequest('https://example.com/youtubei/v1/player'), false);
});

test('addAdFreeParam prepends the marker once', () => {
  const body = '{"context":{"contentPlaybackContext":{}},"params":"abc"}';
  assert.equal(
    addAdFreeParam(body),
    '{"context":{"contentPlaybackContext":{}},"params":"yAEBabc"}',
  );
  assert.equal(addAdFreeParam(addAdFreeParam(body)), addAdFreeParam(body));
  assert.equal(addAdFreeParam('{"context":{}}'), '{"context":{}}');
  assert.equal(addAdFreeParam('not json'), 'not json');
});

test('pruneAdFields removes ad keys at every depth without mutating the input', () => {
  const input = {
    adPlacements: [{ x: 1 }],
    playerAds: [],
    videoDetails: { videoId: 'abc' },
    nested: { adSlots: [], keep: 1 },
    list: [{ adBreakHeartbeatParams: 'x', keep: 2 }],
  };
  assert.deepEqual(pruneAdFields(input), {
    videoDetails: { videoId: 'abc' },
    nested: { keep: 1 },
    list: [{ keep: 2 }],
  });
  assert.deepEqual(input.adPlacements, [{ x: 1 }]);
  assert.equal(pruneAdFields(null), null);
  assert.equal(pruneAdFields('x'), 'x');
});

test('prunePlayerJson prunes ad JSON and leaves clean or malformed JSON untouched', () => {
  assert.deepEqual(
    JSON.parse(prunePlayerJson('{"adPlacements":[1],"videoDetails":{"videoId":"abc"}}')),
    { videoDetails: { videoId: 'abc' } },
  );
  assert.equal(
    prunePlayerJson('{"videoDetails":{"videoId":"abc"}}'),
    '{"videoDetails":{"videoId":"abc"}}',
  );
  assert.equal(prunePlayerJson('not json'), 'not json');
});
