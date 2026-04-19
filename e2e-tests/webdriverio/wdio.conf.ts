import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { registerChaosCommands } from '@chaos-maker/webdriverio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures');

const browserName = process.env.WDIO_BROWSER || 'chrome';

let httpServer: ChildProcess | null = null;
let wsServer: ChildProcess | null = null;

async function waitForHttp(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch {
      /* not yet up */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Fixture server at ${url} did not start within ${timeoutMs}ms`);
}

function capabilities(): WebdriverIO.Capabilities[] {
  if (browserName === 'firefox') {
    return [
      {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          args: ['-headless'],
        },
      },
    ];
  }
  return [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
      },
    },
  ];
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  tsConfigPath: './tsconfig.json',
  specs: ['./tests/**/*.spec.ts'],
  maxInstances: 1,
  capabilities: capabilities(),
  logLevel: 'warn',
  baseUrl: 'http://127.0.0.1:8080',
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  async onPrepare() {
    try {
      await fetch('http://127.0.0.1:8080');
      return;
    } catch {
      /* start fixture servers */
    }
    httpServer = spawn(
      'npx',
      ['http-server', FIXTURES, '-p', '8080', '-s'],
      { stdio: 'inherit' },
    );
    wsServer = spawn(
      'node',
      [resolve(FIXTURES, 'ws-echo-server.cjs')],
      { stdio: 'inherit' },
    );
    await waitForHttp('http://127.0.0.1:8080');
  },
  onComplete() {
    httpServer?.kill();
    wsServer?.kill();
    httpServer = null;
    wsServer = null;
  },
  async before() {
    registerChaosCommands(browser as never);
  },
  async afterTest() {
    // Auto-cleanup chaos between tests so leftover patched fetch/XHR/WS
    // doesn't leak into the next spec.
    try {
      await browser.execute(() => {
        const w = window as unknown as { chaosUtils?: { stop?: () => void } };
        if (w.chaosUtils && typeof w.chaosUtils.stop === 'function') {
          w.chaosUtils.stop();
        }
      });
    } catch {
      /* page may already be navigating — fine */
    }
  },
};
