const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installInlineResponseHook,
  installPageHooks,
} = require('../extension/page.js');

function fakeWindow(fetchImpl = async () => new Response('{}')) {
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

test('prunes an inline player response and future assignments', () => {
  const win = fakeWindow();
  installInlineResponseHook(win);

  win.ytInitialPlayerResponse = {
    adPlacements: [1],
    videoDetails: { videoId: 'abc' },
  };
  assert.deepEqual(win.ytInitialPlayerResponse, { videoDetails: { videoId: 'abc' } });

  win.ytInitialPlayerResponse = { playerAds: [], videoDetails: { videoId: 'def' } };
  assert.deepEqual(win.ytInitialPlayerResponse, { videoDetails: { videoId: 'def' } });
  assert.equal(win.events.length, 2);
});

test('does not notify for a clean inline response', () => {
  const win = fakeWindow();
  installInlineResponseHook(win);

  win.ytInitialPlayerResponse = { videoDetails: { videoId: 'abc' } };

  assert.deepEqual(win.ytInitialPlayerResponse, { videoDetails: { videoId: 'abc' } });
  assert.deepEqual(win.events, []);
});

test('installPageHooks installs both hooks', async () => {
  const win = fakeWindow(async () => new Response('{"adSlots":[1],"videoDetails":{}}'));
  installPageHooks(win);

  win.ytInitialPlayerResponse = { adPlacements: [1], videoDetails: {} };
  assert.deepEqual(win.ytInitialPlayerResponse, { videoDetails: {} });

  const response = await win.fetch('/youtubei/v1/player');
  assert.deepEqual(await response.json(), { videoDetails: {} });
  assert.equal(win.events.length, 2);
});
