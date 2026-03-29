import type { Page } from '@playwright/test';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

let cachedUmdPath: string | null = null;

function getCoreUmdPath(): string {
  if (cachedUmdPath) return cachedUmdPath;

  // Support both ESM and CJS module resolution
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const req = createRequire(resolve(currentDir, 'package.json'));
  // Resolve the main entry point to find the dist directory — avoids
  // requiring `./package.json` which isn't in the exports map.
  const coreEntry = req.resolve('@chaos-maker/core');
  const coreDistDir = dirname(coreEntry);
  cachedUmdPath = resolve(coreDistDir, 'chaos-maker.umd.js');
  return cachedUmdPath;
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
  const umdPath = getCoreUmdPath();

  // Set config before the UMD script runs so it auto-starts with this config
  await page.addInitScript((cfg: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    win.__CHAOS_CONFIG__ = cfg;
  }, config);

  // Load core UMD bundle by path — no eval needed
  await page.addInitScript({ path: umdPath });
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
