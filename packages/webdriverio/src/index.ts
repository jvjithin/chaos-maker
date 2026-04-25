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
  // Both the config assignment and UMD source run inside the <script> tag's
  // textContent so they execute in the page realm — Firefox/geckodriver runs
  // `executeScript` bodies in a sandbox whose globals don't leak to the real
  // `window`, so setting `window.__CHAOS_CONFIG__` from the execute callback
  // alone leaves the UMD's auto-bootstrap with nothing to pick up.
  const scriptSource = `window.__CHAOS_CONFIG__ = ${JSON.stringify(config)};\n${umdSource}`;
  const started = await browser.execute((src: string) => {
    const script = document.createElement('script');
    script.textContent = src;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    const w = window as unknown as {
      chaosUtils?: { getSeed?: () => number | null };
    };
    return typeof w.chaosUtils?.getSeed === 'function' && w.chaosUtils.getSeed() !== null;
  }, scriptSource);

  if (!started) {
    throw new Error(
      '[chaos-maker] injectChaos did not start. Page may block inline scripts via CSP, or core auto-bootstrap failed.',
    );
  }
}

/**
 * Stop chaos and restore the original fetch / XHR / WebSocket / DOM behaviour
 * on the current page.
 */
export async function removeChaos(browser: ChaosBrowser): Promise<void> {
  // Read state off `window` (the page realm), not `globalThis` — in Firefox
  // geckodriver's executeScript sandbox `globalThis` is the sandbox global,
  // which never sees `chaosUtils` because the UMD attaches it to `window`.
  await browser.execute(() => {
    const w = window as unknown as { chaosUtils?: { stop: () => void } };
    if (w.chaosUtils && typeof w.chaosUtils.stop === 'function') {
      w.chaosUtils.stop();
    }
  });
}

/**
 * Read the chaos event log from the current page. Returns every chaos decision
 * emitted since `injectChaos` was called, applied or skipped.
 */
export async function getChaosLog(browser: ChaosBrowser): Promise<ChaosEvent[]> {
  return browser.execute(() => {
    const w = window as unknown as { chaosUtils?: { getLog: () => unknown[] } };
    if (w.chaosUtils && typeof w.chaosUtils.getLog === 'function') {
      return w.chaosUtils.getLog() as ChaosEvent[];
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
    const w = window as unknown as {
      chaosUtils?: { getSeed: () => number | null };
    };
    if (w.chaosUtils && typeof w.chaosUtils.getSeed === 'function') {
      return w.chaosUtils.getSeed();
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
  SSEConfig,
  SSEDropConfig,
  SSEDelayConfig,
  SSECorruptConfig,
  SSECloseConfig,
  SSECorruptionStrategy,
  SSEEventTypeMatcher,
} from '@chaos-maker/core';

export {
  injectSWChaos,
  removeSWChaos,
  getSWChaosLog,
  getSWChaosLogFromSW,
  registerSWChaosCommands,
} from './sw';
export type { SWChaosOptions, InjectSWChaosResult } from './sw';
