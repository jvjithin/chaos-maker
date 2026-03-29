import { NetworkConfig } from '../config';
import { shouldApplyChaos } from '../utils';
import { ChaosEventEmitter } from '../events';

export function patchXHR(originalXhrSend: (body?: Document | XMLHttpRequestBodyInit) => void, config: NetworkConfig, emitter?: ChaosEventEmitter) {
  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    const url = (this as any)._chaos_url;
    const method = (this as any)._chaos_method;

    // 1. Check for Failures
    if (config.failures) {
      for (const failure of config.failures) {
        if (url.includes(failure.urlPattern)) {
          if (!failure.methods || failure.methods.includes(method)) {
            const applied = shouldApplyChaos(failure.probability);
            emitter?.emit({
              type: 'network:failure',
              timestamp: Date.now(),
              applied,
              detail: { url, method, statusCode: failure.statusCode },
            });
            if (applied) {
              console.warn(`CHAOS: Forcing ${failure.statusCode} for ${method} ${url}`);
              Object.defineProperty(this, 'status', { value: failure.statusCode });
              Object.defineProperty(this, 'statusText', {
                value: failure.statusText ?? 'Service Unavailable (Chaos)',
              });
              const responseBody = failure.body ?? JSON.stringify({ error: 'Chaos Maker Attack!' });
              Object.defineProperty(this, 'responseText', { value: responseBody });
              const responseHeaders = failure.headers ?? {};
              Object.defineProperty(this, 'getResponseHeader', {
                value: (name: string) => {
                  const key = Object.keys(responseHeaders).find(
                    (k) => k.toLowerCase() === name.toLowerCase()
                  );
                  return key ? responseHeaders[key] : null;
                },
              });
              Object.defineProperty(this, 'getAllResponseHeaders', {
                value: () =>
                  Object.entries(responseHeaders)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\r\n'),
              });
              this.dispatchEvent(new Event('error'));
              this.dispatchEvent(new Event('load'));
              this.dispatchEvent(new Event('loadend'));
              return;
            }
          }
        }
      }
    }

    // 2. Check for Latency
    if (config.latencies) {
      for (const latency of config.latencies) {
        if (url.includes(latency.urlPattern)) {
          if (!latency.methods || latency.methods.includes(method)) {
            const applied = shouldApplyChaos(latency.probability);
            emitter?.emit({
              type: 'network:latency',
              timestamp: Date.now(),
              applied,
              detail: { url, method, delayMs: latency.delayMs },
            });
            if (applied) {
              console.warn(`CHAOS: Adding ${latency.delayMs}ms latency to ${method} ${url}`);
              setTimeout(() => {
                originalXhrSend.call(this, body);
              }, latency.delayMs);
              return;
            }
          }
        }
      }
    }

    // 3. If no chaos, proceed as normal
    originalXhrSend.call(this, body);
  };
}

export function patchXHROpen(originalXhrOpen: (method: string, url: string | URL) => void) {
  return function (this: XMLHttpRequest, method: string, url: string | URL) {
    (this as any)._chaos_url = url.toString();
    (this as any)._chaos_method = method.toUpperCase();
    originalXhrOpen.call(this, method, url);
  };
}
