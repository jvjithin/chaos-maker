import type { ChaosEvent } from './events';

/**
 * Format a chaos event into a compact, human-readable trace step title.
 * Keeps titles under about 80 chars; truncates long URLs from the left to
 * preserve the distinguishing path/query tail.
 */
export function formatStepTitle(event: ChaosEvent): string {
  const prefix = `chaos:${event.type}`;
  const d = event.detail ?? {};
  const parts: string[] = [];

  const subject = d.url ?? d.selector;
  if (subject) parts.push(truncate(subject, 48));

  const outcome = formatOutcome(event);
  if (outcome) parts.push(`→ ${outcome}`);

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
  return `…${s.slice(-(max - 1))}`;
}

/**
 * Decide whether an event should emit a live runner step or command-log entry.
 * Skipped events only render live when verbose output is enabled. Debug events
 * stay JSON-only because they are high-volume by design.
 */
export function shouldEmitStep(event: ChaosEvent, verbose: boolean): boolean {
  if (event.type === 'debug') return false;
  if (event.applied) return true;
  return verbose;
}
