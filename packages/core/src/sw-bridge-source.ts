/**
 * Browser-side bridge installed into the page by each adapter (Playwright /
 * Cypress / WDIO / Puppeteer) to talk to the Service-Worker chaos engine.
 *
 * This is a string because it is injected via `addInitScript`, `eval` or a
 * `<script>` tag — *not* imported as a module. Adapters are Node-side, but
 * this source executes in the AUT window.
 *
 * Exposes `window.__chaosMakerSWBridge`:
 *  - `apply(cfg, timeoutMs)` — post config over MessageChannel, wait for ack.
 *  - `stop(timeoutMs)` — stop chaos in the SW.
 *  - `getLocalLog()` / `clearLocalLog()` — page-side buffered event log.
 *  - `getRemoteLog(timeoutMs)` — fetch SW's in-memory log.
 *
 * The bridge auto-wires a `controllerchange` listener so SW updates inherit
 * the most recent config. Install is idempotent.
 */
export const SW_BRIDGE_SOURCE = /* js */ `
(function installChaosMakerSWBridge() {
  if (typeof window === 'undefined') return;
  if (window.__chaosMakerSWBridgeInstalled) return;
  window.__chaosMakerSWBridgeInstalled = true;

  var log = [];
  var lastConfig = null;

  function addSwListeners() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (evt) {
      var data = evt && evt.data;
      if (data && data.__chaosMakerSWEvent && data.event) {
        log.push(data.event);
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (lastConfig) {
        postConfig(lastConfig, 5000).catch(function (err) {
          try { console.warn('[chaos-maker] re-apply after controllerchange failed', err); } catch (_) {}
        });
      }
    });
  }

  function waitForController(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!('serviceWorker' in navigator)) {
        reject(new Error('[chaos-maker] service worker API not available on this page'));
        return;
      }
      var start = Date.now();
      (function poll() {
        if (navigator.serviceWorker.controller) {
          resolve(navigator.serviceWorker.controller);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          reject(new Error('[chaos-maker] no SW controller after ' + timeoutMs + 'ms — did you register the SW?'));
          return;
        }
        setTimeout(poll, 50);
      })();
    });
  }

  function postViaPort(controller, message, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var channel = new MessageChannel();
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { channel.port1.close(); } catch (_) {}
        reject(new Error('[chaos-maker] SW ack timeout after ' + timeoutMs + 'ms'));
      }, timeoutMs);
      channel.port1.onmessage = function (evt) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(evt && evt.data);
      };
      controller.postMessage(message, [channel.port2]);
    });
  }

  function postConfig(cfg, timeoutMs) {
    return waitForController(timeoutMs).then(function (ctrl) {
      return postViaPort(ctrl, { __chaosMakerConfig: cfg }, timeoutMs);
    });
  }

  window.__chaosMakerSWBridge = {
    apply: function (cfg, timeoutMs) {
      lastConfig = cfg;
      return postConfig(cfg, timeoutMs).then(function (ack) {
        return { seed: ack && typeof ack.seed === 'number' ? ack.seed : null };
      });
    },
    stop: function (timeoutMs) {
      lastConfig = null;
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        return Promise.resolve({ running: false });
      }
      return postViaPort(navigator.serviceWorker.controller, { __chaosMakerStop: true }, timeoutMs);
    },
    getLocalLog: function () { return log.slice(); },
    clearLocalLog: function () { log.length = 0; },
    getRemoteLog: function (timeoutMs) {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        return Promise.resolve([]);
      }
      return postViaPort(navigator.serviceWorker.controller, { __chaosMakerGetLog: true }, timeoutMs)
        .then(function (reply) {
          return (reply && Array.isArray(reply.log)) ? reply.log : [];
        });
    },
  };

  addSwListeners();
})();
`;
