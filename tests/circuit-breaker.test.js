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
