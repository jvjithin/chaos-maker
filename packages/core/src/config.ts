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

export interface ChaosConfig {
  network?: NetworkConfig;
  ui?: UiConfig;
  /** Seed for the PRNG. When provided, all probability rolls become deterministic and replayable. */
  seed?: number;
}
