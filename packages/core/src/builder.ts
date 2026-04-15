import { ChaosConfig, CorruptionStrategy, RequestCountingOptions } from './config';

function cloneConfig(config: ChaosConfig): ChaosConfig {
  return JSON.parse(JSON.stringify(config));
}

export class ChaosConfigBuilder {
  private config: ChaosConfig;

  constructor(initialConfig?: ChaosConfig) {
    this.config = initialConfig ? cloneConfig(initialConfig) : { network: {}, ui: {} };
    if (!this.config.network) this.config.network = {};
    if (!this.config.ui) this.config.ui = {};
  }

  failRequests(urlPattern: string, statusCode: number, probability: number, methods?: string[], body?: string, headers?: Record<string, string>, counting?: RequestCountingOptions) {
    if (!this.config.network!.failures) this.config.network!.failures = [];
    this.config.network!.failures.push({ urlPattern, statusCode, probability, methods, body, headers, ...counting });
    return this;
  }

  addLatency(urlPattern: string, delayMs: number, probability: number, methods?: string[], counting?: RequestCountingOptions) {
    if (!this.config.network!.latencies) this.config.network!.latencies = [];
    this.config.network!.latencies.push({ urlPattern, delayMs, probability, methods, ...counting });
    return this;
  }

  abortRequests(urlPattern: string, probability: number, timeout?: number, methods?: string[], counting?: RequestCountingOptions) {
    if (!this.config.network!.aborts) this.config.network!.aborts = [];
    this.config.network!.aborts.push({ urlPattern, probability, timeout, methods, ...counting });
    return this;
  }

  corruptResponses(urlPattern: string, strategy: CorruptionStrategy, probability: number, methods?: string[], counting?: RequestCountingOptions) {
    if (!this.config.network!.corruptions) this.config.network!.corruptions = [];
    this.config.network!.corruptions.push({ urlPattern, strategy, probability, methods, ...counting });
    return this;
  }

  simulateCors(urlPattern: string, probability: number, methods?: string[], counting?: RequestCountingOptions) {
    if (!this.config.network!.cors) this.config.network!.cors = [];
    this.config.network!.cors.push({ urlPattern, probability, methods, ...counting });
    return this;
  }

  // --- onNth shortcuts ---

  failRequestsOnNth(urlPattern: string, statusCode: number, n: number, methods?: string[]) {
    return this.failRequests(urlPattern, statusCode, 1, methods, undefined, undefined, { onNth: n });
  }

  addLatencyOnNth(urlPattern: string, delayMs: number, n: number, methods?: string[]) {
    return this.addLatency(urlPattern, delayMs, 1, methods, { onNth: n });
  }

  abortRequestsOnNth(urlPattern: string, n: number, timeout?: number, methods?: string[]) {
    return this.abortRequests(urlPattern, 1, timeout, methods, { onNth: n });
  }

  corruptResponsesOnNth(urlPattern: string, strategy: CorruptionStrategy, n: number, methods?: string[]) {
    return this.corruptResponses(urlPattern, strategy, 1, methods, { onNth: n });
  }

  simulateCorsOnNth(urlPattern: string, n: number, methods?: string[]) {
    return this.simulateCors(urlPattern, 1, methods, { onNth: n });
  }

  // --- everyNth shortcuts ---

  failRequestsEveryNth(urlPattern: string, statusCode: number, n: number, methods?: string[]) {
    return this.failRequests(urlPattern, statusCode, 1, methods, undefined, undefined, { everyNth: n });
  }

  addLatencyEveryNth(urlPattern: string, delayMs: number, n: number, methods?: string[]) {
    return this.addLatency(urlPattern, delayMs, 1, methods, { everyNth: n });
  }

  abortRequestsEveryNth(urlPattern: string, n: number, timeout?: number, methods?: string[]) {
    return this.abortRequests(urlPattern, 1, timeout, methods, { everyNth: n });
  }

  corruptResponsesEveryNth(urlPattern: string, strategy: CorruptionStrategy, n: number, methods?: string[]) {
    return this.corruptResponses(urlPattern, strategy, 1, methods, { everyNth: n });
  }

  simulateCorsEveryNth(urlPattern: string, n: number, methods?: string[]) {
    return this.simulateCors(urlPattern, 1, methods, { everyNth: n });
  }

  // --- afterN shortcuts ---

  failRequestsAfterN(urlPattern: string, statusCode: number, n: number, methods?: string[]) {
    return this.failRequests(urlPattern, statusCode, 1, methods, undefined, undefined, { afterN: n });
  }

  addLatencyAfterN(urlPattern: string, delayMs: number, n: number, methods?: string[]) {
    return this.addLatency(urlPattern, delayMs, 1, methods, { afterN: n });
  }

  abortRequestsAfterN(urlPattern: string, n: number, timeout?: number, methods?: string[]) {
    return this.abortRequests(urlPattern, 1, timeout, methods, { afterN: n });
  }

  corruptResponsesAfterN(urlPattern: string, strategy: CorruptionStrategy, n: number, methods?: string[]) {
    return this.corruptResponses(urlPattern, strategy, 1, methods, { afterN: n });
  }

  simulateCorsAfterN(urlPattern: string, n: number, methods?: string[]) {
    return this.simulateCors(urlPattern, 1, methods, { afterN: n });
  }

  assaultUi(selector: string, action: 'disable' | 'hide' | 'remove', probability: number) {
    if (!this.config.ui!.assaults) this.config.ui!.assaults = [];
    this.config.ui!.assaults.push({ selector, action, probability });
    return this;
  }

  /** Set the PRNG seed for reproducible chaos. */
  withSeed(seed: number) {
    this.config.seed = seed;
    return this;
  }

  build(): ChaosConfig {
    return cloneConfig(this.config);
  }
}
