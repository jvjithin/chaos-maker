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
  | 'rule-group:gated';

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
  };
}

export type ChaosEventListener = (event: ChaosEvent) => void;

export class ChaosEventEmitter {
  private listeners: Map<string, Set<ChaosEventListener>> = new Map();
  private log: ChaosEvent[] = [];

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
