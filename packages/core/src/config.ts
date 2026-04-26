/** Counting options shared by all network chaos config types.
 *  At most one of `onNth`, `everyNth`, or `afterN` may be set on a single rule.
 *  Counting is per-rule and shared across fetch + XHR (only increments when a
 *  request matches `urlPattern` + `methods`).
 *  - `onNth`    – apply chaos only on the Nth matching request (1-based). e.g. `onNth: 3` fires on the 3rd request only.
 *  - `everyNth` – apply chaos on every Nth matching request. e.g. `everyNth: 3` fires on the 3rd, 6th, 9th, …
 *  - `afterN`   – apply chaos only after the first N matching requests have passed through. e.g. `afterN: 3` fires from the 4th request onward.
 */
export interface RequestCountingOptions {
  onNth?: number;
  everyNth?: number;
  afterN?: number;
}

/** Match a GraphQL operation by name. Applied AFTER `urlPattern` + `methods`
 *  as an additive filter — never a replacement. Matches against:
 *  - JSON `operationName` field on POST request bodies, OR
 *  - the operation name parsed from the `query` field (e.g. `query GetUser { … }`),
 *  - `?operationName=` query parameter for persisted-query GET requests.
 *
 *  When the rule has `graphqlOperation` set but the request body cannot be
 *  parsed (multipart upload, ReadableStream, binary), the rule is skipped and
 *  a diagnostic event is emitted with `applied: false, reason: 'graphql-body-unparseable'`.
 *  XHR requests with non-string bodies are treated the same way.
 *
 *  - `string` matches the operation name exactly.
 *  - `RegExp` matches when `.test(operationName)` returns true.
 */
export type GraphQLOperationMatcher = string | RegExp;

/** Common matcher fields shared by every network chaos rule type. */
export interface NetworkRuleMatchers {
  urlPattern: string;
  methods?: string[];
  graphqlOperation?: GraphQLOperationMatcher;
}

export interface NetworkFailureConfig extends RequestCountingOptions, NetworkRuleMatchers {
  statusCode: number;
  probability: number;
  body?: string;
  statusText?: string;
  headers?: Record<string, string>;
}

export interface NetworkLatencyConfig extends RequestCountingOptions, NetworkRuleMatchers {
  delayMs: number;
  probability: number;
}

export interface NetworkAbortConfig extends RequestCountingOptions, NetworkRuleMatchers {
  probability: number;
  timeout?: number; // ms before abort; 0 or omitted = immediate
}

export type CorruptionStrategy = 'truncate' | 'malformed-json' | 'empty' | 'wrong-type';

export interface NetworkCorruptionConfig extends RequestCountingOptions, NetworkRuleMatchers {
  probability: number;
  strategy: CorruptionStrategy;
}

export interface NetworkCorsConfig extends RequestCountingOptions, NetworkRuleMatchers {
  probability: number;
}

export interface NetworkConfig {
  failures?: NetworkFailureConfig[];
  latencies?: NetworkLatencyConfig[];
  aborts?: NetworkAbortConfig[];
  corruptions?: NetworkCorruptionConfig[];
  cors?: NetworkCorsConfig[];
}

export interface UiAssaultConfig {
  selector: string;
  action: 'disable' | 'hide' | 'remove';
  probability: number;
}

export interface UiConfig {
  assaults?: UiAssaultConfig[];
}

/** Direction of a WebSocket message relative to the client.
 *  - `outbound` = client → server (intercepted at `.send()`).
 *  - `inbound`  = server → client (intercepted at `message` event dispatch).
 *  - `both`     = apply independently in either direction.
 */
export type WebSocketDirection = 'inbound' | 'outbound' | 'both';

export interface WebSocketDropConfig extends RequestCountingOptions {
  urlPattern: string;
  direction: WebSocketDirection;
  probability: number;
}

export interface WebSocketDelayConfig extends RequestCountingOptions {
  urlPattern: string;
  direction: WebSocketDirection;
  delayMs: number;
  probability: number;
}

