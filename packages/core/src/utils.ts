import type { CorruptionStrategy, RequestCountingOptions } from './config';

export function shouldApplyChaos(probability: number, random: () => number): boolean {
  return random() < probability;
}

/**
 * Increment the per-rule request counter and return the new count.
 * Keyed by the rule object reference so the same counter is shared across
 * fetch and XHR interceptors for a given config entry.
 */
export function incrementCounter(rule: object, counters: Map<object, number>): number {
  const next = (counters.get(rule) ?? 0) + 1;
  counters.set(rule, next);
  return next;
}

/**
 * Given a rule with optional counting fields and the current (already-incremented)
 * request count for that rule, return whether the chaos should fire this request.
 * Returns `true` when no counting field is set (counting is always opt-in).
 */
export function checkCountingCondition(rule: RequestCountingOptions, count: number): boolean {
  if (rule.onNth !== undefined) return count === rule.onNth;
  if (rule.everyNth !== undefined) return count % rule.everyNth === 0;
  if (rule.afterN !== undefined) return count > rule.afterN;
  return true;
}

export function matchUrl(url: string, pattern: string): boolean {
  if (pattern === '*') return true;
  return url.includes(pattern);
}

export function corruptText(text: string, strategy: CorruptionStrategy): string {
  switch (strategy) {
    case 'truncate':
      return text.slice(0, Math.max(0, Math.floor(text.length / 2)));
    case 'malformed-json':
      return `${text}"}`;
    case 'empty':
      return '';
    case 'wrong-type':
      return '<html><body>Unexpected HTML</body></html>';
  }
}
