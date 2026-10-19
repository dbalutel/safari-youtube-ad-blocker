# Personal Safari YouTube Ad Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove in-video YouTube ads in Safari on one Mac, falling back to normal ad playback if anything breaks.

**Architecture:** A local Safari Web Extension injects one page script into `www.youtube.com` before the player runs. The page script rewrites the player request and prunes ad fields from both network responses and the inline `ytInitialPlayerResponse`. A document-start content script plus a small startup watchdog disables the block for the tab and reloads once if playback fails, so the video always wins.

**Tech Stack:** JavaScript, Node 25 built-in test runner, Safari 27 Web Extension, Xcode 27, `safari-web-extension-converter`.

**Spec:** `docs/superpowers/specs/2026-10-19-youtube-ad-blocker-design.md`

## Global Constraints

- Personal local build only. No App Store, notarization, analytics, network calls, or settings UI.
- Runs only on `https://www.youtube.com/*`. Never block or rewrite `googlevideo.com`.
- Block video ads only: pre-roll and mid-roll. No page ads, feed ads, or other sites.
- No auto-skip, auto-seek, mute, or player manipulation.
- Fallback is mandatory: if the block trips, ads play and the video works. At most one reload per tab.
- Current ad-free request marker: `yAEB`.
- Current ad fields to remove: `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams`.
- Startup watchdog: arm only after a rewrite, disarm after 3 s of playback, trip after 25 s of unpaused no progress or a visible playback error.
- macOS 27, Safari 27, Xcode installed at `/Applications/Xcode.app`. `xcode-select` points at CommandLineTools, so every Xcode command sets `DEVELOPER_DIR`.
- Tests use `node --test`; no runtime dependency may be added.

## Review Focus

- A player response with no ads must pass through untouched and must not arm the watchdog.
- A paused tab or an ad that slipped through must not count toward the 25 s failure timeout.
- A playback error or a mid-roll rewrite after the 3 s disarm must not reload and lose the user’s position.
- Malformed or non-JSON player responses must pass through unchanged.
- A request body that already contains `yAEB` must not be prefixed twice.

---

### Task 1: Page rules

**Files:**
- Create: `package.json`
- Create: `extension/page.js`
- Test: `tests/page.test.js`

**Interfaces:**
- Produces: `isPlayerRequest(url: string): boolean`
- Produces: `addAdFreeParam(body: string): string`
- Produces: `pruneAdFields(value: any): any` (returns a pruned copy; input is not mutated)
- Produces: `prunePlayerJson(text: string): string` (returns the original string when parsing fails or nothing was removed)
- `page.js` is a UMD module: `module.exports` in Node, `globalThis.YTAdBlockPage` in the page.

- [ ] **Step 1: Write the failing tests**

`tests/page.test.js`:

```js
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
```

`package.json`:

```json
{
  "name": "safari-youtube-ad-blocker",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/page.test.js`
Expected: FAIL with `Cannot find module '../extension/page.js'`.

- [ ] **Step 3: Implement the four functions in `extension/page.js`**

Rules:
- `isPlayerRequest` parses with `new URL(url, 'https://www.youtube.com')`, requires host `www.youtube.com`, and pathname ending `/youtubei/v1/player`.
- `addAdFreeParam` only changes strings containing both `"contentPlaybackContext"` and `"params":"`, and only when that marker is not already present. Replace the first `"params":"` with `"params":"yAEB`.
- `pruneAdFields` recursively copies objects and arrays, skipping the four ad keys. Return primitives and non-plain values unchanged.
- `prunePlayerJson` tries `JSON.parse`; on failure returns the input. On success, prune and compare the serialized result with the serialized original. Return the original text when equal; otherwise return the pruned JSON.

Use this UMD wrapper:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    root.YTAdBlockPage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // implementation
  return { isPlayerRequest, addAdFreeParam, pruneAdFields, prunePlayerJson };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/page.test.js`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json extension/page.js tests/page.test.js
git commit -m "feat: add YouTube ad rules"
```

---

### Task 2: Fetch and XHR hooks

**Files:**
- Modify: `extension/page.js`
- Test: `tests/page-fetch-hooks.test.js`

**Interfaces:**
- Consumes: `isPlayerRequest`, `addAdFreeParam`, `prunePlayerJson` from Task 1.
- Produces: `installFetchHooks(win: object): void`
- Produces: `win.__ytAdBlockFetchInstalled` as the idempotence flag.
- Side effect: dispatches `ytadblock:rewritten` on `win.document` after a player request body or response is actually changed. It must not fire for non-player traffic or when nothing changed.

- [ ] **Step 1: Write the failing tests**

`tests/page-fetch-hooks.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/page-fetch-hooks.test.js`
Expected: FAIL with `installFetchHooks is not a function`.

