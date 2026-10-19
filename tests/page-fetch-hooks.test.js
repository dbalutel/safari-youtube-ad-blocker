const test = require('node:test');
const assert = require('node:assert/strict');
const { installFetchHooks } = require('../extension/page.js');

function fakeWindow(fetchImpl) {
  const events = [];
  return {
    events,
    Response,
    CustomEvent: class {
      constructor(type) { this.type = type; }
    },
    document: {
      dispatchEvent(event) { events.push(event.type); },
    },
    XMLHttpRequest: class {},
    fetch: fetchImpl,
  };
}

test('rewrites a player request and prunes its response', async () => {
  let seenInit;
  const win = fakeWindow(async (input, init) => {
    seenInit = init;
    return new Response(
      JSON.stringify({ adPlacements: [1], videoDetails: { videoId: 'abc' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  installFetchHooks(win);

  const response = await win.fetch('/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    body: '{"context":{"contentPlaybackContext":{}},"params":"abc"}',
  });

  assert.equal(
    seenInit.body,
    '{"context":{"contentPlaybackContext":{}},"params":"yAEBabc"}',
  );
  assert.deepEqual(await response.json(), { videoDetails: { videoId: 'abc' } });
  assert.equal(win.events.length, 2);
});

test('leaves a non-player response untouched and does not notify', async () => {
  const win = fakeWindow(async () => new Response('{"adPlacements":[1]}'));
  installFetchHooks(win);

  const response = await win.fetch('/youtubei/v1/get_watch');

  assert.deepEqual(await response.json(), { adPlacements: [1] });
  assert.deepEqual(win.events, []);
});

test('passes malformed player JSON through untouched', async () => {
  const win = fakeWindow(async () => new Response('not json'));
  installFetchHooks(win);

  assert.equal(await (await win.fetch('/youtubei/v1/player')).text(), 'not json');
  assert.deepEqual(win.events, []);
});
