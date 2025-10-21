import { NetworkConfig } from '../config';

function shouldApplyChaos(probability: number): boolean {
  return Math.random() < probability;
}

export function patchFetch(originalFetch: typeof window.fetch, config: NetworkConfig) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input.toString();
    const method = init?.method?.toUpperCase() || 'GET';

    // 1. Check for Failures
    if (config.failures) {
      for (const failure of config.failures) {
        if (url.includes(failure.urlPattern) && shouldApplyChaos(failure.probability)) {
          if (!failure.methods || failure.methods.includes(method)) {
            console.warn(`CHAOS: Forcing ${failure.statusCode} for ${method} ${url}`);
            return new Response(JSON.stringify({ error: 'Chaos Maker Attack!' }), {
              status: failure.statusCode,
              statusText: 'Service Unavailable (Chaos)',
            });
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
            await new Promise(res => setTimeout(res, latency.delayMs));
          }
        }
      }
    }

    // 3. If no chaos, proceed as normal
    return originalFetch(input, init);
  };
}
