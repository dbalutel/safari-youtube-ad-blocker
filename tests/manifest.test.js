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
