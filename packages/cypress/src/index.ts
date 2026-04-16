/// <reference types="cypress" />
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import type { InjectChaosOptions } from './types';

export { registerChaosCommands, isChaosActive } from './commands';
export { registerChaosTasks } from './tasks';
export type { InjectChaosOptions } from './types';
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

// Augment Cypress's Chainable interface so `cy.injectChaos(...)` etc. get
// autocomplete + type-checking in user projects that import from this package.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Inject chaos into the next `cy.visit()`.
       *
       * By default, chaos persists across subsequent navigations until
       * `cy.removeChaos()` is called. Pass `{ persistAcrossNavigations: false }`
       * to apply chaos only to the next visit.
       *
       * @example
       * cy.injectChaos({
       *   network: {
       *     failures: [{ urlPattern: '/api', statusCode: 503, probability: 1 }],
       *   },
       * });
       * cy.visit('/');
       */
      injectChaos(config: ChaosConfig, options?: InjectChaosOptions): Chainable<void>;

      /** Stop chaos and restore original fetch / XHR / WebSocket / DOM behaviour. */
      removeChaos(): Chainable<void>;

      /** Read the chaos event log from the current AUT window. */
      getChaosLog(): Chainable<ChaosEvent[]>;

      /**
       * Read the PRNG seed used by the current chaos instance. Log this on
       * failure to replay the exact sequence of chaos decisions.
       */
      getChaosSeed(): Chainable<number | null>;
    }
  }
}
