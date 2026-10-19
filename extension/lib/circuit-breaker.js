(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    root.YTAdBlockCircuitBreaker = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createStartupBreaker({ timeoutMs = 25000, progressMs = 3000 } = {}) {
    let armed = false;
    let lastTick = 0;
    let activeMs = 0;
    let progressMsSeen = 0;
    let lastTime = 0;

    function arm(now = Date.now()) {
      armed = true;
      lastTick = now;
      activeMs = 0;
      progressMsSeen = 0;
      lastTime = 0;
    }

    function tick({
      currentTime = 0,
      paused = false,
      errorVisible = false,
      now = Date.now(),
    } = {}) {
      if (!armed) return false;
      if (errorVisible) {
        armed = false;
        return true;
      }

      const delta = Math.max(0, now - lastTick);
      if (!paused) {
        activeMs += delta;
        if (currentTime > lastTime) progressMsSeen += delta;
      }
      lastTick = now;
      lastTime = currentTime;

      if (progressMsSeen >= progressMs) {
        armed = false;
        return false;
      }
      if (activeMs >= timeoutMs) {
        armed = false;
        return true;
      }
      return false;
    }

    function isArmed() {
      return armed;
    }

    return { arm, tick, isArmed };
  }

  return { createStartupBreaker };
});
