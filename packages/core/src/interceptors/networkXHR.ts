import { NetworkConfig } from '../config';
import { shouldApplyChaos } from '../utils';

export function patchXHR(originalXhrSend: (body?: Document | XMLHttpRequestBodyInit) => void, config: NetworkConfig) {
  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    const url = (this as any)._chaos_url;
    const method = (this as any)._chaos_method;

    // 1. Check for Failures
    if (config.failures) {
      for (const failure of config.failures) {
        if (url.includes(failure.urlPattern) && shouldApplyChaos(failure.probability)) {
          if (!failure.methods || failure.methods.includes(method)) {
            console.warn(`CHAOS: Forcing ${failure.statusCode} for ${method} ${url}`);
            Object.defineProperty(this, 'status', { value: failure.statusCode });
            Object.defineProperty(this, 'statusText', {
              value: failure.statusText ?? 'Service Unavailable (Chaos)',
            });
            const responseBody = failure.body ?? JSON.stringify({ error: 'Chaos Maker Attack!' });
            Object.defineProperty(this, 'responseText', { value: responseBody });
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('load'));
            this.dispatchEvent(new Event('loadend'));
            return;
          }
        }
      }
    }

    // 2. Check for Latency
    if (config.latencies) {
      for (const latency of config.latencies) {
        if (url.includes(latency.urlPattern) && shouldApplyChaos(latency.probability)) {
          if (!latency.methods || latency.methods.includes(method)) {
            console.warn(`CHAOS: Adding ${latency.delayMs}ms latency to ${method} ${url}`);
            setTimeout(() => {
              originalXhrSend.call(this, body);
            }, latency.delayMs);
            return;
          }
        }
      }
    }

    // 3. If no chaos, proceed as normal
    originalXhrSend.call(this, body);
  };
}

// We also need to patch 'open' to store the URL and method
export function patchXHROpen(originalXhrOpen: (method: string, url: string | URL) => void) {
  return function (this: XMLHttpRequest, method: string, url: string | URL) {
    (this as any)._chaos_url = url.toString();
    (this as any)._chaos_method = method.toUpperCase();
    originalXhrOpen.call(this, method, url);
  };
}
