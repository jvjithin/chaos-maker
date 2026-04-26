import { NetworkAbortConfig, NetworkConfig, NetworkCorruptionConfig, NetworkRuleMatchers } from '../config';
import { shouldApplyChaos, corruptText, matchUrl, incrementCounter, checkCountingCondition } from '../utils';
import {
  evaluateGraphQLRule,
  extractGraphQLOperation,
  GraphQLExtractResult,
  GraphQLRuleOutcome,
} from '../graphql';
import { ChaosEvent, ChaosEventEmitter, ChaosEventType } from '../events';

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

interface FetchBodyView {
  text: string | null;
  unparseable: boolean;
}

async function readFetchBody(input: RequestInfo | URL, init?: RequestInit): Promise<FetchBodyView> {
  const initBody = init?.body;
  if (initBody !== undefined && initBody !== null) {
    if (typeof initBody === 'string') return { text: initBody, unparseable: false };
    if (typeof URLSearchParams !== 'undefined' && initBody instanceof URLSearchParams) {
      return { text: initBody.toString(), unparseable: false };
    }
    if (typeof Blob !== 'undefined' && initBody instanceof Blob) {
      const looksTextual = initBody.type === '' || /json|text|graphql/i.test(initBody.type);
      if (!looksTextual) return { text: null, unparseable: true };
      try {
        return { text: await initBody.text(), unparseable: false };
      } catch {
        return { text: null, unparseable: true };
      }
    }
    return { text: null, unparseable: true };
  }

  if (isRequest(input)) {
    if (input.body === null) return { text: null, unparseable: false };
    try {
      return { text: await input.clone().text(), unparseable: false };
    } catch {
      return { text: null, unparseable: true };
    }
  }

  return { text: null, unparseable: false };
}

function emitGraphQLDiagnostic(
  emitter: ChaosEventEmitter | undefined,
  type: ChaosEventType,
  url: string,
  method: string,
  detail: ChaosEvent['detail'],
): void {
  emitter?.emit({
    type,
    timestamp: Date.now(),
    applied: false,
    detail: { url, method, ...detail, reason: 'graphql-body-unparseable' },
  });
}

/**
 * Run the shared per-rule gate: urlPattern + methods + GraphQL operation +
 * counting. Returns `proceed: true` only when the rule should evaluate
 * probability for this request.
 */
function gateRule(
  rule: NetworkRuleMatchers & { onNth?: number; everyNth?: number; afterN?: number },
  url: string,
  method: string,
  gqlExtract: GraphQLExtractResult,
  counters: Map<object, number>,
): { proceed: boolean; outcome: GraphQLRuleOutcome | null } {
  if (!matchUrl(url, rule.urlPattern)) return { proceed: false, outcome: null };
  if (rule.methods && !rule.methods.includes(method)) return { proceed: false, outcome: null };

  const outcome = evaluateGraphQLRule(rule.graphqlOperation, gqlExtract);
  if (outcome.kind === 'no-match' || outcome.kind === 'unparseable') {
    return { proceed: false, outcome };
  }

  const count = incrementCounter(rule, counters);
  if (!checkCountingCondition(rule, count)) return { proceed: false, outcome };
  return { proceed: true, outcome };
}

function operationDetail(outcome: GraphQLRuleOutcome | null): { operationName?: string } {
  if (!outcome) return {};
  if (outcome.kind === 'match' || outcome.kind === 'skip-no-constraint') {
    return outcome.operationName ? { operationName: outcome.operationName } : {};
  }
  return {};
}

function emitAbortEvent(
  emitter: ChaosEventEmitter | undefined,
  abort: NetworkAbortConfig,
  url: string,
  method: string,
  applied: boolean,
  outcome: GraphQLRuleOutcome | null,
): void {
  emitter?.emit({
    type: 'network:abort',
    timestamp: Date.now(),
    applied,
    detail: { url, method, timeoutMs: abort.timeout, ...operationDetail(outcome) },
  });
}

function emitCorruptionEvent(
  emitter: ChaosEventEmitter | undefined,
  corruption: NetworkCorruptionConfig,
  url: string,
  method: string,
  applied: boolean,
  outcome: GraphQLRuleOutcome | null,
): void {
  emitter?.emit({
    type: 'network:corruption',
    timestamp: Date.now(),
    applied,
    detail: { url, method, strategy: corruption.strategy, ...operationDetail(outcome) },
  });
}

function ruleHasGraphQLConstraint(rule: NetworkRuleMatchers): boolean {
  return rule.graphqlOperation !== undefined;
}

