import { NetworkConfig } from '../config';

function shouldApplyChaos(probability: number): boolean {
  return Math.random() < probability;
}

// We just need to intercept 'send'. The 'open' method is used to get context.
export function patchXHR(originalXhrSend: (body?: Document | XMLHttpRequestBodyInit) => void, config: NetworkConfig) {
  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    // 'this' is the XMLHttpRequest instance
    // We add properties to 'this' in our 'open' patcher
    const url = (this as any)._chaos_url;
    const method = (this as any)._chaos_method;

    // 1. Check for Failures
    if (config.failures) {
      for (const failure of config.failures) {
        if (url.includes(failure.urlPattern) && shouldApplyChaos(failure.probability)) {
          if (!failure.methods || failure.methods.includes(method)) {
            console.warn(`CHAOS: Forcing ${failure.statusCode} for ${method} ${url}`);
            // Fake the error response
            Object.defineProperty(this, 'status', { value: failure.statusCode });
            Object.defineProperty(this, 'statusText', { value: 'Service Unavailable (Chaos)' });
            this.dispatchEvent(new Event('error'));
            this.dispatchEvent(new Event('load'));
            this.dispatchEvent(new Event('loadend'));
            return; // Don't call original send
          }
        }
      }
    }

    // 2. Check for Latency (by overriding 'send' in a timeout)
    if (config.latencies) {
      for (const latency of config.latencies) {
        if (url.includes(latency.urlPattern) && shouldApplyChaos(latency.probability)) {
          if (!latency.methods || latency.methods.includes(method)) {
            console.warn(`CHAOS: Adding ${latency.delayMs}ms latency to ${method} ${url}`);
            setTimeout(() => {
              originalXhrSend.call(this, body);
            }, latency.delayMs);
            return; // Return now, the send will happen later
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
