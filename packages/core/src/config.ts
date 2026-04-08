export interface NetworkFailureConfig {
  urlPattern: string;
  methods?: string[];
  statusCode: number;
  probability: number;
  body?: string;
  statusText?: string;
  headers?: Record<string, string>;
}

export interface NetworkLatencyConfig {
  urlPattern: string;
  methods?: string[];
  delayMs: number;
  probability: number;
}

export interface NetworkAbortConfig {
  urlPattern: string;
  methods?: string[];
  probability: number;
  timeout?: number; // ms before abort; 0 or omitted = immediate
}

export type CorruptionStrategy = 'truncate' | 'malformed-json' | 'empty' | 'wrong-type';

export interface NetworkCorruptionConfig {
  urlPattern: string;
  methods?: string[];
  probability: number;
  strategy: CorruptionStrategy;
}

export interface NetworkCorsConfig {
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
