import type { Logger, RuleIdEntry } from './debug';

export type ChaosEventType =
  | 'network:failure'
  | 'network:latency'
  | 'network:abort'
  | 'network:corruption'
  | 'network:cors'
  | 'ui:assault'
  | 'websocket:drop'
  | 'websocket:delay'
  | 'websocket:corrupt'
  | 'websocket:close'
  | 'sse:drop'
  | 'sse:delay'
  | 'sse:corrupt'
  | 'sse:close'
  /** Emitted once per `enableGroup()` call. `applied: true`. (RFC-001) */
  | 'rule-group:enabled'
  /** Emitted once per `disableGroup()` call. `applied: true`. (RFC-001) */
  | 'rule-group:disabled'
  /** Emitted once per group per toggle cycle when a rule is skipped because
   *  its group is disabled. Deduped — at most one event per group between
   *  toggles to avoid log floods. `applied: false`. (RFC-001) */
  | 'rule-group:gated'
  /** Single Debug Mode event type (RFC-002). The concrete stage of the rule
   *  decision pipeline lives on `detail.stage`. `applied: false`. */
  | 'debug';

/** RFC-002 stage taxonomy. Stable strings used as `detail.stage` on every
 *  `type: 'debug'` event. Defined here (not in `debug.ts`) so the event-detail
 *  union can reference it without a circular runtime import. */
export type ChaosDebugStage =
  | 'rule-evaluating'
  | 'rule-matched'
  | 'rule-skip-match'
  | 'rule-skip-counting'
  | 'rule-skip-group'
  | 'rule-skip-probability'
  | 'rule-applied'
  | 'lifecycle';

/** RFC-002 lifecycle phases. Set on `detail.phase` only when
 *  `detail.stage === 'lifecycle'`. WS/SSE direction continues to live on
 *  the existing `detail.direction` field — `phase` is intentionally
 *  lifecycle-only to avoid overloading. */
export type ChaosLifecyclePhase =
  | 'engine:start'
  | 'engine:stop'
  | 'engine:group-toggled'
  | 'sw:install'
  | 'sw:config-applied'
  | 'sw:config-stopped'
  | 'sw:group-toggled';

export interface ChaosEvent {
  type: ChaosEventType;
  timestamp: number;
  applied: boolean;
  detail: {
    url?: string;
    method?: string;
    statusCode?: number;
    delayMs?: number;
    timeoutMs?: number;
    strategy?: string;
    selector?: string;
    action?: string;
    /** WebSocket message direction (for `websocket:*` events). */
    direction?: 'inbound' | 'outbound';
    /** WebSocket payload kind (for `websocket:*` events). */
    payloadType?: 'text' | 'binary';
    /** WebSocket close code (for `websocket:close` events). */
    closeCode?: number;
    /** WebSocket close reason (for `websocket:close` events). */
    closeReason?: string;
    /** SSE event type (for `sse:*` events). `'message'` is the spec default. */
    eventType?: string;
    /** GraphQL operation name (for `network:*` events when the request was
     *  detected as a GraphQL operation). Pivot on this to slice events by
     *  operation in dashboards / assertions. */
    operationName?: string;
    /** Reason string for diagnostic `applied: false` events. */
    reason?: string;
    /** Group name (for `rule-group:*` events, and on gated rule diagnostics). */
    groupName?: string;
    /** RFC-002. Concrete stage of a rule's decision pipeline. Set on every
     *  `type: 'debug'` event; unset on non-debug events. */
    stage?: ChaosDebugStage;
    /** RFC-002. Lifecycle phase, set only when `stage === 'lifecycle'`. */
    phase?: ChaosLifecyclePhase;
    /** RFC-002. Rule category — `'failure' | 'latency' | 'abort' | ...`. */
    ruleType?: string;
    /** RFC-002. Deterministic identifier for a specific rule WITHIN A SINGLE
     *  CONFIG SNAPSHOT. Positional: reordering rules in your config changes
     *  the IDs. Sufficient for in-test diagnostic pinpointing in v0.5.0. */
    ruleId?: string;
    /** RFC-002. Optional human label for a rule (future builder field).
     *  Reserved so the event shape doesn't churn when the builder later
     *  gains `.failRequests({..., name: 'slow-api'})`. */
    ruleName?: string;
  };
}

export type ChaosEventListener = (event: ChaosEvent) => void;

export class ChaosEventEmitter {
  private listeners: Map<string, Set<ChaosEventListener>> = new Map();
  private log: ChaosEvent[] = [];
  private logger: Logger | undefined;
  private ruleIds: WeakMap<object, RuleIdEntry> | undefined;

  constructor(private readonly maxLogEntries = 2000) {}

  on(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  off(type: ChaosEventType | '*', listener: ChaosEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(event: ChaosEvent): void {
    this.log.push(event);
    if (this.log.length > this.maxLogEntries) {
      this.log.shift();
    }

    this.notify(this.listeners.get(event.type), event);
    this.notify(this.listeners.get('*'), event);
  }

  /** Attach a Debug Mode logger. When unset, `debug()` is a fast-path no-op. */
  setLogger(logger: Logger | undefined): void {
    this.logger = logger;
  }

  /** Attach the rule-id map so debug events auto-resolve `ruleType` /
   *  `ruleId` from a rule object reference. */
  setRuleIds(map: WeakMap<object, RuleIdEntry> | undefined): void {
    this.ruleIds = map;
  }

  /**
   * Emit a Debug Mode event. Fast-path no-op when no logger is attached —
   * single undefined-check before any allocation. When `rule` is supplied
   * and present in the rule-id map, `detail.ruleType` and `detail.ruleId`
   * are filled in automatically.
   */
  debug(stage: ChaosDebugStage, detail: ChaosEvent['detail'], rule?: object): void {
    if (!this.logger) return;
    const id = rule ? this.ruleIds?.get(rule) : undefined;
    const finalDetail = id ? { ...detail, ruleType: id.ruleType, ruleId: id.ruleId } : detail;
    const evt = this.logger.log(stage, finalDetail);
    this.emit(evt);
  }

  getLog(): ChaosEvent[] {
    return [...this.log];
  }

  clearLog(): void {
    this.log = [];
  }

  private notify(listeners: Set<ChaosEventListener> | undefined, event: ChaosEvent): void {
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // prevent listener errors from breaking emitter flow
      }
    }
  }
}
