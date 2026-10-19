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

  function notify(win, url) {
    try {
      console.debug('[ytadblock] rewritten', url);
    } catch {}
    try {
      if (win.document && win.CustomEvent) {
        win.document.dispatchEvent(new win.CustomEvent('ytadblock:rewritten'));
      }
    } catch {}
  }

  function installFetchHooks(win) {
    if (win.__ytAdBlockFetchInstalled || typeof win.fetch !== 'function') return;
    win.__ytAdBlockFetchInstalled = true;

    const nativeFetch = win.fetch;
    win.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const player = isPlayerRequest(url);
      let requestInit = init;

      if (player && requestInit && typeof requestInit.body === 'string') {
        const body = addAdFreeParam(requestInit.body);
        if (body !== requestInit.body) {
          requestInit = { ...requestInit, body };
          notify(win, url);
        }
      }

      const response = await nativeFetch.call(win, input, requestInit);
      if (!player) return response;

      try {
        const text = await response.clone().text();
        const pruned = prunePlayerJson(text);
        if (pruned === text) return response;

        const out = new win.Response(pruned, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        try {
          Object.defineProperty(out, 'url', { value: response.url, configurable: true });
        } catch {}
        notify(win, url);
        return out;
      } catch {
        return response;
      }
    };

    const xhr = win.XMLHttpRequest;
    if (!xhr || !xhr.prototype) return;

    const nativeOpen = xhr.prototype.open;
    const nativeSend = xhr.prototype.send;

    if (typeof nativeOpen === 'function') {
      xhr.prototype.open = function (method, url, ...rest) {
        try {
          this.__ytAdBlockUrl = String(url);
        } catch {}
        return nativeOpen.call(this, method, url, ...rest);
      };
    }

    if (typeof nativeSend === 'function') {
      xhr.prototype.send = function (body) {
        let outBody = body;
        try {
          if (isPlayerRequest(this.__ytAdBlockUrl) && typeof body === 'string') {
            const rewritten = addAdFreeParam(body);
            if (rewritten !== body) {
              outBody = rewritten;
              notify(win, this.__ytAdBlockUrl);
            }
          }
        } catch {}

        try {
          this.addEventListener('readystatechange', () => {
            if (this.readyState !== 4 || !isPlayerRequest(this.__ytAdBlockUrl)) return;
            try {
              const text = this.responseText;
              const pruned = prunePlayerJson(text);
              if (pruned === text) return;

              Object.defineProperty(this, 'responseText', { value: pruned, configurable: true });
              if (this.responseType === 'json') {
                Object.defineProperty(this, 'response', {
                  value: JSON.parse(pruned),
                  configurable: true,
                });
              }
              notify(win, this.__ytAdBlockUrl);
            } catch {}
          });
        } catch {}

        return nativeSend.call(this, outBody);
      };
    }
  }

  function installInlineResponseHook(win) {
    if (win.__ytAdBlockInlineInstalled) return;
    win.__ytAdBlockInlineInstalled = true;

    let current = win.ytInitialPlayerResponse;

    function apply(value) {
      const before = JSON.stringify(value);
      const pruned = pruneAdFields(value);
      if (JSON.stringify(pruned) !== before) notify(win, 'inline-player-response');
      return pruned;
    }

    try {
      Object.defineProperty(win, 'ytInitialPlayerResponse', {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          current = apply(value);
        },
      });
    } catch {
      try {
        win.ytInitialPlayerResponse = apply(win.ytInitialPlayerResponse);
      } catch {}
      return;
    }

    if (current !== undefined) current = apply(current);
  }

  function installPageHooks(win) {
    if (win.__ytAdBlockInstalled) return;
    win.__ytAdBlockInstalled = true;

    installFetchHooks(win);
    installInlineResponseHook(win);
    try {
      console.debug('[ytadblock] installed');
    } catch {}
  }

  if (typeof window !== 'undefined') {
    try {
      installPageHooks(window);
    } catch {}
  }

  return {
    isPlayerRequest,
    addAdFreeParam,
    pruneAdFields,
    prunePlayerJson,
    installFetchHooks,
    installInlineResponseHook,
    installPageHooks,
  };
});
