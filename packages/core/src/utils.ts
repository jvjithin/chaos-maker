import type { CorruptionStrategy } from './config';

export function shouldApplyChaos(probability: number): boolean {
  return Math.random() < probability;
}

export function corruptText(text: string, strategy: CorruptionStrategy): string {
  switch (strategy) {
    case 'truncate':
      return text.slice(0, Math.max(0, Math.floor(text.length / 2)));
    case 'malformed-json':
      return `${text}"}`;
    case 'empty':
      return '';
    case 'wrong-type':
      return '<html><body>Unexpected HTML</body></html>';
  }
}
