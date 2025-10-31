import type { ChaosConfig } from '@chaos-maker/core';
import * as fs from 'fs';

/**
 * This is the Node.js part. It registers a Cypress task to read the
 * chaos script from the file system. It must be called from cypress.config.ts.
 */
export function chaosMaker(on: Cypress.PluginEvents) {
  on('task', {
    getChaosScript: () => {
      try {
        const scriptPath = require.resolve('@chaos-maker/core/dist/chaos-maker.umd.js');
        return fs.readFileSync(scriptPath, 'utf-8');
      } catch (err) {
        console.error('Chaos Maker Cypress Task Error:', err);
        return null;
      }
    },
  });
}

/**
 * This is the browser-side part. It registers the cy.injectChaos() command.
 * It must be called from your support file (e.g., cypress/support/e2e.ts).
 */
export function registerChaosCommand(): void {
  // Use closure variables to store state during the test run
  let scriptContent: string | null = null;
  let chaosConfig: ChaosConfig | null = null;

  // Before all tests, fetch the chaos script from the Node task once and cache it.
  before(() => {
    // Check if it has already been fetched to prevent re-running in watch mode
    if (!scriptContent) {
      cy.task('getChaosScript').then((content) => {
        if (typeof content !== 'string') {
          throw new Error('Chaos Maker: Failed to fetch chaos script content via cy.task().');
        }
        scriptContent = content;
      });
    }
  });

  // Intercept all network requests. This will be active for all tests.
  beforeEach(() => {
    // Reset the config before each test to ensure a clean state
    chaosConfig = null;

    cy.intercept('*', (req) => {
      // Let the request continue, but provide a callback to modify the response
      req.continue((res) => {
        // Check if conditions are right for injection
        const isHtml = res.headers['content-type']?.includes('text/html');
        const hasHead = typeof res.body === 'string' && res.body.includes('<head>');

        if (chaosConfig && scriptContent && isHtml && hasHead) {
          const serializedConfig = JSON.stringify(chaosConfig).replace(/</g, '\\u003C');
          const chaosScriptTag = `
            <script>
              window.__CHAOS_CONFIG__ = ${serializedConfig};
              ${scriptContent}
            </script>
          `;
          
          // Inject the script into the document's head
          res.body = res.body.replace('<head>', `<head>${chaosScriptTag}`);
          
          // Reset the config so this injection only happens once per cy.injectChaos call
          chaosConfig = null;
        }
      });
    });
  });

  // The actual command is now very simple: it just sets the config to be used by the interceptor.
  Cypress.Commands.add('injectChaos', (config: ChaosConfig) => {
    chaosConfig = config;
  });
}
