import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import { injectChaos, removeChaos, getChaosLog, getChaosSeed } from './index';

export interface ChaosFixture {
  inject: (config: ChaosConfig) => Promise<void>;
  remove: () => Promise<void>;
  getLog: () => Promise<ChaosEvent[]>;
  getSeed: () => Promise<number | null>;
}

/**
 * Extended Playwright test with a `chaos` fixture.
 *
 * @example
 * ```ts
 * import { test, expect } from '@chaos-maker/playwright/fixture';
 *
 * test('handles API failure', async ({ page, chaos }) => {
 *   await chaos.inject({
 *     network: {
 *       failures: [{ urlPattern: '/api', statusCode: 503, probability: 1.0 }]
 *     }
 *   });
 *   await page.goto('/');
 *   const log = await chaos.getLog();
 *   expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
 * });
 * ```
 */
export const test = base.extend<{ chaos: ChaosFixture }>({
  chaos: async ({ page }: { page: Page }, use: (fixture: ChaosFixture) => Promise<void>) => {
    const fixture: ChaosFixture = {
      inject: (config: ChaosConfig) => injectChaos(page, config),
      remove: () => removeChaos(page),
      getLog: () => getChaosLog(page),
      getSeed: () => getChaosSeed(page),
    };
    await use(fixture);
    await removeChaos(page);
  },
});

export { expect } from '@playwright/test';
export type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
