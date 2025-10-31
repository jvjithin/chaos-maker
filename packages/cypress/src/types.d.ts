// Import the core config type to be used in our command
import type { ChaosConfig } from '@chaos-maker/core';

// Use 'declare global' to merge with the existing Cypress namespace
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Injects Chaos Maker into the application's main window.
       * This command should be called *before* cy.visit().
       * @param config The ChaosConfig object defining the chaos to inject.
       * @example cy.injectChaos({ network: { failures: [...] } })
       */
      injectChaos(config: ChaosConfig): void;
    }
  }
}