- [ ] **Step 3: Implement `installFetchHooks(win)` in `extension/page.js`**

Behavior:
- Return immediately if `win.__ytAdBlockFetchInstalled` or `typeof win.fetch !== 'function'`; set the flag otherwise.
- Wrap `win.fetch`: rewrite the request body when `isPlayerRequest(url)` and `init.body` is a string. Await the native fetch. If the URL is not a player request, return the original response. Otherwise clone the response, read text, prune it. If the text is unchanged or parsing fails, return the original response. Otherwise return a new `win.Response` with the same status, status text, and headers, and define `url` to the original URL in a try/catch.
- Dispatch `new win.CustomEvent('ytadblock:rewritten')` on `win.document` after a player request body is changed and again after a response is changed. Also `console.debug('[ytadblock] rewritten', url)` for each change.
- Wrap `win.XMLHttpRequest.prototype.open` to record the URL on the instance, and `send` to rewrite a string body. On `readystatechange` at readyState 4, prune `responseText` and, for `responseType === 'json'`, `response`. Guard every step in try/catch and leave the original on failure.
- Export `installFetchHooks` alongside the Task 1 functions.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/page.test.js tests/page-fetch-hooks.test.js`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/page.js tests/page-fetch-hooks.test.js
git commit -m "feat: hook YouTube player requests"
```

---

### Task 3: Inline player response hook

**Files:**
- Modify: `extension/page.js`
- Test: `tests/page-inline.test.js`

**Interfaces:**
- Consumes: `pruneAdFields`, `installFetchHooks` from Tasks 1–2.
- Produces: `installInlineResponseHook(win: object): void`
- Produces: `installPageHooks(win: object): void` — installs both hooks and sets `win.__ytAdBlockInstalled`.
- Side effect: dispatches `ytadblock:rewritten` only when the inline response actually changes.

- [ ] **Step 1: Write the failing tests**

`tests/page-inline.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/page-inline.test.js`
Expected: FAIL with `installInlineResponseHook is not a function`.

- [ ] **Step 3: Implement the inline hook and combined installer**

- `installInlineResponseHook(win)`:
  - Return if `win.__ytAdBlockInlineInstalled`; set it.
  - Store the current value, then define a configurable accessor for `win.ytInitialPlayerResponse`.
  - The setter prunes the value, stores it, and dispatches `ytadblock:rewritten` only when the serialized value changed.
  - If defining the accessor throws, prune the existing value in place instead and do not throw.
  - After installing, prune any value already present.
- `installPageHooks(win)`:
  - Return if `win.__ytAdBlockInstalled`; set it.
  - Call `installFetchHooks(win)` and `installInlineResponseHook(win)`.
  - `console.debug('[ytadblock] installed')`.
- Export `installInlineResponseHook` and `installPageHooks` alongside the existing functions.
- At the end of the file, call `installPageHooks(window)` when `typeof window !== 'undefined'`. This is the line that actually activates the page script.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/page.test.js tests/page-fetch-hooks.test.js tests/page-inline.test.js`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/page.js tests/page-inline.test.js
git commit -m "feat: hook inline YouTube player response"
```

---

### Task 4: Startup watchdog

**Files:**
- Create: `extension/lib/circuit-breaker.js`
- Test: `tests/circuit-breaker.test.js`

**Interfaces:**
- Produces: `createStartupBreaker({ timeoutMs = 25000, progressMs = 3000 } = {})`
- Returns an object with:
  - `arm(now = Date.now()): void`
  - `tick({ currentTime = 0, paused = false, errorVisible = false, now = Date.now() }): boolean` — returns `true` exactly once when it trips
  - `isArmed(): boolean`
- UMD module using the same wrapper pattern as `page.js`: `module.exports` in Node, `globalThis.YTAdBlockCircuitBreaker` in the content script.

- [ ] **Step 1: Write the failing tests**

`tests/circuit-breaker.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStartupBreaker } = require('../extension/lib/circuit-breaker.js');

test('does nothing before it is armed', () => {
  const breaker = createStartupBreaker();
  assert.equal(breaker.isArmed(), false);
  assert.equal(breaker.tick({ now: 100000 }), false);
});

test('trips after 25 seconds of unpaused no progress', () => {
  const breaker = createStartupBreaker();
  breaker.arm(0);
  assert.equal(breaker.tick({ currentTime: 0, paused: false, now: 25001 }), true);
  assert.equal(breaker.tick({ currentTime: 0, paused: false, now: 26000 }), false);
  assert.equal(breaker.isArmed(), false);
});

test('does not count paused time', () => {
  const breaker = createStartupBreaker();
  breaker.arm(0);
  assert.equal(breaker.tick({ currentTime: 0, paused: true, now: 30000 }), false);
  assert.equal(breaker.tick({ currentTime: 0, paused: false, now: 30001 }), false);
  assert.equal(breaker.tick({ currentTime: 0, paused: false, now: 55002 }), true);
});

test('disarms after 3 seconds of playback and stays disarmed', () => {
  const breaker = createStartupBreaker();
  breaker.arm(0);
  assert.equal(breaker.tick({ currentTime: 0, paused: false, now: 1000 }), false);
  assert.equal(breaker.tick({ currentTime: 1, paused: false, now: 2000 }), false);
  assert.equal(breaker.tick({ currentTime: 2, paused: false, now: 4000 }), false);
  assert.equal(breaker.isArmed(), false);
  assert.equal(breaker.tick({ errorVisible: true, now: 600000 }), false);
});

test('trips immediately on a visible error while armed', () => {
  const breaker = createStartupBreaker();
  breaker.arm(0);
  assert.equal(breaker.tick({ errorVisible: true, now: 100 }), true);
  assert.equal(breaker.tick({ errorVisible: true, now: 200 }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/circuit-breaker.test.js`
