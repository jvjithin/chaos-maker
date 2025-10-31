import type { ChaosConfig } from '@chaos-maker/core';
import * as fs from 'fs';

// Read the UMD script content at build time
const scriptPath = require.resolve('@chaos-maker/core/dist/chaos-maker.umd.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

// Cypress command is typed via module augmentation in types.d.ts

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
  try {
    const serializedConfig = JSON.stringify(config).replace(/</g, '\\u003C');
    return `window.__CHAOS_CONFIG__ = ${serializedConfig}; ${scriptContent}`;
  } catch {
    throw new Error('Failed to serialize chaos config for injection. Ensure the config is JSON-serializable.');
  }
}

/**
 * Register the injectChaos command with Cypress
 * Call this function in your cypress/support/commands.js file
 */
export function registerChaosCommand(): void {
  if (typeof (globalThis as any).Cypress !== 'undefined') {
    // Shared config and one-time intercept registration
    const globalObj = globalThis as any;
    if (globalObj.__chaosMakerCurrentConfig === undefined) {
      globalObj.__chaosMakerCurrentConfig = null as ChaosConfig | null;
    }
    if (!globalObj.__chaosMakerInterceptRegistered) {
      globalObj.__chaosMakerInterceptRegistered = true;
      (globalObj as any).cy?.intercept?.('*', (req: any) => {
        req.reply((res: any) => {
          // Guard: only act when a config has been set
          const currentConfig: ChaosConfig | null = globalObj.__chaosMakerCurrentConfig;
          if (!currentConfig) return res;
          // Only inject into HTML responses
          if (
            res.body &&
            typeof res.body === 'string' &&
            res.headers?.['content-type']?.includes('text/html') &&
            res.body.includes('<head>')
          ) {
            let serializedConfig: string;
            try {
              serializedConfig = JSON.stringify(currentConfig).replace(/</g, '\\u003C');
            } catch {
              throw new Error('Failed to serialize chaos config for injection. Ensure the config is JSON-serializable.');
            }
            const chaosScript = `<script>\n              window.__CHAOS_CONFIG__ = ${serializedConfig};\n              ${scriptContent}\n            </script>`;
            res.body = res.body.replace('<head>', `<head>${chaosScript}`);
          }
          return res;
        });
      });
    }

    (globalThis as any).Cypress.Commands.add('injectChaos', (config: ChaosConfig) => {
      // Update the shared config used by the single intercept
      (globalThis as any).__chaosMakerCurrentConfig = config ?? null;
    });
  }
}