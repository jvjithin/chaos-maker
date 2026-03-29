import { z } from 'zod';
import { ChaosConfigError } from './errors';
import type { ChaosConfig } from './config';

const probability = z.number().min(0, 'Probability must be >= 0').max(1, 'Probability must be <= 1');

const networkFailureSchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  methods: z.array(z.string()).optional(),
  statusCode: z.number().int().min(100).max(599),
  probability,
  body: z.string().optional(),
  statusText: z.string().optional(),
  headers: z.record(z.string()).optional(),
}).strict();

const networkLatencySchema = z.object({
  urlPattern: z.string().min(1, 'urlPattern must not be empty'),
  methods: z.array(z.string()).optional(),
  delayMs: z.number().min(0, 'delayMs must be >= 0'),
  probability,
}).strict();

const networkConfigSchema = z.object({
  failures: z.array(networkFailureSchema).optional(),
  latencies: z.array(networkLatencySchema).optional(),
}).strict();

const uiAssaultSchema = z.object({
  selector: z.string().min(1, 'selector must not be empty'),
  action: z.enum(['disable', 'hide', 'remove']),
  probability,
}).strict();

const uiConfigSchema = z.object({
  assaults: z.array(uiAssaultSchema).optional(),
}).strict();

const chaosConfigSchema = z.object({
  network: networkConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
}).strict();

export function validateConfig(config: unknown): ChaosConfig {
  const result = chaosConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    throw new ChaosConfigError(issues);
  }
  return result.data as ChaosConfig;
}
