import { defineConfig } from 'cypress';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { registerChaosTasks } from '@chaos-maker/cypress/tasks';

// __dirname is available because Cypress compiles this file to CJS.
const FIXTURES = path.resolve(__dirname, '../fixtures');

let httpServer: ChildProcess | null = null;
let wsServer: ChildProcess | null = null;

async function waitForHttp(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8080',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    video: false,
    // setupNodeEvents is awaited by Cypress before the baseUrl reachability
    // check, so starting servers here ensures they are ready in time.
    async setupNodeEvents(on, config) {
      registerChaosTasks(on);

      // Reuse already-running servers in local dev to avoid port conflicts.
      let alreadyUp = false;
      try {
        await fetch('http://127.0.0.1:8080');
        alreadyUp = true;
      } catch {
        /* not running — start our own */
      }

      if (!alreadyUp) {
        httpServer = spawn(
          'npx',
          ['http-server', FIXTURES, '-p', '8080', '-s'],
          { stdio: 'pipe' },
        );
        wsServer = spawn(
          'node',
          [path.join(FIXTURES, 'ws-echo-server.cjs')],
          { stdio: 'pipe' },
        );
        await waitForHttp('http://127.0.0.1:8080');
      }

      on('after:run', () => {
        httpServer?.kill();
        wsServer?.kill();
        httpServer = null;
        wsServer = null;
      });

      return config;
    },
  },
});
