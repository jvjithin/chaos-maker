import { NetworkAbortConfig, NetworkConfig, NetworkCorruptionConfig, NetworkRuleMatchers } from '../config';
import { shouldApplyChaos, corruptText, matchUrl, incrementCounter, checkCountingCondition } from '../utils';
import {
  evaluateGraphQLRule,
  extractGraphQLOperation,
  GraphQLExtractResult,
  GraphQLRuleOutcome,
} from '../graphql';
import { ChaosEvent, ChaosEventEmitter, ChaosEventType } from '../events';

interface XhrBodyView {
  text: string | null;
  unparseable: boolean;
}

function readXhrBody(body: Document | XMLHttpRequestBodyInit | null | undefined): XhrBodyView {
  if (body === undefined || body === null) return { text: null, unparseable: false };
  if (typeof body === 'string') return { text: body, unparseable: false };
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { text: body.toString(), unparseable: false };
  }
  // Blob, FormData, ArrayBuffer, TypedArray, Document — synchronous reads
  // aren't possible. Treat as unparseable so rules with graphqlOperation can
  // emit a diagnostic.
  return { text: null, unparseable: true };
}

function ruleHasGraphQLConstraint(rule: NetworkRuleMatchers): boolean {
  return rule.graphqlOperation !== undefined;
}

function configHasGraphQLRule(config: NetworkConfig): boolean {
  const groups = [config.failures, config.latencies, config.aborts, config.corruptions, config.cors];
  for (const group of groups) {
    if (group?.some(ruleHasGraphQLConstraint)) return true;
  }
  return false;
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

export function patchXHR(originalXhrSend: (body?: Document | XMLHttpRequestBodyInit) => void, config: NetworkConfig, random: () => number, emitter?: ChaosEventEmitter, counters: Map<object, number> = new Map()) {
  const needsGqlExtract = configHasGraphQLRule(config);

  return function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit) {
    const url = (this as any)._chaos_url;
    const method = (this as any)._chaos_method;

    let gqlExtract: GraphQLExtractResult = { kind: 'not-graphql' };
    if (needsGqlExtract) {
      const view = readXhrBody(body);
      gqlExtract = extractGraphQLOperation(method, url, view.text, view.unparseable);
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
          Object.defineProperty(this, 'status', { value: 0 });
          Object.defineProperty(this, 'statusText', { value: '' });
          this.dispatchEvent(new Event('error'));
          this.dispatchEvent(new Event('loadend'));
          return;
        }
      }
    }

    // 2. Check for Abort
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
          emitAbortEvent(emitter, abort, url, method, didAbort, gate.outcome);
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

    // 4. Check for Corruption
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
        break;
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
        emitCorruptionEvent(emitter, selectedCorruption!, url, method, applied, selectedCorruptionOutcome);
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
          setTimeout(() => {
            originalXhrSend.call(this, body);
          }, latency.delayMs);
          return;
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
