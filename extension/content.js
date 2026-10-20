(function () {
  if (globalThis.__ytAdBlockContentInstalled) return;
  globalThis.__ytAdBlockContentInstalled = true;

  const DISABLED_KEY = 'ytadblock:disabled';

  function isDisabled() {
    try {
      return sessionStorage.getItem(DISABLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  if (isDisabled()) return;

  const breaker = globalThis.YTAdBlockCircuitBreaker.createStartupBreaker();

  try {
    const result = browser.runtime.sendMessage({ type: 'ytadblock:inject' });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}

  document.addEventListener('ytadblock:rewritten', () => {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (video && video.currentTime > 1) return;
    breaker.arm(Date.now());
  });

  setInterval(() => {
    if (!breaker.isArmed()) return;

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const errorVisible = Boolean(
      document.querySelector('#player-error-message-container:not(:empty), .ytp-error'),
    );
    const adShowing = Boolean(document.querySelector('.ad-showing, .ytp-ad-player-overlay'));

    const trip = video
      ? breaker.tick({
        currentTime: video.currentTime,
        paused: video.paused || adShowing,
        errorVisible,
        now: Date.now(),
      })
      : breaker.tick({
        currentTime: 0,
        paused: true,
        errorVisible,
        now: Date.now(),
      });

    if (!trip) return;

    try {
      sessionStorage.setItem(DISABLED_KEY, '1');
    } catch {}
    location.reload();
  }, 500);
})();
