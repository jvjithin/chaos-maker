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

export interface NetworkFailureConfig extends RequestCountingOptions {
  urlPattern: string;
  methods?: string[];
  statusCode: number;
  probability: number;
  body?: string;
  statusText?: string;
  headers?: Record<string, string>;
}

export interface NetworkLatencyConfig extends RequestCountingOptions {
  urlPattern: string;
  methods?: string[];
  delayMs: number;
  probability: number;
}

export interface NetworkAbortConfig extends RequestCountingOptions {
  urlPattern: string;
  methods?: string[];
  probability: number;
  timeout?: number; // ms before abort; 0 or omitted = immediate
}

export type CorruptionStrategy = 'truncate' | 'malformed-json' | 'empty' | 'wrong-type';

export interface NetworkCorruptionConfig extends RequestCountingOptions {
  urlPattern: string;
  methods?: string[];
  probability: number;
  strategy: CorruptionStrategy;
}

export interface NetworkCorsConfig extends RequestCountingOptions {
  urlPattern: string;
  methods?: string[];
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

export interface ChaosConfig {
  network?: NetworkConfig;
  ui?: UiConfig;
  websocket?: WebSocketConfig;
  /** Seed for the PRNG. When provided, all probability rolls become deterministic and replayable. */
  seed?: number;
}
