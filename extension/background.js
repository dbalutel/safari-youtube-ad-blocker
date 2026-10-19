(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = api;
  }

  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener(api.onMessage);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  return { onMessage };
});
