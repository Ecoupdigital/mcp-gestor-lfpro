import { z } from 'zod';
import { registerTool, callTool } from '../registry.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  metric: z.enum([
    'revenue',
    'orders_count',
    'aov',
    'conversion_rate',
    'repeat_purchase_rate',
  ]),
  period_a: PeriodPresetSchema,
  period_b: PeriodPresetSchema,
});

const METRIC_TO_TOOL: Record<string, { tool: string; field: string }> = {
  revenue: { tool: 'get_revenue', field: 'revenue_brl' },
  orders_count: { tool: 'get_orders_count', field: 'count' },
  aov: { tool: 'get_aov', field: 'aov_brl' },
  conversion_rate: { tool: 'get_conversion_rate', field: 'rate_percent' },
  repeat_purchase_rate: { tool: 'get_repeat_purchase_rate', field: 'rate_percent' },
};

export function register(): void {
  registerTool({
    name: 'compare_periods',
    area: 'growth',
    description:
      'Compara qualquer metrica entre 2 periodos. metric in (revenue, orders_count, aov, conversion_rate, repeat_purchase_rate). Reusa as tools certificadas correspondentes — fonte unica de verdade.',
    inputSchema: Input,
    handler: async (input) => {
      const map = METRIC_TO_TOOL[input.metric];
      if (!map) throw new Error(`unknown metric: ${input.metric}`);
      const periodA = resolvePeriod(input.period_a);
      const periodB = resolvePeriod(input.period_b);
      const resA = (await callTool(map.tool, { period: input.period_a })) as {
        ok: boolean;
        data: Record<string, number | undefined>;
      };
      const resB = (await callTool(map.tool, { period: input.period_b })) as {
        ok: boolean;
        data: Record<string, number | undefined>;
      };
      const valA = Number(resA.data[map.field] ?? 0);
      const valB = Number(resB.data[map.field] ?? 0);
      const absDelta = valA - valB;
      const pctDelta = valB > 0 ? (absDelta / valB) * 100 : 0;
      return envelope(
        {
          metric: input.metric,
          field: map.field,
          period_a: { ...periodA, value: valA },
          period_b: { ...periodB, value: valB },
          abs_delta: Math.round(absDelta * 100) / 100,
          pct_delta: Math.round(pctDelta * 100) / 100,
        },
        { metric_definitions: [input.metric] },
      );
    },
  });
}