Expected: FAIL with `Cannot find module '../extension/lib/circuit-breaker.js'`.

- [ ] **Step 3: Implement the state machine**

State: `armed`, `lastTick`, `activeMs`, `progressMsSeen`, `lastTime`.

On `arm(now)`: set armed, reset counters, `lastTick = now`, `lastTime = 0`.

On `tick({ currentTime, paused, errorVisible, now })`:
- If not armed, return false.
- If `errorVisible`, disarm and return true.
- Add `now - lastTick` to `activeMs` only when not paused.
- Add the same delta to `progressMsSeen` only when not paused and `currentTime > lastTime`.
- Update `lastTick` and `lastTime`.
- If `progressMsSeen >= progressMs`, disarm and return false.
- If `activeMs >= timeoutMs`, disarm and return true.
- Otherwise return false.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/circuit-breaker.test.js`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/circuit-breaker.js tests/circuit-breaker.test.js
git commit -m "feat: add startup playback watchdog"
```

---

### Task 5: Extension wiring

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/content.js`
- Test: `tests/background.test.js`
- Test: `tests/manifest.test.js`

**Interfaces:**
- Consumes: `createStartupBreaker` from Task 4.
- Produces: `onMessage(message, sender)` in `background.js`, registered with `browser.runtime.onMessage.addListener` when `browser` exists.
- Message contract: `{ type: 'ytadblock:inject' }` from a content script; background calls `browser.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, files: ['page.js'], world: 'MAIN', injectImmediately: true })`.
- Content script storage key: `ytadblock:disabled`, value `'1'`, in `sessionStorage`.

- [ ] **Step 1: Write the failing tests**

`tests/manifest.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../extension/manifest.json');

