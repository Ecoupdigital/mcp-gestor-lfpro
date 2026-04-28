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
    preset: z.enum([
      'today',
      'last_7d',
      'last_14d',
      'last_30d',
      'last_60d',
      'last_90d',
      // prior_* = janela imediatamente anterior à last_* de mesma duração.
      // Uso pra apples-to-apples (last_7d vs prior_7d compara 7d vs 7d, não 7d vs 30d).
      'prior_7d',
      'prior_14d',
      'prior_30d',
      'prior_60d',
      'prior_90d',
    ]),
  }),
]);

export type PeriodPresetInput = z.infer<typeof PeriodPresetSchema>;

export function resolvePeriod(input: PeriodPresetInput): Period {
  if ('preset' in input) {
    const today = new Date();
    const map: Record<string, { days: number; offset: number }> = {
      today: { days: 0, offset: 0 },
      last_7d: { days: 7, offset: 0 },
      last_14d: { days: 14, offset: 0 },
      last_30d: { days: 30, offset: 0 },
      last_60d: { days: 60, offset: 0 },
      last_90d: { days: 90, offset: 0 },
      prior_7d: { days: 7, offset: 7 },
      prior_14d: { days: 14, offset: 14 },
      prior_30d: { days: 30, offset: 30 },
      prior_60d: { days: 60, offset: 60 },
      prior_90d: { days: 90, offset: 90 },
    };
    const cfg = map[input.preset];
    if (!cfg) {
      throw new Error(`unknown preset: ${input.preset}`);
    }
    const to = new Date(today.getTime() - cfg.offset * 86400_000).toISOString().slice(0, 10);
    const from = new Date(today.getTime() - (cfg.offset + cfg.days) * 86400_000)
      .toISOString()
      .slice(0, 10);
    return { from, to };
  }
  return input;
}

export function periodDurationDays(p: Period): number {
  const fromMs = new Date(p.from + 'T00:00:00Z').getTime();
  const toMs = new Date(p.to + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((toMs - fromMs) / 86400_000) + 1);
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
