export function formatSeedReproduction(seed: number | null): string {
  return seed === null ? 'chaos seed: <not injected>' : `chaos seed: ${seed}`;
}
