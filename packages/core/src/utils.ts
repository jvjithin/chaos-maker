export function shouldApplyChaos(probability: number): boolean {
  return Math.random() < probability;
}
