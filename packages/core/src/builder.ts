import { ChaosConfig, CorruptionStrategy, RequestCountingOptions, WebSocketDirection, WebSocketCorruptionStrategy } from './config';

function cloneConfig(config: ChaosConfig): ChaosConfig {
  return JSON.parse(JSON.stringify(config));
}

export class ChaosConfigBuilder {
  private config: ChaosConfig;

  constructor(initialConfig?: ChaosConfig) {
    this.config = initialConfig ? cloneConfig(initialConfig) : { network: {}, ui: {}, websocket: {} };
    if (!this.config.network) this.config.network = {};
    if (!this.config.ui) this.config.ui = {};
    if (!this.config.websocket) this.config.websocket = {};
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

  // --- WebSocket chaos ---

  dropMessages(urlPattern: string, direction: WebSocketDirection, probability: number, counting?: RequestCountingOptions) {
    if (!this.config.websocket!.drops) this.config.websocket!.drops = [];
    this.config.websocket!.drops.push({ urlPattern, direction, probability, ...counting });
    return this;
  }

  delayMessages(urlPattern: string, direction: WebSocketDirection, delayMs: number, probability: number, counting?: RequestCountingOptions) {
    if (!this.config.websocket!.delays) this.config.websocket!.delays = [];
    this.config.websocket!.delays.push({ urlPattern, direction, delayMs, probability, ...counting });
    return this;
  }

  corruptMessages(urlPattern: string, direction: WebSocketDirection, strategy: WebSocketCorruptionStrategy, probability: number, counting?: RequestCountingOptions) {
    if (!this.config.websocket!.corruptions) this.config.websocket!.corruptions = [];
    this.config.websocket!.corruptions.push({ urlPattern, direction, strategy, probability, ...counting });
    return this;
  }

  closeConnection(urlPattern: string, probability: number, opts?: { code?: number; reason?: string; afterMs?: number }, counting?: RequestCountingOptions) {
    if (!this.config.websocket!.closes) this.config.websocket!.closes = [];
    this.config.websocket!.closes.push({ urlPattern, probability, ...opts, ...counting });
    return this;
  }

  // Counting shortcuts (only the two highest-value ones — see plan §8).

  dropMessagesOnNth(urlPattern: string, direction: WebSocketDirection, n: number) {
    return this.dropMessages(urlPattern, direction, 1, { onNth: n });
  }

  delayMessagesOnNth(urlPattern: string, direction: WebSocketDirection, delayMs: number, n: number) {
    return this.delayMessages(urlPattern, direction, delayMs, 1, { onNth: n });
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
