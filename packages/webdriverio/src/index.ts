import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { ChaosConfig, ChaosEvent } from '@chaos-maker/core';
import './types';

/**
 * Minimal structural type for the WebdriverIO `Browser` object. Typed this way
 * so we don't have to take a hard type-only dependency on `webdriverio`'s
 * internal types — any object exposing `execute` works.
 */
export interface ChaosBrowser {
  execute<ReturnValue, Args extends unknown[]>(
    script: ((...args: Args) => ReturnValue) | string,
    ...args: Args
  ): Promise<ReturnValue>;
  addCommand?: (name: string, fn: (...args: unknown[]) => unknown) => void;
}

let cachedUmdSource: string | null = null;
let cachedUmdPath: string | null = null;

function getCurrentDir(): string {
  return typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
}

function resolveCoreUmdPath(): string {
  if (cachedUmdPath) return cachedUmdPath;
  const req = createRequire(resolve(getCurrentDir(), 'package.json'));
  const coreEntry = req.resolve('@chaos-maker/core');
  const coreDistDir = dirname(coreEntry);
  cachedUmdPath = resolve(coreDistDir, 'chaos-maker.umd.js');
  return cachedUmdPath;
}

function loadCoreUmdSource(): string {
  if (cachedUmdSource !== null) return cachedUmdSource;
  cachedUmdSource = readFileSync(resolveCoreUmdPath(), 'utf8');
  return cachedUmdSource;
}

/**
 * Inject chaos into the current WebdriverIO browser page.
 *
 * Call **after** `browser.url(...)` — WebDriver has no generic pre-navigation
 * hook across Chromium/Firefox, so requests issued during the initial page
 * load are not intercepted. For full-lifecycle chaos use Playwright or Cypress.
 *
 * @example
 * ```ts
 * import { injectChaos, getChaosLog } from '@chaos-maker/webdriverio';
 *
 * it('handles API failure', async () => {
 *   await browser.url('/');
 *   await injectChaos(browser, {
 *     network: { failures: [{ urlPattern: '/api', statusCode: 503, probability: 1.0 }] },
 *   });
 *   await browser.$('button.refresh').click();
 *   const log = await getChaosLog(browser);
 *   expect(log.some(e => e.type === 'network:failure' && e.applied)).toBe(true);
 * });
 * ```
 */
export async function injectChaos(
  browser: ChaosBrowser,
  config: ChaosConfig,
): Promise<void> {
  const umdSource = loadCoreUmdSource();
  await browser.execute(
    (src: string, serializedCfg: string) => {
      const win = globalThis as unknown as { __CHAOS_CONFIG__: unknown };
      win.__CHAOS_CONFIG__ = JSON.parse(serializedCfg);
      const script = document.createElement('script');
      script.textContent = src;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    },
    umdSource,
    JSON.stringify(config),
  );
}

/**
 * Stop chaos and restore the original fetch / XHR / WebSocket / DOM behaviour
 * on the current page.
 */
export async function removeChaos(browser: ChaosBrowser): Promise<void> {
  await browser.execute(() => {
    const win = globalThis as unknown as {
      chaosUtils?: { stop: () => void };
    };
    if (win.chaosUtils && typeof win.chaosUtils.stop === 'function') {
      win.chaosUtils.stop();
    }
  });
}

/**
 * Read the chaos event log from the current page. Returns every chaos decision
 * emitted since `injectChaos` was called, applied or skipped.
 */
export async function getChaosLog(browser: ChaosBrowser): Promise<ChaosEvent[]> {
  return browser.execute(() => {
    const win = globalThis as unknown as {
      chaosUtils?: { getLog: () => unknown[] };
    };
    if (win.chaosUtils && typeof win.chaosUtils.getLog === 'function') {
      return win.chaosUtils.getLog() as ChaosEvent[];
    }
    return [] as ChaosEvent[];
  });
}

/**
 * Read the PRNG seed used by the active chaos instance. Log this on test
 * failure to replay the exact sequence of chaos decisions with a fixed seed.
 */
export async function getChaosSeed(browser: ChaosBrowser): Promise<number | null> {
  return browser.execute(() => {
    const win = globalThis as unknown as {
      chaosUtils?: { getSeed: () => number | null };
    };
    if (win.chaosUtils && typeof win.chaosUtils.getSeed === 'function') {
      return win.chaosUtils.getSeed();
    }
    return null;
  });
}

/**
 * Register chaos-maker's custom WDIO commands on a browser object. After
 * calling this once (typically in `before` hook of `wdio.conf.ts`), tests can
 * call `browser.injectChaos(config)`, `browser.removeChaos()`,
 * `browser.getChaosLog()`, and `browser.getChaosSeed()` directly.
 */
export function registerChaosCommands(browser: ChaosBrowser): void {
  if (!browser.addCommand) {
    throw new Error(
      '[chaos-maker] registerChaosCommands: browser object does not expose addCommand — not a WebdriverIO Browser?',
    );
  }
  browser.addCommand('injectChaos', async function (this: ChaosBrowser, ...args: unknown[]) {
    await injectChaos(this, args[0] as ChaosConfig);
  });
  browser.addCommand('removeChaos', async function (this: ChaosBrowser) {
    await removeChaos(this);
  });
  browser.addCommand('getChaosLog', async function (this: ChaosBrowser) {
    return getChaosLog(this);
  });
  browser.addCommand('getChaosSeed', async function (this: ChaosBrowser) {
    return getChaosSeed(this);
  });
}

export type {
  ChaosConfig,
  ChaosEvent,
  ChaosEventType,
  NetworkConfig,
  NetworkFailureConfig,
  NetworkLatencyConfig,
  NetworkAbortConfig,
  NetworkCorruptionConfig,
  NetworkCorsConfig,
  CorruptionStrategy,
  UiConfig,
  UiAssaultConfig,
  WebSocketConfig,
  WebSocketDropConfig,
  WebSocketDelayConfig,
  WebSocketCorruptConfig,
  WebSocketCloseConfig,
  WebSocketDirection,
  WebSocketCorruptionStrategy,
} from '@chaos-maker/core';
