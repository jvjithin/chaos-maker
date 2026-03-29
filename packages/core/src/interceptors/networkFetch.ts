import { NetworkConfig } from '../config';
import { shouldApplyChaos } from '../utils';
import { ChaosEventEmitter } from '../events';

export function patchFetch(originalFetch: typeof window.fetch, config: NetworkConfig, emitter?: ChaosEventEmitter) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input.toString();
    const method = init?.method?.toUpperCase() || 'GET';

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
              const body = failure.body ?? JSON.stringify({ error: 'Chaos Maker Attack!' });
              const headers = failure.headers ?? {};
              return new Response(body, {
                status: failure.statusCode,
                statusText: failure.statusText ?? 'Service Unavailable (Chaos)',
                headers,
              });
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
              await new Promise(res => setTimeout(res, latency.delayMs));
            }
          }
        }
      }
    }

    // 3. If no chaos, proceed as normal
    return originalFetch(input, init);
  };
}
