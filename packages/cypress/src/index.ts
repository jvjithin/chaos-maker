/// <reference types="cypress" />
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import type { InjectChaosOptions } from './types';
import type { SWChaosOptions } from './sw';

export { registerChaosCommands, isChaosActive } from './commands';
export { registerChaosTasks } from './tasks';
export { registerSWChaosCommands } from './sw';
export type { InjectChaosOptions } from './types';
export type { SWChaosOptions } from './sw';
export type {
  ChaosConfig,
  ChaosEvent,
  ChaosEventType,
  GraphQLOperationMatcher,
  NetworkConfig,
  NetworkFailureConfig,
  NetworkLatencyConfig,
  NetworkAbortConfig,
  NetworkCorruptionConfig,
  NetworkCorsConfig,
  NetworkRuleMatchers,
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
  SSEConfig,
  SSEDropConfig,
  SSEDelayConfig,
  SSECorruptConfig,
  SSECloseConfig,
  SSECorruptionStrategy,
  SSEEventTypeMatcher,
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

      /**
       * Inject chaos into the active page's Service Worker. Call **after**
       * `cy.visit()` so the SW has a chance to register and claim the page.
       *
       * Requires the app's SW to include `importScripts('/chaos-maker-sw.js')`
       * (classic) or `import { installChaosSW }` (module) — see README.
       *
       * @example
       * cy.visit('/');
       * cy.injectSWChaos({
       *   network: { failures: [{ urlPattern: '/api', statusCode: 503, probability: 1 }] },
       * });
       */
      injectSWChaos(config: ChaosConfig, options?: SWChaosOptions): Chainable<{ seed: number | null }>;

      /** Stop SW chaos and clear the page-side log buffer. */
      removeSWChaos(options?: SWChaosOptions): Chainable<void>;

      /** Read SW chaos events buffered on the page side (from SW broadcasts). */
      getSWChaosLog(): Chainable<ChaosEvent[]>;

      /**
       * Read SW chaos events directly from the SW's in-memory log. Use when
       * debugging a race where the page-side listener may have missed events.
       */
      getSWChaosLogFromSW(options?: SWChaosOptions): Chainable<ChaosEvent[]>;
    }
  }
}
