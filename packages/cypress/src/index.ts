import type { ChaosConfig } from '@chaos-maker/core';
import * as fs from 'fs';

// Read the UMD script content at build time
const scriptPath = require.resolve('@chaos-maker/core/dist/chaos-maker.umd.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

// Extend Cypress namespace to include our custom command
declare global {
  namespace Cypress {
    interface Chainable {
      injectChaos(config: ChaosConfig): void;
    }
  }
}

/**
 * Get the chaos script content for manual injection
 */
export function getChaosScript(): string {
  return scriptContent;
}

/**
 * Get the chaos script with configuration injected
 */
export function getChaosScriptWithConfig(config: ChaosConfig): string {
  return `window.__CHAOS_CONFIG__ = ${JSON.stringify(config)}; ${scriptContent}`;
}

/**
 * Register the injectChaos command with Cypress
 * Call this function in your cypress/support/commands.js file
 */
export function registerChaosCommand(): void {
  if (typeof (globalThis as any).Cypress !== 'undefined') {
    (globalThis as any).Cypress.Commands.add('injectChaos', (config: ChaosConfig) => {
      // Intercept all requests to inject the script
      (globalThis as any).cy.intercept('*', (req: any) => {
        req.reply((res: any) => {
          // Only inject into HTML responses
          if (res.body && 
              typeof res.body === 'string' && 
              res.headers['content-type']?.includes('text/html') &&
              res.body.includes('<head>')) {
            
            const chaosScript = `
              <script>
                window.__CHAOS_CONFIG__ = ${JSON.stringify(config)};
                ${scriptContent}
              </script>`;
            
            res.body = res.body.replace('<head>', `<head>${chaosScript}`);
          }
          return res;
        });
      });
    });
  }
}