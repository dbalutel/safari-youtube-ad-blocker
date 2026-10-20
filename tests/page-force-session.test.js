const test = require('node:test');
const assert = require('node:assert/strict');
const { forceAdFreeSession } = require('../extension/page.js');

function fakeWindow({ response, videoData, adShowing = false } = {}) {
  const calls = { cancel: 0, load: [] };
  const adElement = adShowing ? {} : null;
  const player = {
    getPlayerResponse: () => response,
    getVideoData: () => videoData,
    cancelPlayback: () => { calls.cancel += 1; },
    loadVideoById: (id) => { calls.load.push(id); },
  };
  return {
    calls,
    player,
    document: {
      getElementById: (id) => (id === 'movie_player' ? player : null),
      querySelector: (selector) => (selector.includes('ad-showing') ? adElement : null),
    },
    location: { href: 'https://www.youtube.com/watch?v=abc' },
  };
}

test('forces one ad-free session for a video with ad instructions', () => {
  const videoData = { video_id: 'abc' };
  const win = fakeWindow({
    response: { videoDetails: { videoId: 'abc' }, adPlacements: [{ x: 1 }] },
    videoData,
  });

  assert.equal(forceAdFreeSession(win), true);
  assert.equal(videoData.isInlinePlaybackNoAd, true);
  assert.equal(win.calls.cancel, 1);
  assert.deepEqual(win.calls.load, ['abc']);
  assert.equal(win.__ytAdBlockSeenVideos.has('abc'), true);

  assert.equal(forceAdFreeSession(win), false);
  assert.equal(win.calls.cancel, 1);
  assert.deepEqual(win.calls.load, ['abc']);
});

test('does nothing when the player response has no ads', () => {
  const win = fakeWindow({
    response: { videoDetails: { videoId: 'abc' } },
    videoData: { video_id: 'abc' },
  });

  assert.equal(forceAdFreeSession(win), false);
  assert.equal(win.calls.cancel, 0);
  assert.deepEqual(win.calls.load, []);
  assert.equal(win.__ytAdBlockSeenVideos.has('abc'), true);
});

test('does not force again for a video that was already checked', () => {
  const win = fakeWindow({
    response: { videoDetails: { videoId: 'abc' } },
    videoData: { video_id: 'abc' },
  });

  assert.equal(forceAdFreeSession(win), false);

  win.player.getPlayerResponse = () => ({
    videoDetails: { videoId: 'abc' },
    adPlacements: [{ x: 1 }],
  });
  assert.equal(forceAdFreeSession(win), false);
  assert.deepEqual(win.calls.load, []);
});

test('does nothing without a player', () => {
  const win = {
    document: { getElementById: () => null, querySelector: () => null },
    location: { href: 'https://www.youtube.com/watch?v=abc' },
  };

  assert.equal(forceAdFreeSession(win), false);
});
