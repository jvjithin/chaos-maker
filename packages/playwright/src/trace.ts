import type { Page, TestInfo } from '@playwright/test';
import { test } from '@playwright/test';
import type { ChaosEvent } from '@chaos-maker/core';
import { formatStepTitle, shouldEmitStep } from '@chaos-maker/core';

/**
 * Binding name used to bridge in-page chaos events to the Node test runner.
 * Namespaced to avoid collisions with user bindings.
 */
export const CHAOS_BINDING = '__chaosMakerReport';

/**
 * Shape of the JSON attachment written to `testInfo.attachments` on teardown.
 */
export interface ChaosTraceAttachment {
  seed: number | null;
  eventCount: number;
  events: ChaosEvent[];
}

export { formatStepTitle, shouldEmitStep } from '@chaos-maker/core';

/**
 * Handle returned from `createTraceReporter` — call `dispose()` on teardown
 * to flush the attached log and unbind.
 */
export interface TraceReporterHandle {
  /**
   * Dispose: attach the final event log to testInfo and release resources.
   * Optional `seed` is embedded at the top of the attachment for one-click
   * replay — callers typically read it via `getChaosSeed(page)` just before
   * calling dispose.
   */
  dispose: (seed?: number | null) => Promise<void>;
  /** All events observed so far (shared reference; mutated as events stream). */
  readonly events: ChaosEvent[];
}

export interface TraceReporterOptions {
  /** Emit `test.step` for `applied:false` diagnostic events too. Default false. */
  verbose?: boolean;
  /** Attachment name. Default `chaos-log.json`. */
  attachmentName?: string;
}

const TRACE_HANDLE_KEY = Symbol.for('chaos-maker.playwright.traceHandle');

/**
 * Wire the Playwright page ↔ Node bridge that ships chaos events from the
 * in-page emitter into the test runner's trace/report surfaces.
 *
 * Mechanism:
 *   1. `page.exposeBinding(CHAOS_BINDING, handler)` — Playwright-native push
 *      channel (survives navigations).
 *   2. `page.addInitScript(...)` — subscribes `chaosUtils.instance.on('*', …)`
 *      after the core UMD has auto-started. Re-runs on every navigation.
 *
 * On each event, we fire a fire-and-forget `test.step` so the chaos decision
 * appears inline in the Playwright trace action timeline.
 *
 * On `dispose()`, the full event log (including skipped/diagnostic events) is
 * attached to `testInfo` as JSON for programmatic post-mortem.
 */
export async function createTraceReporter(
  page: Page,
  testInfo: TestInfo,
  opts: TraceReporterOptions = {},
): Promise<TraceReporterHandle> {
  const existing = (page as any)[TRACE_HANDLE_KEY] as TraceReporterHandle | undefined;
  if (existing) return existing;

  const verbose = opts.verbose ?? false;
  const attachmentName = opts.attachmentName ?? 'chaos-log.json';
  const events: ChaosEvent[] = [];

  // Node-side handler invoked by the page binding.
  const handler = (_source: unknown, event: ChaosEvent): void => {
    events.push(event);
    if (!shouldEmitStep(event, verbose)) return;
    // Fire-and-forget: the binding callback must not block the page.
    // `test.step` captures the current test async context; the promise is
    // resolved on the Node side once the reporter records it.
    const title = formatStepTitle(event);
    try {
      test.step(title, async () => {
        // No-op body. The step's existence is the signal; its details live on
        // the final attachment.
      }).catch(() => {
        // Swallow late step rejections after the test body has finished.
      });
    } catch {
      // Swallow late synchronous throws after the test body has finished.
    }
  };

  // exposeBinding is per-page and persists across navigations.
  await page.exposeBinding(CHAOS_BINDING, handler);

  // Install the in-page subscriber. Runs on every navigation, after the UMD
  // init script has auto-started chaosUtils.
  await page.addInitScript((bindingName: string) => {
    const win = globalThis as any;
    const attach = (): boolean => {
      const utils = win.chaosUtils;
      if (!utils || !utils.instance) return false;
      // Guard: don't double-subscribe if init script runs twice on same
      // context (shouldn't, but defensive).
      if (utils.__chaosMakerTraceBound === utils.instance) return true;
      utils.__chaosMakerTraceBound = utils.instance;
      utils.instance.on('*', (event: unknown) => {
        try {
          if (typeof win[bindingName] === 'function') {
            win[bindingName](event);
          }
        } catch {
          // Binding not yet ready or page closing — drop the event.
        }
      });
      return true;
    };
    if (attach()) return;
    // Instance not yet created — poll briefly until the UMD auto-start runs.
    const intervalId = setInterval(() => {
      if (attach()) clearInterval(intervalId);
    }, 10);
    setTimeout(() => clearInterval(intervalId), 5000);
  }, CHAOS_BINDING);

  const handle: TraceReporterHandle = {
    events,
    dispose: async (seed: number | null = null) => {
      const payload: ChaosTraceAttachment = {
        seed,
        eventCount: events.length,
        events,
      };
      try {
        await testInfo.attach(attachmentName, {
          body: Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
          contentType: 'application/json',
        });
      } catch {
        // Test already finished / attachment not accepted — ignore.
      }
      if ((page as any)[TRACE_HANDLE_KEY] === handle) {
        delete (page as any)[TRACE_HANDLE_KEY];
      }
    },
  };
  (page as any)[TRACE_HANDLE_KEY] = handle;
  return handle;
}
