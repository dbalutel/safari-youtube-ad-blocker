(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    root.YTAdBlockPage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const AD_FREE_PARAMS = 'yAEB';
  const AD_FIELDS = new Set([
    'adPlacements',
    'adSlots',
    'playerAds',
    'adBreakHeartbeatParams',
  ]);

  function isPlayerRequest(url) {
    try {
      const parsed = new URL(url, 'https://www.youtube.com');
      return parsed.hostname === 'www.youtube.com'
        && parsed.pathname.endsWith('/youtubei/v1/player');
    } catch {
      return false;
    }
  }

  function addAdFreeParam(body) {
    if (typeof body !== 'string') return body;
    if (!body.includes('"contentPlaybackContext"')) return body;
    if (!body.includes('"params":"')) return body;
    if (body.includes(`"params":"${AD_FREE_PARAMS}`)) return body;
    return body.replace('"params":"', `"params":"${AD_FREE_PARAMS}`);
  }

  function pruneAdFields(value) {
    if (Array.isArray(value)) return value.map(pruneAdFields);
    if (!value || typeof value !== 'object') return value;

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (!AD_FIELDS.has(key)) out[key] = pruneAdFields(item);
    }
    return out;
  }

  function prunePlayerJson(text) {
    if (typeof text !== 'string') return text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }

    const pruned = pruneAdFields(parsed);
    if (JSON.stringify(pruned) === JSON.stringify(parsed)) return text;
    return JSON.stringify(pruned);
  }

  return { isPlayerRequest, addAdFreeParam, pruneAdFields, prunePlayerJson };
});
