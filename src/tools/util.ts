import { z } from 'zod';

/**
 * YYYY-MM-DD date schema. Both endpoints inclusive.
 */
export const PeriodSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  })
  .refine((p) => p.from <= p.to, { message: 'from must be <= to' });

export type Period = z.infer<typeof PeriodSchema>;

export const PeriodPresetSchema = z.union([
  PeriodSchema,
  z.object({
    preset: z.enum(['today', 'last_7d', 'last_14d', 'last_30d', 'last_60d', 'last_90d']),
  }),
]);

export type PeriodPresetInput = z.infer<typeof PeriodPresetSchema>;

export function resolvePeriod(input: PeriodPresetInput): Period {
  if ('preset' in input) {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const map: Record<string, number> = {
      today: 0,
      last_7d: 7,
      last_14d: 14,
      last_30d: 30,
      last_60d: 60,
      last_90d: 90,
    };
    const days = map[input.preset];
    if (days === undefined) {
      throw new Error(`unknown preset: ${input.preset}`);
    }
    const from = new Date(today.getTime() - days * 86400_000).toISOString().slice(0, 10);
    return { from, to };
  }
  return input;
}

export function centsToBRL(cents: number): number {
  return Math.round(cents) / 100;
}

export interface ToolResultEnvelope<T> {
  ok: true;
  data: T;
  metric_definitions?: string[];
  period?: Period;
  cached?: false;
}

export interface NotAvailableData {
  not_available: true;
  reason: string;
}

export function envelope<T>(data: T, opts?: Partial<ToolResultEnvelope<T>>): ToolResultEnvelope<T> {
  return { ok: true, data, ...opts };
}

export function notAvailable(reason: string): NotAvailableData {
  return { not_available: true, reason };
}
