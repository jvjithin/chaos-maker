import { defineConfig } from 'cypress';
import { chaosMaker } from '@chaos-maker/cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8080',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on, _) {
      chaosMaker(on);
    },
  },
});