// SPIKE: minimal Service Worker chaos shim.
// Patches `self.fetch` inside a Service Worker context. Reads config from
// `self.__CHAOS_CONFIG__`, supports network.failures + network.latencies only
// (enough to prove feasibility). Bridges chaos events back to all controlled
// clients via postMessage so the test runner can read them via window.
//
// This is NOT a production module — the goal is feasibility validation for
// v0.4.0 planning. Do not import from packages/.
(function () {
  if (typeof self === 'undefined' || typeof self.fetch !== 'function') return;
  if (self.__CHAOS_SW_INSTALLED__) return;
  self.__CHAOS_SW_INSTALLED__ = true;

  var config = self.__CHAOS_CONFIG__ || {};
  var network = config.network || {};
  var failures = Array.isArray(network.failures) ? network.failures : [];
  var latencies = Array.isArray(network.latencies) ? network.latencies : [];

  function urlMatches(rule, url) {
    return typeof rule.urlPattern === 'string' && url.indexOf(rule.urlPattern) !== -1;
  }

  function methodMatches(rule, method) {
    if (!rule.methods || !rule.methods.length) return true;
    return rule.methods.indexOf(method.toUpperCase()) !== -1;
  }

  function shouldApply(rule) {
    var p = typeof rule.probability === 'number' ? rule.probability : 1;
    return Math.random() < p;
  }

  function emit(event) {
    event.timestamp = Date.now();
    event.context = 'service-worker';
    self.clients.matchAll({ includeUncontrolled: true }).then(function (clients) {
      clients.forEach(function (c) {
        c.postMessage({ __chaosMakerSWEvent: true, event: event });
      });
    });
  }

  var originalFetch = self.fetch.bind(self);

  self.fetch = function (input, init) {
    var req = (input instanceof Request) ? input : new Request(input, init);
    var url = req.url;
    var method = req.method || 'GET';

    // Failure rules
    for (var i = 0; i < failures.length; i++) {
      var f = failures[i];
      if (urlMatches(f, url) && methodMatches(f, method)) {
        if (shouldApply(f)) {
          emit({
            type: 'network:failure',
            applied: true,
            detail: { url: url, method: method, statusCode: f.statusCode },
          });
          var body = typeof f.body === 'string' ? f.body : '';
          return Promise.resolve(new Response(body, {
            status: f.statusCode,
            statusText: f.statusText || 'Chaos',
            headers: f.headers || {},
          }));
        } else {
          emit({
            type: 'network:failure',
            applied: false,
            detail: { url: url, method: method, reason: 'probability-skip' },
          });
        }
      }
    }

    // Latency rules
    var delayMs = 0;
    for (var j = 0; j < latencies.length; j++) {
      var l = latencies[j];
      if (urlMatches(l, url) && methodMatches(l, method) && shouldApply(l)) {
        delayMs = Math.max(delayMs, l.delayMs || 0);
        emit({
          type: 'network:latency',
          applied: true,
          detail: { url: url, method: method, delayMs: l.delayMs },
        });
      }
    }

    if (delayMs > 0) {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(originalFetch(input, init)); }, delayMs);
      });
    }

    return originalFetch(input, init);
  };
})();
