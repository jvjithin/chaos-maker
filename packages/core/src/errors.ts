export class ChaosConfigError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    const message = `Invalid ChaosConfig:\n${issues.map(i => `  - ${i}`).join('\n')}`;
    super(message);
    this.name = 'ChaosConfigError';
    this.issues = issues;
  }
}
