import { z } from 'zod';
import { registerTool, callTool } from '../registry.js';
import { PeriodPresetSchema, resolvePeriod, periodDurationDays, envelope } from '../util.js';

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

interface MetricMap {
  tool: string;
  field: string;
  // cumulative=true: total acumulado da janela (revenue, orders) — pct_delta direto
  // entre janelas de duração diferente é APPLES-TO-ORANGES. Tool normaliza por dia.
  // cumulative=false: rate/média (aov, conversion_rate) — comparação direta OK.
  cumulative: boolean;
}

const METRIC_TO_TOOL: Record<string, MetricMap> = {
  revenue: { tool: 'get_revenue', field: 'revenue_brl', cumulative: true },
  orders_count: { tool: 'get_orders_count', field: 'count', cumulative: true },
  aov: { tool: 'get_aov', field: 'aov_brl', cumulative: false },
  conversion_rate: { tool: 'get_conversion_rate', field: 'rate_percent', cumulative: false },
  repeat_purchase_rate: {
    tool: 'get_repeat_purchase_rate',
    field: 'rate_percent',
    cumulative: false,
  },
};

export function register(): void {
  registerTool({
    name: 'compare_periods',
    area: 'growth',
    description:
      'Compara qualquer metrica entre 2 periodos. metric in (revenue, orders_count, aov, conversion_rate, repeat_purchase_rate). Reusa as tools certificadas correspondentes — fonte unica de verdade. APPLES-TO-APPLES: para metricas cumulativas (revenue, orders_count) compara per_day quando duracao diferente — pct_delta sempre normalizado. Para metricas de taxa (aov, rates) compara valores diretos. Use prior_* presets para 7d-vs-7d-anterior.',
    inputSchema: Input,
    handler: async (input) => {
      const map = METRIC_TO_TOOL[input.metric];
      if (!map) throw new Error(`unknown metric: ${input.metric}`);
      const periodA = resolvePeriod(input.period_a);
      const periodB = resolvePeriod(input.period_b);
      const daysA = periodDurationDays(periodA);
      const daysB = periodDurationDays(periodB);
      const sameDuration = daysA === daysB;

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

      // Bases para comparacao:
      //  - cumulative + janelas diferentes  → comparar per-day (apples-to-apples)
      //  - cumulative + mesma janela        → comparar total (equivalente a per-day)
      //  - rate/aov                         → comparar total direto (rate ja eh per-unit)
      const compareA = map.cumulative ? valA / daysA : valA;
      const compareB = map.cumulative ? valB / daysB : valB;

      const absDelta = compareA - compareB;
      const pctDelta = compareB > 0 ? (absDelta / compareB) * 100 : 0;

      const warnings: string[] = [];
      if (map.cumulative && !sameDuration) {
        warnings.push(
          `windows differ (${daysA}d vs ${daysB}d) — pct_delta normalizado por dia para apples-to-apples`,
        );
      }

      return envelope(
        {
          metric: input.metric,
          field: map.field,
          is_cumulative_metric: map.cumulative,
          same_duration: sameDuration,
          period_a: {
            ...periodA,
            value: valA,
            days: daysA,
            value_per_day: Math.round((valA / daysA) * 100) / 100,
          },
          period_b: {
            ...periodB,
            value: valB,
            days: daysB,
            value_per_day: Math.round((valB / daysB) * 100) / 100,
          },
          abs_delta: Math.round(absDelta * 100) / 100,
          pct_delta: Math.round(pctDelta * 100) / 100,
          comparison_basis: map.cumulative ? 'per_day' : 'absolute',
          warnings,
        },
        { metric_definitions: [input.metric] },
      );
    },
  });
}