/** Strategies for corrupting WebSocket payloads.
 *  `truncate` and `empty` apply to both text and binary payloads.
 *  `malformed-json` and `wrong-type` apply to text payloads only; when the
 *  actual payload at runtime is binary, corruption is skipped and an event is
 *  emitted with `applied: false`.
 */
export type WebSocketCorruptionStrategy = 'truncate' | 'malformed-json' | 'empty' | 'wrong-type';

export interface WebSocketCorruptConfig extends RequestCountingOptions {
  urlPattern: string;
  direction: WebSocketDirection;
  strategy: WebSocketCorruptionStrategy;
  probability: number;
}

export interface WebSocketCloseConfig extends RequestCountingOptions {
  urlPattern: string;
  /**
   * WebSocket close code. Must be either `1000` (Normal Closure) or in the
   * `3000–4999` range per the WebSocket spec; other values are rejected by
   * the browser's `close()` call. Defaults to `1000`. Use `4000–4999` for
   * application-defined chaos codes.
   */
  code?: number;
  /**
   * WebSocket close reason string. Must encode to <= 123 UTF-8 bytes per the
   * spec. Defaults to `"Chaos Maker close"`.
   */
  reason?: string;
  /** Delay after `open` before closing, in ms. Default 0 = close immediately. */
  afterMs?: number;
  probability: number;
}

export interface WebSocketConfig {
  drops?: WebSocketDropConfig[];
  delays?: WebSocketDelayConfig[];
  corruptions?: WebSocketCorruptConfig[];
  closes?: WebSocketCloseConfig[];
}

/** Strategies for corrupting Server-Sent Event payloads.
 *  All four strategies operate on `event.data` (always a string per the SSE
 *  spec). Mirrors the fetch / WebSocket corruption shape so the same
 *  vocabulary applies across protocols.
 */
export type SSECorruptionStrategy = 'truncate' | 'malformed-json' | 'empty' | 'wrong-type';

/** Filter SSE chaos to a specific event type.
 *  - `'message'` (default in the spec) targets unnamed events fired via
 *    `onmessage` / `addEventListener('message', …)`.
 *  - Any other string targets named events dispatched with `event:` lines.
 *  - `'*'` matches every event regardless of name.
 */
export type SSEEventTypeMatcher = string | '*';

export interface SSEDropConfig extends RequestCountingOptions {
  urlPattern: string;
  eventType?: SSEEventTypeMatcher;
  probability: number;
}

export interface SSEDelayConfig extends RequestCountingOptions {
  urlPattern: string;
  eventType?: SSEEventTypeMatcher;
  delayMs: number;
  probability: number;
}

export interface SSECorruptConfig extends RequestCountingOptions {
  urlPattern: string;
  eventType?: SSEEventTypeMatcher;
  strategy: SSECorruptionStrategy;
  probability: number;
}

export interface SSECloseConfig extends RequestCountingOptions {
  urlPattern: string;
  /** Delay after `open` before dispatching `error` + closing, in ms. Default 0. */
  afterMs?: number;
  probability: number;
}

export interface SSEConfig {
  drops?: SSEDropConfig[];
  delays?: SSEDelayConfig[];
  corruptions?: SSECorruptConfig[];
  closes?: SSECloseConfig[];
}

export interface ChaosConfig {
  network?: NetworkConfig;
  ui?: UiConfig;
  websocket?: WebSocketConfig;
  sse?: SSEConfig;
  /**
   * Seed for Chaos Maker's PRNG.
   *
   * The seed controls every probability-driven chaos decision across network,
   * UI, and WebSocket rules. With the same seed and the same interaction
   * sequence, Chaos Maker emits the same `ChaosEvent` decision sequence after
   * normalizing runtime-only fields such as `timestamp`.
   *
   * When omitted, Chaos Maker auto-generates a seed from `Math.random()` during
   * instance creation. Read it with the adapter's `getChaosSeed()` helper and
   * log it on failure to replay the run.
   *
   * The seed does not control browser-native nondeterminism, wall-clock
   * timestamps, network/server timing, or task-scheduler ordering in the app
   * under test.
   */
  seed?: number;
}
