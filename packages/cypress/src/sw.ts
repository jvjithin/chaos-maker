/// <reference types="cypress" />
import type { ChaosConfig, ChaosEvent, ValidateChaosConfigOptions } from '@chaos-maker/core';
import { validateChaosConfig, SW_BRIDGE_SOURCE } from '@chaos-maker/core';

/**
 * Options accepted by `cy.injectSWChaos` / `cy.removeSWChaos`.
 */
export interface SWChaosOptions {
  /**
   * Milliseconds to wait for `navigator.serviceWorker.controller` + the SW's
   * ack message. Defaults to `10000`. Raise for slow CI workers.
   */
  timeoutMs?: number;
  /**
   * RFC-004. Forwarded to `validateChaosConfig` before the config is posted
   * to the SW. Malformed configs throw a `ChaosConfigError` synchronously
   * inside the Cypress command body.
   */
  validation?: ValidateChaosConfigOptions;
}

interface SWBridge {
  apply: (cfg: ChaosConfig, timeoutMs: number) => Promise<{ seed: number | null }>;
  stop: (timeoutMs: number) => Promise<unknown>;
  toggleGroup: (name: string, enabled: boolean, timeoutMs: number) => Promise<unknown>;
  getLocalLog: () => ChaosEvent[];
  clearLocalLog: () => void;
  getRemoteLog: (timeoutMs: number) => Promise<ChaosEvent[]>;
}

const DEFAULT_SW_TOGGLE_TIMEOUT = 2_000;

function getBridge(win: Cypress.AUTWindow): SWBridge | undefined {
  return (win as unknown as { __chaosMakerSWBridge?: SWBridge }).__chaosMakerSWBridge;
}

function ensureBridge(win: Cypress.AUTWindow): SWBridge {
  let bridge = getBridge(win);
  if (bridge) return bridge;
  // Install bridge via document script tag so it runs in the AUT's origin.
  const script = win.document.createElement('script');
  script.textContent = SW_BRIDGE_SOURCE;
  (win.document.head || win.document.documentElement).appendChild(script);
  script.remove();
  bridge = getBridge(win);
  if (!bridge) {
    throw new Error('[chaos-maker] failed to install SW bridge on AUT window');
  }
  return bridge;
}

/**
 * Register Service-Worker chaos commands on the Cypress command registry.
 * Safe to call alongside {@link registerChaosCommands}.
 */
export function registerSWChaosCommands(): void {
  Cypress.Commands.add('injectSWChaos', (config: ChaosConfig, options?: SWChaosOptions) => {
    const validated = validateChaosConfig(config, options?.validation);
    const timeoutMs = options?.timeoutMs ?? 10_000;
    return cy.window({ log: false }).then((win) => {
      const bridge = ensureBridge(win);
      return Cypress.Promise.resolve(bridge.apply(validated, timeoutMs)) as unknown as Cypress.Chainable<{
        seed: number | null;
      }>;
    }) as unknown as Cypress.Chainable<{ seed: number | null }>;
  });

  Cypress.Commands.add('removeSWChaos', (options?: SWChaosOptions) => {
    const timeoutMs = options?.timeoutMs ?? 5_000;
    return cy.window({ log: false }).then((win) => {
      const bridge = getBridge(win);
      if (!bridge) return;
      return Cypress.Promise.resolve(
        bridge.stop(timeoutMs).then(() => bridge.clearLocalLog()),
      ) as unknown as Cypress.Chainable<void>;
    }) as unknown as Cypress.Chainable<void>;
  });

  Cypress.Commands.add('getSWChaosLog', () => {
    return cy.window({ log: false }).then<ChaosEvent[]>((win) => {
      const bridge = getBridge(win);
      return bridge ? bridge.getLocalLog() : [];
    });
  });

  Cypress.Commands.add('enableSWGroup', (name: string, options?: SWChaosOptions) => {
    if (typeof name !== 'string') {
      throw new Error('[chaos-maker] group name must be a string');
    }
    const nameNorm = name.trim();
    if (!nameNorm) {
      throw new Error('[chaos-maker] group name cannot be empty');
    }
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SW_TOGGLE_TIMEOUT;
    return cy.window({ log: false }).then((win) => {
      const bridge = ensureBridge(win);
      return Cypress.Promise.resolve(bridge.toggleGroup(nameNorm, true, timeoutMs)).then(
        () => undefined,
      ) as unknown as Cypress.Chainable<void>;
    }) as unknown as Cypress.Chainable<void>;
  });

  Cypress.Commands.add('disableSWGroup', (name: string, options?: SWChaosOptions) => {
    if (typeof name !== 'string') {
      throw new Error('[chaos-maker] group name must be a string');
    }
    const nameNorm = name.trim();
    if (!nameNorm) {
      throw new Error('[chaos-maker] group name cannot be empty');
    }
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SW_TOGGLE_TIMEOUT;
    return cy.window({ log: false }).then((win) => {
      const bridge = ensureBridge(win);
      return Cypress.Promise.resolve(bridge.toggleGroup(nameNorm, false, timeoutMs)).then(
        () => undefined,
      ) as unknown as Cypress.Chainable<void>;
    }) as unknown as Cypress.Chainable<void>;
  });

  Cypress.Commands.add('getSWChaosLogFromSW', (options?: SWChaosOptions) => {
    const timeoutMs = options?.timeoutMs ?? 5_000;
    return cy.window({ log: false }).then<ChaosEvent[]>((win) => {
      const bridge = getBridge(win);
      if (!bridge) return [];
      return Cypress.Promise.resolve(bridge.getRemoteLog(timeoutMs)) as unknown as ChaosEvent[];
    });
  });
}
