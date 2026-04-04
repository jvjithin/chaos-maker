import { NetworkAbortConfig, NetworkConfig, NetworkCorruptionConfig } from '../config';
import { shouldApplyChaos, corruptText } from '../utils';
import { ChaosEventEmitter } from '../events';

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function getFetchUrl(input: RequestInfo | URL): string {
  return isRequest(input) ? input.url : input.toString();
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (isRequest(input)) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function getFetchSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) {
    return init.signal;
  }
  if (isRequest(input)) {
    return input.signal;
  }
  return undefined;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The user aborted a request.', 'AbortError');
  }

  const error = new Error('The user aborted a request.');
  error.name = 'AbortError';
  return error;
}

function mergeAbortSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) {
    return primary;
  }

  const controller = new AbortController();

  const abortFrom = (signal: AbortSignal) => {
    cleanup();
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  const onPrimaryAbort = () => abortFrom(primary);
  const onSecondaryAbort = () => abortFrom(secondary);

  const cleanup = () => {
    primary.removeEventListener('abort', onPrimaryAbort);
    secondary.removeEventListener('abort', onSecondaryAbort);
  };

  if (primary.aborted) {
    abortFrom(primary);
    return controller.signal;
  }

  if (secondary.aborted) {
    abortFrom(secondary);
    return controller.signal;
  }

  primary.addEventListener('abort', onPrimaryAbort, { once: true });
  secondary.addEventListener('abort', onSecondaryAbort, { once: true });
  return controller.signal;
}

function withSignal(init: RequestInit | undefined, signal: AbortSignal | undefined): RequestInit | undefined {
  if (!signal) {
    return init;
  }

  return {
    ...(init ?? {}),
    signal,
  };
}

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

export function patchFetch(originalFetch: typeof window.fetch, config: NetworkConfig, emitter?: ChaosEventEmitter) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = getFetchUrl(input);
    const method = getFetchMethod(input, init);
    const existingSignal = getFetchSignal(input, init);

    // 1. Check for CORS
    if (config.cors) {
      for (const cors of config.cors) {
        if (url.includes(cors.urlPattern)) {
          if (!cors.methods || cors.methods.includes(method)) {
            const applied = shouldApplyChaos(cors.probability);
            emitter?.emit({
              type: 'network:cors',
              timestamp: Date.now(),
              applied,
              detail: { url, method },
            });
            if (applied) {
              console.debug(`[chaos-maker] CORS block: ${method} ${url}`);
              // Mimic a real browser network error. Sanitize the stack so
              // Chrome doesn't attribute the rejection to the extension.
              const error = new TypeError('Failed to fetch');
              error.stack = '';
              throw error;
            }
          }
        }
      }
    }

    // 2. Check for Abort
    let selectedAbort: NetworkAbortConfig | null = null;
    let abortSignal: AbortSignal | undefined;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    let abortEventSettled = false;

    const settleAbortEvent = (applied: boolean) => {
      if (!selectedAbort || abortEventSettled) {
        return;
      }
      abortEventSettled = true;
      if (abortTimer) {
        clearTimeout(abortTimer);
        abortTimer = undefined;
      }
      emitAbortEvent(emitter, selectedAbort, url, method, applied);
    };

    if (config.aborts) {
      for (const abort of config.aborts) {
        if (url.includes(abort.urlPattern)) {
          if (!abort.methods || abort.methods.includes(method)) {
            const applied = shouldApplyChaos(abort.probability);
            if (!applied) {
              emitAbortEvent(emitter, abort, url, method, false);
              continue;
            }

            console.warn(`CHAOS: Aborting ${method} ${url} after ${abort.timeout || 0}ms`);
            selectedAbort = abort;

            const chaosController = new AbortController();
            abortSignal = mergeAbortSignals(chaosController.signal, existingSignal);

            const applyAbort = () => {
              if (abortEventSettled) {
                return;
              }
              settleAbortEvent(true);
              chaosController.abort(createAbortError());
            };

            if (abort.timeout) {
              abortTimer = setTimeout(applyAbort, abort.timeout);
            } else {
              applyAbort();
            }
            break;
          }
        }
      }
    }

    if (selectedAbort) {
      try {
        const response = await originalFetch(input, withSignal(init, abortSignal));
        settleAbortEvent(false);
        return response;
      } catch (error) {
        settleAbortEvent(false);
        throw error;
      }
    }

    // 3. Check for Failures
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

    // 4. Check for Latency
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

    // 5. Determine Corruption (applied after fetch)
    let selectedCorruption: NetworkCorruptionConfig | null = null;
    if (config.corruptions) {
      for (const corruption of config.corruptions) {
        if (url.includes(corruption.urlPattern)) {
          if (!corruption.methods || corruption.methods.includes(method)) {
            const applied = shouldApplyChaos(corruption.probability);
            if (!applied) {
              emitCorruptionEvent(emitter, corruption, url, method, false);
              continue;
            }
            selectedCorruption = corruption;
            break; // Apply only one corruption
          }
        }
      }
    }

    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      if (selectedCorruption) {
        emitCorruptionEvent(emitter, selectedCorruption, url, method, false);
      }
      throw error;
    }

    if (!selectedCorruption) {
      return response;
    }

    try {
      console.warn(`CHAOS: Corrupting response for ${method} ${url} with strategy: ${selectedCorruption.strategy}`);
      const text = await response.text();
      const corruptedText = corruptText(text, selectedCorruption.strategy);
      emitCorruptionEvent(emitter, selectedCorruption, url, method, true);
      return new Response(corruptedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      emitCorruptionEvent(emitter, selectedCorruption, url, method, false);
      throw error;
    }
  };
}
