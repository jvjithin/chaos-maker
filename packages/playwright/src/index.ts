import type { Page } from '@playwright/test';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

let cachedScript: string | null = null;

function getCoreScript(): string {
  if (cachedScript) return cachedScript;

  // Support both ESM and CJS module resolution
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const req = createRequire(resolve(currentDir, 'package.json'));
  const corePkg = req.resolve('@chaos-maker/core/package.json');
  const coreDir = dirname(corePkg);
  const umdPath = resolve(coreDir, 'dist', 'chaos-maker.umd.js');
  cachedScript = readFileSync(umdPath, 'utf-8');
  return cachedScript;
}

/**
 * Inject chaos into a Playwright page. Call before `page.goto()` to ensure
 * all network requests are intercepted from the start.
 *
 * @example
 * ```ts
 * import { injectChaos } from '@chaos-maker/playwright';
 *
 * test('handles API failure', async ({ page }) => {
 *   await injectChaos(page, {
 *     network: {
 *       failures: [{ urlPattern: '/api', statusCode: 503, probability: 1.0 }]
 *     }
 *   });
 *   await page.goto('/');
 * });
 * ```
 */
export async function injectChaos(page: Page, config: ChaosConfig): Promise<void> {
  const scriptContent = getCoreScript();

  await page.addInitScript((args: { config: unknown; scriptContent: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    win.__CHAOS_CONFIG__ = args.config;
    // eval executes synchronously, ensuring fetch/XHR are patched before any app code
    (0, eval)(args.scriptContent);
  }, { config, scriptContent });
}

/**
 * Remove chaos from a Playwright page. Restores original fetch/XHR/DOM behavior.
 */
export async function removeChaos(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    if (win.chaosUtils) {
      win.chaosUtils.stop();
    }
  });
}

/**
 * Retrieve the chaos event log from a Playwright page.
 * Returns all events emitted since chaos was injected.
 */
export async function getChaosLog(page: Page): Promise<ChaosEvent[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    if (win.chaosUtils) {
      return win.chaosUtils.getLog();
    }
    return [];
  });
}

export type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
