export interface NetworkFailureConfig {
  urlPattern: string;
  methods?: string[];
  statusCode: number;
  probability: number;
}

export interface NetworkLatencyConfig {
  urlPattern: string;
  methods?: string[];
  delayMs: number;
  probability: number;
}

export interface NetworkConfig {
  failures?: NetworkFailureConfig[];
  latencies?: NetworkLatencyConfig[];
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
}
