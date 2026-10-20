(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = api;
  }

  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(api.onMessage);
  }

  if (typeof browser !== 'undefined' && browser.scripting) {
    api.registerScripts();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WATCHDOG_ID = 'ytadblock-watchdog';
  const PAGE_ID = 'ytadblock-page';
  const MATCHES = ['https://www.youtube.com/*'];

  async function registerScripts() {
    try {
      let existing = [];
      try {
        if (typeof browser.scripting.getRegisteredContentScripts === 'function') {
          existing = await browser.scripting.getRegisteredContentScripts({
            ids: [WATCHDOG_ID, PAGE_ID],
          });
        }
      } catch {}

      const ids = new Set((existing || []).map((script) => script.id));
      const scripts = [];

      if (!ids.has(WATCHDOG_ID)) {
        scripts.push({
          id: WATCHDOG_ID,
          matches: MATCHES,
          js: ['lib/circuit-breaker.js', 'content.js'],
          runAt: 'document_start',
        });
      }

      if (!ids.has(PAGE_ID)) {
        scripts.push({
          id: PAGE_ID,
          matches: MATCHES,
          js: ['page.js'],
          runAt: 'document_start',
          world: 'MAIN',
        });
      }

      if (scripts.length === 0) return;

      await browser.scripting.registerContentScripts(scripts);

      try {
        console.debug('[ytadblock] scripts registered');
      } catch {}
    } catch (error) {
      try {
        console.debug('[ytadblock] script registration failed', error);
      } catch {}
    }
  }

  async function onMessage(message, sender) {
    if (!message || message.type !== 'ytadblock:inject') return;

    const tabId = sender && sender.tab && sender.tab.id;
    const frameId = sender && sender.frameId;
    if (tabId === undefined || frameId === undefined) return;

    return browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['page.js'],
      world: 'MAIN',
      injectImmediately: true,
    });
  }

  return { onMessage, registerScripts };
});
