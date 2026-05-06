import type { Page, TestInfo } from '@playwright/test';
import { test } from '@playwright/test';
import type { ChaosEvent } from '@chaos-maker/core';

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

/**
 * Format a chaos event into a compact, human-readable trace step title.
 * Keeps titles under ~80 chars; truncates long URLs from the left to preserve
 * the distinguishing path/query tail.
 *
 * Exported for unit testing.
 */
export function formatStepTitle(event: ChaosEvent): string {
  const prefix = `chaos:${event.type}`;
  const d = event.detail ?? {};
  const parts: string[] = [];

  // Subject
  const subject = d.url ?? d.selector;
  if (subject) parts.push(truncate(subject, 48));

  // Outcome suffix
  const outcome = formatOutcome(event);
  if (outcome) parts.push(`→ ${outcome}`);

  // Diagnostic marker for applied:false
  if (!event.applied) parts.push('(skipped)');

  return parts.length > 0 ? `${prefix} ${parts.join(' ')}` : prefix;
}

function formatOutcome(event: ChaosEvent): string | null {
  const d = event.detail ?? {};
  switch (event.type) {
    case 'network:failure':
      return d.statusCode != null ? String(d.statusCode) : null;
    case 'network:latency':
      return d.delayMs != null ? `+${d.delayMs}ms` : null;
    case 'network:abort':
      return 'abort';
    case 'network:corruption':
      return d.strategy ?? 'corrupted';
    case 'network:cors':
      return 'cors-block';
    case 'ui:assault':
      return d.action ?? null;
    case 'websocket:drop':
      return d.direction ? `drop ${d.direction}` : 'drop';
    case 'websocket:delay':
      return d.delayMs != null ? `delay ${d.direction ?? ''} +${d.delayMs}ms` : 'delay';
    case 'websocket:corrupt':
      return d.strategy ?? 'corrupt';
    case 'websocket:close':
      return d.closeCode != null ? `close ${d.closeCode}` : 'close';
    default:
      return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Left-truncate URLs/selectors — the tail is usually the distinguishing bit.
  return `…${s.slice(-(max - 1))}`;
}

/**
 * Decide whether an event should emit a live `test.step`.
 * Skipped (applied:false) events only render as steps when `verbose` is set,
 * to avoid drowning the action timeline in no-ops. They always land in the
 * attached JSON log regardless.
 *
 * RFC-002: `type: 'debug'` events never render as `test.step` regardless of
 * `verbose` — debug logging is high-volume by design, so the timeline stays
 * focused on real chaos decisions. Debug events still land in the JSON
 * attachment.
 *
 * Exported for unit testing.
 */
export function shouldEmitStep(event: ChaosEvent, verbose: boolean): boolean {
  if (event.type === 'debug') return false;
  if (event.applied) return true;
  return verbose;
}

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
  const verbose = opts.verbose ?? false;
  const attachmentName = opts.attachmentName ?? 'chaos-log.json';
  const events: ChaosEvent[] = [];

  // Node-side handler invoked by the page binding.
  const handler = (_source: unknown, event: ChaosEvent): void => {
    events.push(event);
    if (!shouldEmitStep(event, verbose)) return;
    // Fire-and-forget — the binding callback must not block the page.
    // `test.step` captures the current test async context; the promise is
    // resolved on the Node side once the reporter records it.
    const title = formatStepTitle(event);
    test.step(title, async () => {
      // No-op body. The step's existence is the signal; its details live on
      // the final attachment.
    }).catch(() => {
      // Swallow — late steps fired after the test body finished can throw.
      // The event is still captured in `events` and lands in the attachment.
    });
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

  return {
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
    },
  };
}
