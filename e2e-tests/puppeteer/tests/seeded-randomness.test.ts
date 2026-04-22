import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer';
import { injectChaos, getChaosLog, getChaosSeed } from '@chaos-maker/puppeteer';
import type { ChaosEvent } from '@chaos-maker/core';
import { launchBrowser, BASE_URL, API_PATTERN, makeRequest } from './helpers';

const SEED = 42;
const SEED_TRIALS = 10;

let browser: Browser;
let page: Page;

beforeAll(async () => { browser = await launchBrowser(); });
afterAll(async () => { await browser.close(); });

beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page.close(); });

async function runWithSeed(p: Page, seed: number): Promise<boolean[]> {
  await injectChaos(p, {
    seed,
    network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 0.5 }] },
  });
  await p.goto(BASE_URL);
  for (let i = 0; i < SEED_TRIALS; i++) {
    await makeRequest(p);
  }
  const log = await getChaosLog(p) as ChaosEvent[];
  return log.filter((e) => e.type === 'network:failure').map((e) => e.applied);
}

describe('Seeded randomness', () => {
  it('same seed produces identical chaos outcomes', async () => {
    const outcomes1 = await runWithSeed(page, SEED);

    const page2 = await browser.newPage();
    const outcomes2 = await runWithSeed(page2, SEED);
    await page2.close();

    expect(outcomes1.length).toBe(SEED_TRIALS);
    expect(outcomes1).toEqual(outcomes2);
  });

  it('different seeds produce different outcomes', async () => {
    const outcomes1 = await runWithSeed(page, 42);

    const page2 = await browser.newPage();
    const outcomes2 = await runWithSeed(page2, 99);
    await page2.close();

    // 10 trials at p=0.5 → collision probability ~1/1024 per seed pair.
    expect(outcomes1).not.toEqual(outcomes2);
  });

  it('getChaosSeed returns the configured seed', async () => {
    await injectChaos(page, {
      seed: 12345,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    await page.goto(BASE_URL);
    const seed = await getChaosSeed(page);
    expect(seed).toBe(12345);
  });
});