export function patchFetch(originalFetch: typeof globalThis.fetch, config: NetworkConfig, random: () => number, emitter?: ChaosEventEmitter, counters: Map<object, number> = new Map()) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = getFetchUrl(input);
    const method = getFetchMethod(input, init);
    const existingSignal = getFetchSignal(input, init);

    // Body extraction: only when at least one rule wants GraphQL matching to
    // avoid paying the .clone()/.text() cost on every request.
    const needsGqlExtract = (() => {
      const groups = [config.failures, config.latencies, config.aborts, config.corruptions, config.cors];
      for (const group of groups) {
        if (group?.some(ruleHasGraphQLConstraint)) return true;
      }
      return false;
    })();

    let gqlExtract: GraphQLExtractResult = { kind: 'not-graphql' };
    if (needsGqlExtract) {
      const body = await readFetchBody(input, init);
      gqlExtract = extractGraphQLOperation(method, url, body.text, body.unparseable);
    }

    // 1. Check for CORS
    if (config.cors) {
      for (const cors of config.cors) {
        if (!matchUrl(url, cors.urlPattern)) continue;
        if (cors.methods && !cors.methods.includes(method)) continue;
        const outcome = evaluateGraphQLRule(cors.graphqlOperation, gqlExtract);
        if (outcome.kind === 'no-match') continue;
        if (outcome.kind === 'unparseable') {
          emitGraphQLDiagnostic(emitter, 'network:cors', url, method, {});
          continue;
        }
        const count = incrementCounter(cors, counters);
        if (!checkCountingCondition(cors, count)) continue;
        const applied = shouldApplyChaos(cors.probability, random);
        emitter?.emit({
          type: 'network:cors',
          timestamp: Date.now(),
          applied,
          detail: { url, method, ...operationDetail(outcome) },
        });
        if (applied) {
          console.debug(`[chaos-maker] CORS block: ${method} ${url}`);
          // Mimic a real browser network error with a clean stack trace.
          const error = new TypeError('Failed to fetch');
          error.stack = '';
          throw error;
        }
      }
    }

    // 2. Check for Abort
    let selectedAbort: NetworkAbortConfig | null = null;
    let selectedAbortOutcome: GraphQLRuleOutcome | null = null;
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
      emitAbortEvent(emitter, selectedAbort, url, method, applied, selectedAbortOutcome);
    };

    if (config.aborts) {
      for (const abort of config.aborts) {
        const gate = gateRule(abort, url, method, gqlExtract, counters);
        if (!gate.proceed) {
          if (gate.outcome?.kind === 'unparseable') {
            emitGraphQLDiagnostic(emitter, 'network:abort', url, method, { timeoutMs: abort.timeout });
          }
          continue;
        }
        const applied = shouldApplyChaos(abort.probability, random);
        if (!applied) {
          emitAbortEvent(emitter, abort, url, method, false, gate.outcome);
          continue;
        }

        console.warn(`CHAOS: Aborting ${method} ${url} after ${abort.timeout || 0}ms`);
        selectedAbort = abort;
        selectedAbortOutcome = gate.outcome;

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
        const gate = gateRule(failure, url, method, gqlExtract, counters);
        if (!gate.proceed) {
          if (gate.outcome?.kind === 'unparseable') {
            emitGraphQLDiagnostic(emitter, 'network:failure', url, method, { statusCode: failure.statusCode });
          }
          continue;
        }
        const applied = shouldApplyChaos(failure.probability, random);
        emitter?.emit({
          type: 'network:failure',
          timestamp: Date.now(),
          applied,
          detail: { url, method, statusCode: failure.statusCode, ...operationDetail(gate.outcome) },
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

    // 4. Check for Latency
    if (config.latencies) {
      for (const latency of config.latencies) {
        const gate = gateRule(latency, url, method, gqlExtract, counters);
        if (!gate.proceed) {
          if (gate.outcome?.kind === 'unparseable') {
            emitGraphQLDiagnostic(emitter, 'network:latency', url, method, { delayMs: latency.delayMs });
          }
          continue;
        }
        const applied = shouldApplyChaos(latency.probability, random);
        emitter?.emit({
          type: 'network:latency',
          timestamp: Date.now(),
          applied,
          detail: { url, method, delayMs: latency.delayMs, ...operationDetail(gate.outcome) },
        });
        if (applied) {
          console.warn(`CHAOS: Adding ${latency.delayMs}ms latency to ${method} ${url}`);
          await new Promise(res => setTimeout(res, latency.delayMs));
        }
      }
    }

    // 5. Determine Corruption (applied after fetch)
    let selectedCorruption: NetworkCorruptionConfig | null = null;
    let selectedCorruptionOutcome: GraphQLRuleOutcome | null = null;
    if (config.corruptions) {
      for (const corruption of config.corruptions) {
        const gate = gateRule(corruption, url, method, gqlExtract, counters);
        if (!gate.proceed) {
          if (gate.outcome?.kind === 'unparseable') {
            emitGraphQLDiagnostic(emitter, 'network:corruption', url, method, { strategy: corruption.strategy });
          }
          continue;
        }
        const applied = shouldApplyChaos(corruption.probability, random);
        if (!applied) {
          emitCorruptionEvent(emitter, corruption, url, method, false, gate.outcome);
          continue;
        }
        selectedCorruption = corruption;
        selectedCorruptionOutcome = gate.outcome;
        break; // Apply only one corruption
      }
    }

    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      if (selectedCorruption) {
        emitCorruptionEvent(emitter, selectedCorruption, url, method, false, selectedCorruptionOutcome);
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
      emitCorruptionEvent(emitter, selectedCorruption, url, method, true, selectedCorruptionOutcome);
      return new Response(corruptedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      emitCorruptionEvent(emitter, selectedCorruption, url, method, false, selectedCorruptionOutcome);
      throw error;
    }
  };
}
