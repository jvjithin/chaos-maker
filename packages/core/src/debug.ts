/**
 * Debug Mode (RFC-002).
 *
 * Two-sink logger that fires when `ChaosConfig.debug` is `true`:
 *   1. Structured `type: 'debug'` events through `ChaosEventEmitter` —
 *      consumers subscribe via `instance.on('debug', cb)` and switch on
 *      `event.detail.stage` for the stage taxonomy.
 *   2. A formatted `[Chaos] <stage> ...` line to `console.debug`. Hidden by
 *      default in CI loggers, visible in browser DevTools.
 *
 * Framework-agnostic: never reads `process.env.DEBUG`, `--debug`, or
 * `localStorage.debug`. The only signal is `ChaosConfig.debug`.
 */

import type { ChaosConfig } from './config';
import type { ChaosDebugStage, ChaosEvent } from './events';

export type { ChaosDebugStage } from './events';

export interface DebugOptions {
  enabled: boolean;
}

export function normalizeDebugOption(input: boolean | DebugOptions | undefined): DebugOptions {
  if (input === undefined) return { enabled: false };
  if (typeof input === 'boolean') return { enabled: input };
  return { enabled: input.enabled };
}

/** Identity assigned to every rule object in a config snapshot. */
export interface RuleIdEntry {
  ruleType: string;
  ruleId: string;
}

const RULE_TYPE_BY_ARRAY: ReadonlyArray<{
  pick: (cfg: ChaosConfig) => readonly object[] | undefined;
  ruleType: string;
}> = [
  { pick: (c) => c.network?.failures, ruleType: 'failure' },
  { pick: (c) => c.network?.latencies, ruleType: 'latency' },
  { pick: (c) => c.network?.aborts, ruleType: 'abort' },
  { pick: (c) => c.network?.corruptions, ruleType: 'corruption' },
  { pick: (c) => c.network?.cors, ruleType: 'cors' },
  { pick: (c) => c.ui?.assaults, ruleType: 'ui-assault' },
  { pick: (c) => c.websocket?.drops, ruleType: 'ws-drop' },
  { pick: (c) => c.websocket?.delays, ruleType: 'ws-delay' },
  { pick: (c) => c.websocket?.corruptions, ruleType: 'ws-corrupt' },
  { pick: (c) => c.websocket?.closes, ruleType: 'ws-close' },
  { pick: (c) => c.sse?.drops, ruleType: 'sse-drop' },
  { pick: (c) => c.sse?.delays, ruleType: 'sse-delay' },
  { pick: (c) => c.sse?.corruptions, ruleType: 'sse-corrupt' },
  { pick: (c) => c.sse?.closes, ruleType: 'sse-close' },
];

/**
 * Build a positional rule-id map for a config snapshot. IDs are
 * `<ruleType>#<index>` derived from the order rules appear in their array.
 * Reordering rules between runs changes the IDs — acceptable for in-test
 * diagnostics per RFC-002.
 */
export function buildRuleIdMap(config: ChaosConfig): WeakMap<object, RuleIdEntry> {
  const map = new WeakMap<object, RuleIdEntry>();
  for (const { pick, ruleType } of RULE_TYPE_BY_ARRAY) {
    const arr = pick(config);
    if (!arr) continue;
    arr.forEach((rule, index) => {
      map.set(rule as object, { ruleType, ruleId: `${ruleType}#${index}` });
    });
  }
  return map;
}

/** Build the human-readable line mirrored to `console.debug`. */
export function formatDebugMessage(stage: ChaosDebugStage, detail: ChaosEvent['detail']): string {
  const parts: string[] = [];
  if (detail.ruleId) parts.push(`rule=${detail.ruleId}`);
  if (detail.phase) parts.push(detail.phase);
  if (detail.method) parts.push(detail.method);
  if (detail.url) parts.push(detail.url);
  if (detail.statusCode !== undefined) parts.push(`-> ${detail.statusCode}`);
  if (detail.delayMs !== undefined) parts.push(`+${detail.delayMs}ms`);
  if (detail.direction) parts.push(detail.direction);
  if (detail.eventType) parts.push(`event=${detail.eventType}`);
  if (detail.selector) parts.push(`selector=${detail.selector}`);
  if (detail.action) parts.push(`action=${detail.action}`);
  if (detail.strategy) parts.push(`strategy=${detail.strategy}`);
  if (detail.groupName) parts.push(`group=${detail.groupName}`);
  if (detail.reason) parts.push(`reason=${detail.reason}`);
  return parts.length === 0 ? `[Chaos] ${stage}` : `[Chaos] ${stage}: ${parts.join(' ')}`;
}

export class Logger {
  constructor(private readonly opts: DebugOptions, private readonly target: 'page' | 'sw' = 'page') {}

  isEnabled(): boolean {
    return this.opts.enabled;
  }

  /**
   * Build a `type: 'debug'` event with `detail.stage = stage`, mirror the
   * formatted line to `console.debug`, and return the event for the emitter
   * to fan out. The formatted string is never stored on the event payload.
   */
  log(stage: ChaosDebugStage, detail: ChaosEvent['detail']): ChaosEvent {
    const finalDetail: ChaosEvent['detail'] = { ...detail, stage };
    const event: ChaosEvent = {
      type: 'debug',
      timestamp: Date.now(),
      applied: false,
      detail: finalDetail,
    };
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      const prefix = this.target === 'sw' ? '[Chaos SW] ' : '';
      console.debug(`${prefix}${formatDebugMessage(stage, finalDetail)}`);
    }
    return event;
  }
}