test('manifest targets YouTube only and loads the watchdog first', () => {
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.youtube.com/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.deepEqual(manifest.content_scripts[0].js, ['lib/circuit-breaker.js', 'content.js']);
  assert.ok(manifest.permissions.includes('scripting'));
  assert.deepEqual(manifest.host_permissions, ['https://www.youtube.com/*']);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(JSON.stringify(manifest).includes('googlevideo'), false);
});
```

`tests/background.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/background.test.js tests/manifest.test.js`
Expected: FAIL with missing modules.

- [ ] **Step 3: Create `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "YouTube Ad Blocker",
  "version": "0.1.0",
  "description": "Removes in-video YouTube ads in Safari.",
  "permissions": ["scripting"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["lib/circuit-breaker.js", "content.js"],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 4: Create `extension/background.js`**

- UMD wrapper exporting `{ onMessage }` and registering it when `browser` exists.
- `onMessage` ignores anything except `ytadblock:inject` and ignores senders without `tab.id` or `frameId`.
- Return the `executeScript` promise.

- [ ] **Step 5: Create `extension/content.js`**

- Wrap every `sessionStorage` access in try/catch. Return immediately if the flag is `'1'`.
- Create the breaker, request injection once with `browser.runtime.sendMessage({ type: 'ytadblock:inject' })`, and swallow rejections.
- On `document` event `ytadblock:rewritten`, only call `breaker.arm(Date.now())` when there is no video or `video.currentTime <= 1`. This keeps the check startup-only; a mid-roll rewrite must never arm it.
- Poll every 500 ms while armed: find `video.html5-main-video` or `video`; set `errorVisible` when `#player-error-message-container:not(:empty)` or `.ytp-error` exists; set `adShowing` when `.ad-showing` or `.ytp-ad-player-overlay` exists; call `breaker.tick({ currentTime, paused: video.paused || adShowing, errorVisible, now })`.
- On a `true` result, set the sessionStorage flag and call `location.reload()` exactly once. There is no other reload path.
- The content script must not throw when no video exists; pass `currentTime: 0, paused: true` so a slow page load does not count toward the timeout.

- [ ] **Step 6: Run all tests to verify they pass**

Run: `node --test`
Expected: 18 tests pass.

- [ ] **Step 7: Commit**

```bash
git add extension/manifest.json extension/background.js extension/content.js tests/background.test.js tests/manifest.test.js
git commit -m "feat: wire Safari extension injection"
```

---

### Task 6: Xcode container app

**Files:**
- Create: `.gitignore`
- Create: `YouTube Ad Blocker/` (generated by the converter; commit the generated project)

**Interfaces:**
- Consumes: the `extension/` folder from Tasks 1–5.
- Produces: a runnable `.app` at `build/Build/Products/Debug/YouTube Ad Blocker.app`.

- [ ] **Step 1: Generate the project**

Run:

```bash
/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-converter extension \
  --project-location . \
  --app-name "YouTube Ad Blocker" \
  --bundle-identifier com.personal.youtubeadblocker \
  --macos-only \
  --swift \
  --no-open --no-prompt --force
```

Expected: a `YouTube Ad Blocker` folder containing `YouTube Ad Blocker.xcodeproj`. The generated project references `extension/` rather than copying it, so later edits need no re-conversion.

- [ ] **Step 2: Build the app**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project "YouTube Ad Blocker/YouTube Ad Blocker.xcodeproj" \
  -scheme "YouTube Ad Blocker" \
  -configuration Debug \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY=- \
  build
```

Expected: `** BUILD SUCCEEDED **`.

If signing fails, rerun with `CODE_SIGNING_ALLOWED=NO` added, and use the unsigned-extension fallback in Step 4.

- [ ] **Step 3: Verify the app exists**

Run: `test -d "build/Build/Products/Debug/YouTube Ad Blocker.app" && echo app-ok`
Expected: `app-ok`.

- [ ] **Step 4: Launch and enable**

Run: `open "build/Build/Products/Debug/YouTube Ad Blocker.app"`

Then in Safari: Settings → Extensions → enable “YouTube Ad Blocker” → allow access to `www.youtube.com`. If Safari does not list it, enable Develop → “Allow Unsigned Extensions”, quit and reopen Safari, then enable the extension.

- [ ] **Step 5: Create `.gitignore`**

```
build/
xcuserdata/
*.xcuserstate
.DS_Store
```

- [ ] **Step 6: Commit the project and ignore file**

```bash
git add .gitignore "YouTube Ad Blocker"
git commit -m "build: add Xcode container app"
```

---

### Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Include:
- What it does and what it deliberately does not do.
- Build commands from Task 6, verbatim.
- Enable/allow steps, including the unsigned-extension fallback.
- Use: open YouTube normally. No action after setup.
- Fallback: if a video fails once, the tab reloads with ads; close the tab to start fresh.
- Maintenance: the two constants and the maintained sources:
  - `https://github.com/uBlockOrigin/uAssetsCDN/blob/main/filters/quick-fixes.txt`
  - `https://github.com/brave/adblock-resources`
- Limits: personal use, YouTube changes, terms-of-service risk, no page ads.
- Test command: `npm test`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add install and maintenance notes"
```

---

### Task 8: End-to-end verification

**Files:** none.

- [ ] **Step 1: Run the automated tests**

Run: `node --test`
Expected: all 18 tests pass.

- [ ] **Step 2: Rebuild and relaunch the app**

Run the Task 6 build command and `open` the app. Confirm the extension is enabled and allowed on YouTube.

- [ ] **Step 3: Check the primary path**

On a logged-in YouTube session, open five different videos with pre-roll ads. Each starts without an ad. Watch one long video through a mid-roll. Playback is not interrupted and the page does not reload. Navigate between videos without a full reload; no ads appear. In Safari Web Inspector’s console, confirm `[ytadblock] installed` and at least one `[ytadblock] rewritten` line.

- [ ] **Step 4: Check the fallback**

With a video playing, run this in Safari Web Inspector:

```js
const video = document.querySelector('video');
video.currentTime = 0;
Object.defineProperty(video, 'currentTime', { get: () => 0 });
document.dispatchEvent(new CustomEvent('ytadblock:rewritten'));
```

Expected: after about 25 seconds the tab reloads once, then plays normally with ads. It must not reload again, show a blank player, or loop.

- [ ] **Step 5: Decide on SABR**

If Step 3 still shows pre-roll ads on cold loads, the page script is running too late or the marker is stale. Stop and report which case it is; do not paper over it with auto-skip. If Step 3 shows mid-roll ads or the 4–16 s spinner, the design requires Brave-style SABR handling before completion. Report the exact symptom; do not add speculative SABR code in this plan.

- [ ] **Step 6: Record the result**

Add a short “Verified on” line to the README with the date and the checks that passed. Commit only if the README changed:

```bash
git add README.md
git commit -m "docs: record verification"
```
