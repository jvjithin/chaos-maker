export interface InjectChaosOptions {
  /**
   * When true (default), chaos re-injects on every subsequent `cy.visit()`
   * until `cy.removeChaos()` is called. Matches the Playwright adapter's
   * `page.addInitScript` behaviour.
   *
   * Set to false to apply chaos to the next navigation only.
   *
   * @default true
   */
  persistAcrossNavigations?: boolean;
}

export type {
  ChaosConfig,
  ChaosEvent,
  ChaosEventType,
  NetworkConfig,
  NetworkFailureConfig,
  NetworkLatencyConfig,
  NetworkAbortConfig,
  NetworkCorruptionConfig,
  NetworkCorsConfig,
  CorruptionStrategy,
  UiConfig,
  UiAssaultConfig,
  WebSocketConfig,
  WebSocketDropConfig,
  WebSocketDelayConfig,
  WebSocketCorruptConfig,
  WebSocketCloseConfig,
  WebSocketDirection,
  WebSocketCorruptionStrategy,
} from '@chaos-maker/core';
