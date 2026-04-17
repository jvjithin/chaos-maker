import { test, expect } from '@chaos-maker/playwright/fixture';
import { readFileSync, existsSync, readdirSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const BASE_URL = 'http://127.0.0.1:8080';
const API_PATTERN = '/api/data.json';

/**
 * Force-enable Playwright tracing for every test in this spec so the trace
 * zip is always produced (not just on retry).
 */
test.use({ trace: 'on' });

// Serial so test 2 reads trace produced by test 1 after Playwright's end-of-test
// flush (which happens between test 1's teardown and test 2's start).
test.describe.configure({ mode: 'serial' });

// Shared state between the two tests in this describe.
let traceZipPath: string | null = null;
let chaosLogAttachmentPath: string | null = null;

/** Unzip a Playwright trace zip and return every newline-delimited JSON event. */
function readTraceEvents(zipPath: string): unknown[] {
  const outDir = mkdtempSync(join(tmpdir(), 'chaos-trace-'));
  execSync(`unzip -qq -o "${zipPath}" -d "${outDir}"`);
  const events: unknown[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.trace')) continue;
      const body = readFileSync(full, 'utf-8');
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed.
        }
      }
    }
  };
  walk(outDir);
  return events;
}

test.describe('Playwright trace integration', () => {
  test('produces chaos-log attachment and trace zip', async ({ page, chaos }, testInfo) => {
    await chaos.inject({
      network: {
        latencies: [{ urlPattern: API_PATTERN, delayMs: 250, probability: 1.0 }],
      },
    });
    await page.goto(BASE_URL);
    await page.click('#fetch-data');
    await expect(page.locator('#status')).toHaveText('Success!', { timeout: 5000 });

    const log = await chaos.getLog();
    expect(log.some((e) => e.type === 'network:latency' && e.applied)).toBe(true);

    // Force early dispose so the attachment lands on THIS test (not a later
    // implicit teardown where ordering is fuzzier).
    await chaos.remove();

    const chaosLogAttachment = testInfo.attachments.find((a) => a.name === 'chaos-log.json');
    expect(chaosLogAttachment).toBeTruthy();
    expect(chaosLogAttachment!.contentType).toBe('application/json');
    // body is populated synchronously; path is populated at test-end flush.
    expect(chaosLogAttachment!.body ?? chaosLogAttachment!.path).toBeTruthy();
    // Validate the in-memory body shape right here (path check moves to test 2).
    if (chaosLogAttachment!.body) {
      const payload = JSON.parse(chaosLogAttachment!.body.toString('utf-8'));
      expect(payload.events.length).toBeGreaterThan(0);
      expect(payload.events.some((e: { type: string; applied: boolean }) =>
        e.type === 'network:latency' && e.applied,
      )).toBe(true);
    }
    chaosLogAttachmentPath = chaosLogAttachment!.path ?? null;

    // Record the trace path for test 2. Playwright writes trace.zip AFTER
    // this body returns (during the test's end-of-scope flush), so we stash
    // the expected path; the actual file arrives before test 2 starts.
    traceZipPath = join(testInfo.outputDir, 'trace.zip');
  });

  test('trace.zip from previous test contains chaos:network:latency steps', async ({}, _testInfo) => {
    expect(traceZipPath).toBeTruthy();
    // Wait briefly — trace flush runs during test-worker transitions; file may
    // not be on disk instantly on slower runners.
    const deadline = Date.now() + 5000;
    while (!(traceZipPath && existsSync(traceZipPath)) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(existsSync(traceZipPath!)).toBe(true);

    const events = readTraceEvents(traceZipPath!);
    const titles = events
      .map((e) => (e as { title?: unknown; metadata?: { title?: unknown } })?.title
        ?? (e as { metadata?: { title?: unknown } })?.metadata?.title)
      .filter((t): t is string => typeof t === 'string');
    const chaosSteps = titles.filter((t) => /^chaos:network:latency/.test(t));
    expect(chaosSteps.length).toBeGreaterThan(0);

    // Sanity: chaos-log.json attachment path is populated post-flush and is
    // parseable as valid JSON with our expected shape. Skip if test 1 didn't
    // see the path yet (body-only case already asserted in test 1).
    if (chaosLogAttachmentPath && existsSync(chaosLogAttachmentPath)) {
      const payload = JSON.parse(readFileSync(chaosLogAttachmentPath, 'utf-8'));
      expect(payload).toMatchObject({
        eventCount: expect.any(Number),
        events: expect.any(Array),
      });
      expect(payload.events.some((e: { type: string; applied: boolean }) =>
        e.type === 'network:latency' && e.applied,
      )).toBe(true);
      expect(typeof payload.seed === 'number' || payload.seed === null).toBe(true);
    }
  });
});
