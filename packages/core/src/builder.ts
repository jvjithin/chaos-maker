import { ChaosConfig, CorruptionStrategy } from './config';

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

  failRequests(urlPattern: string, statusCode: number, probability: number, methods?: string[], body?: string, headers?: Record<string, string>) {
    if (!this.config.network!.failures) this.config.network!.failures = [];
    this.config.network!.failures.push({ urlPattern, statusCode, probability, methods, body, headers });
    return this;
  }

  addLatency(urlPattern: string, delayMs: number, probability: number, methods?: string[]) {
    if (!this.config.network!.latencies) this.config.network!.latencies = [];
    this.config.network!.latencies.push({ urlPattern, delayMs, probability, methods });
    return this;
  }

  abortRequests(urlPattern: string, probability: number, timeout?: number, methods?: string[]) {
    if (!this.config.network!.aborts) this.config.network!.aborts = [];
    this.config.network!.aborts.push({ urlPattern, probability, timeout, methods });
    return this;
  }

  corruptResponses(urlPattern: string, strategy: CorruptionStrategy, probability: number, methods?: string[]) {
    if (!this.config.network!.corruptions) this.config.network!.corruptions = [];
    this.config.network!.corruptions.push({ urlPattern, strategy, probability, methods });
    return this;
  }

  simulateCors(urlPattern: string, probability: number, methods?: string[]) {
    if (!this.config.network!.cors) this.config.network!.cors = [];
    this.config.network!.cors.push({ urlPattern, probability, methods });
    return this;
  }

  assaultUi(selector: string, action: 'disable' | 'hide' | 'remove', probability: number) {
    if (!this.config.ui!.assaults) this.config.ui!.assaults = [];
    this.config.ui!.assaults.push({ selector, action, probability });
    return this;
  }

  build(): ChaosConfig {
    return cloneConfig(this.config);
  }
}
