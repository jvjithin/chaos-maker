/// <reference types="cypress" />
import { registerChaosCommands, isChaosActive } from './commands';

// Side-effect import path: `import '@chaos-maker/cypress/support'` in
// `cypress/support/e2e.ts` auto-registers the custom commands and wires the
// per-test cleanup hook.
registerChaosCommands();

afterEach(() => {
  if (isChaosActive()) {
    cy.removeChaos();
  }
});

// Re-export types so users who only import the support entry still get the
// Cypress.Chainable augmentation declared in `./index`.
export type { InjectChaosOptions } from './types';
export * from './index';
