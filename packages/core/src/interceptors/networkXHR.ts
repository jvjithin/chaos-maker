import { NetworkAbortConfig, NetworkConfig, NetworkCorruptionConfig } from '../config';
import { shouldApplyChaos, corruptText, matchUrl, incrementCounter, checkCountingCondition } from '../utils';
import { ChaosEventEmitter } from '../events';

function emitAbortEvent(
  emitter: ChaosEventEmitter | undefined,
  abort: NetworkAbortConfig,
  url: string,
  method: string,
  applied: boolean
): void {
  emitter?.emit({
    type: 'network:abort',
    timestamp: Date.now(),
    applied,
    detail: { url, method, timeoutMs: abort.timeout },
  });
}

function emitCorruptionEvent(
  emitter: ChaosEventEmitter | undefined,
  corruption: NetworkCorruptionConfig,
  url: string,
  method: string,
  applied: boolean
): void {
  emitter?.emit({
    type: 'network:corruption',
    timestamp: Date.now(),
    applied,
    detail: { url, method, strategy: corruption.strategy },
  });
}

export function patchXHR(originalXhrSend: (body?: Document | XMLHttpRequestBodyInit) => void, config: NetworkConfig, emitter?: ChaosEventEmitter, random: () => number = Math.random, counters: Map<object, number> = new Map()) {
  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    const url = (this as any)._chaos_url;
    const method = (this as any)._chaos_method;

    // 1. Check for CORS
    if (config.cors) {
      for (const cors of config.cors) {
        if (matchUrl(url, cors.urlPattern)) {
          if (!cors.methods || cors.methods.includes(method)) {
            const count = incrementCounter(cors, counters);
            if (!checkCountingCondition(cors, count)) continue;
            const applied = shouldApplyChaos(cors.probability, random);
            emitter?.emit({
              type: 'network:cors',
              timestamp: Date.now(),
              applied,
              detail: { url, method },
            });
            if (applied) {
              console.debug(`[chaos-maker] CORS block: ${method} ${url}`);
              Object.defineProperty(this, 'status', { value: 0 });
              Object.defineProperty(this, 'statusText', { value: '' });
              this.dispatchEvent(new Event('error'));
              this.dispatchEvent(new Event('loadend'));
              return;
            }
          }
        }
      }
    }

    // 2. Check for Abort
    if (config.aborts) {
      for (const abort of config.aborts) {
        if (matchUrl(url, abort.urlPattern)) {
          if (!abort.methods || abort.methods.includes(method)) {
            const count = incrementCounter(abort, counters);
            if (!checkCountingCondition(abort, count)) continue;
            const applied = shouldApplyChaos(abort.probability, random);
            if (!applied) {
              emitAbortEvent(emitter, abort, url, method, false);
              continue;
            }

            console.warn(`CHAOS: Aborting ${method} ${url} after ${abort.timeout || 0}ms`);

            let abortSettled = false;
            let abortTimer: ReturnType<typeof setTimeout> | undefined;

            const cleanup = () => {
              if (abortTimer) {
                clearTimeout(abortTimer);
                abortTimer = undefined;
              }
              if (typeof this.removeEventListener === 'function') {
                this.removeEventListener('loadend', handleLoadEnd);
              }
            };

            const finalizeAbort = (didAbort: boolean) => {
              if (abortSettled) {
                return;
              }
              abortSettled = true;
              cleanup();
              emitAbortEvent(emitter, abort, url, method, didAbort);
            };

            const handleLoadEnd = () => {
              finalizeAbort(false);
            };

            const applyAbort = () => {
              if (abortSettled) {
                return;
              }
              finalizeAbort(true);
              this.abort();
            };

            if (typeof this.addEventListener === 'function') {
              this.addEventListener('loadend', handleLoadEnd);
            }

            try {
              originalXhrSend.call(this, body);
            } catch (error) {
              finalizeAbort(false);
              throw error;
            }

            if (abortSettled) {
              return;
            }

            if (abort.timeout) {
              abortTimer = setTimeout(applyAbort, abort.timeout);
            } else {
              applyAbort();
            }
            return;
          }
        }
      }
    }

    // 3. Check for Failures
    if (config.failures) {
      for (const failure of config.failures) {
        if (matchUrl(url, failure.urlPattern)) {
          if (!failure.methods || failure.methods.includes(method)) {
            const count = incrementCounter(failure, counters);
            if (!checkCountingCondition(failure, count)) continue;
            const applied = shouldApplyChaos(failure.probability, random);
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
              Object.defineProperty(this, 'responseText', { value: responseBody, configurable: true });
              const responseHeaders = failure.headers ?? {};
              Object.defineProperty(this, 'getResponseHeader', {
                value: (name: string) => {
                  const key = Object.keys(responseHeaders).find(
                    (k) => k.toLowerCase() === name.toLowerCase()
                  );
                  return key ? responseHeaders[key] : null;
                },
                configurable: true
              });
              Object.defineProperty(this, 'getAllResponseHeaders', {
                value: () =>
                  Object.entries(responseHeaders)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\r\n'),
                configurable: true
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

    // 4. Check for Corruption
    let selectedCorruption: NetworkCorruptionConfig | null = null;
    if (config.corruptions) {
      for (const corruption of config.corruptions) {
        if (matchUrl(url, corruption.urlPattern)) {
          if (!corruption.methods || corruption.methods.includes(method)) {
            const count = incrementCounter(corruption, counters);
            if (!checkCountingCondition(corruption, count)) continue;
            const applied = shouldApplyChaos(corruption.probability, random);
            if (!applied) {
              emitCorruptionEvent(emitter, corruption, url, method, false);
              continue;
            }
            selectedCorruption = corruption;
            break;
          }
        }
      }
    }

    if (selectedCorruption) {
      let settled = false;
      let corruptedText: string | null = null;

      const cleanup = () => {
        if (typeof this.removeEventListener !== 'function') return;
        this.removeEventListener('error', handleFailure);
        this.removeEventListener('abort', handleFailure);
        this.removeEventListener('loadend', handleLoadEnd);
      };

      const finalize = (applied: boolean) => {
        if (settled) return;
        settled = true;
        emitCorruptionEvent(emitter, selectedCorruption!, url, method, applied);
        cleanup();
      };

      const applyCorruption = () => {
        if (corruptedText !== null) {
          return corruptedText;
        }

        delete (this as any).responseText;

        try {
          const originalText = this.responseText;
          if (typeof originalText !== 'string') {
            Object.defineProperty(this, 'responseText', { value: originalText, configurable: true });
            finalize(false);
            return originalText;
          }

          corruptedText = corruptText(originalText, selectedCorruption.strategy);
          Object.defineProperty(this, 'responseText', { value: corruptedText, configurable: true });
          finalize(true);
          return corruptedText;
        } catch (error) {
          finalize(false);
          throw error;
        }
      };

      const handleFailure = () => {
        finalize(false);
      };

      const handleLoadEnd = () => {
        if (settled) return;
        try {
          applyCorruption();
        } catch {
          // applyCorruption already finalizes the event and preserves the throw path for direct access
        }
      };

      if (typeof this.addEventListener === 'function') {
        this.addEventListener('error', handleFailure);
        this.addEventListener('abort', handleFailure);
        this.addEventListener('loadend', handleLoadEnd);
      }

      Object.defineProperty(this, 'responseText', {
        get() {
          return applyCorruption();
        },
        configurable: true,
      });
    }

    // 5. Check for Latency
    if (config.latencies) {
      for (const latency of config.latencies) {
        if (matchUrl(url, latency.urlPattern)) {
          if (!latency.methods || latency.methods.includes(method)) {
            const count = incrementCounter(latency, counters);
            if (!checkCountingCondition(latency, count)) continue;
            const applied = shouldApplyChaos(latency.probability, random);
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

    // 6. If no chaos, proceed as normal
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
