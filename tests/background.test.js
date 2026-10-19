const test = require('node:test');
const assert = require('node:assert/strict');

let injected;
global.browser = {
  runtime: { onMessage: { addListener() {} } },
  scripting: {
    async executeScript(options) {
      injected = options;
      return [];
    },
  },
};

const { onMessage } = require('../extension/background.js');

test('injects page.js into the sender frame in the main world', async () => {
  injected = undefined;
  await onMessage({ type: 'ytadblock:inject' }, { tab: { id: 7 }, frameId: 3 });
  assert.deepEqual(injected, {
    target: { tabId: 7, frameIds: [3] },
    files: ['page.js'],
    world: 'MAIN',
    injectImmediately: true,
  });
});

test('ignores other messages', async () => {
  injected = undefined;
  await onMessage({ type: 'other' }, { tab: { id: 7 }, frameId: 3 });
  assert.equal(injected, undefined);
});
