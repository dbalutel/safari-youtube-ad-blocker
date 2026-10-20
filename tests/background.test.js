const test = require('node:test');
const assert = require('node:assert/strict');

let injected;
let registered;
let existingScripts = [];
global.browser = {
  runtime: { onMessage: { addListener() {} } },
  scripting: {
    async getRegisteredContentScripts() {
      return existingScripts;
    },
    async registerContentScripts(scripts) {
      registered = scripts;
    },
    async executeScript(options) {
      injected = options;
      return [];
    },
  },
};

const { onMessage, registerScripts } = require('../extension/background.js');

const MATCHES = ['https://www.youtube.com/*'];

test('registers the watchdog and page scripts at document start', async () => {
  existingScripts = [];
  registered = undefined;

  await registerScripts();

  assert.deepEqual(registered, [
    {
      id: 'ytadblock-watchdog',
      matches: MATCHES,
      js: ['lib/circuit-breaker.js', 'content.js'],
      runAt: 'document_start',
    },
    {
      id: 'ytadblock-page',
      matches: MATCHES,
      js: ['page.js'],
      runAt: 'document_start',
      world: 'MAIN',
    },
  ]);
});

test('does not re-register scripts that already exist', async () => {
  existingScripts = [{ id: 'ytadblock-watchdog' }, { id: 'ytadblock-page' }];
  registered = undefined;

  await registerScripts();

  assert.equal(registered, undefined);
});

test('injects page.js into the sender frame as a fallback', async () => {
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
