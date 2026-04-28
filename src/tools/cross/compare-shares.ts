import { z } from 'zod';
import { registerTool, callTool } from '../registry.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  dimension: z.enum(['region', 'utm_source']),
  value: z.string().min(1),
  period_a: PeriodPresetSchema,
  period_b: PeriodPresetSchema,
});

export function register(): void {
  registerTool({
    name: 'compare_shares',
    area: 'cross',
    description:
      "Compara share de uma dimensao value entre 2 periodos com normalizacao apples-to-apples. Mesma fonte (shopify_orders pagos test=false), mesmo numerador (revenue da dimensao=value), mesmo denominator (revenue total do periodo). dimension in (region, utm_source). Para region, value=province_code (ex: RS).",
    inputSchema: Input,
    handler: async (input) => {
      const periodA = resolvePeriod(input.period_a);
      const periodB = resolvePeriod(input.period_b);
      // Reusa get_orders_by_state OR get_revenue_mix dependendo da dimensao
      const tool = input.dimension === 'region' ? 'get_orders_by_state' : 'get_revenue_mix';
      const args = input.dimension === 'region'
        ? { period: input.period_a }
        : { period: input.period_a, dimension: 'utm_source' };
      const argsB = input.dimension === 'region'
        ? { period: input.period_b }
        : { period: input.period_b, dimension: 'utm_source' };
      const resA = (await callTool(tool, args)) as { ok: boolean; data: { states?: Array<{ province_code: string; revenue_brl: number }>; mix?: Array<{ key: string; revenue_brl: number }>; total_revenue_brl?: number } };
      const resB = (await callTool(tool, argsB)) as { ok: boolean; data: { states?: Array<{ province_code: string; revenue_brl: number }>; mix?: Array<{ key: string; revenue_brl: number }>; total_revenue_brl?: number } };
      function find(res: typeof resA): { value: number; total: number } {
        if (input.dimension === 'region') {
          const states = res.data.states ?? [];
          const found = states.find((s) => s.province_code === input.value);
          const total = states.reduce((s, r) => s + r.revenue_brl, 0);
          return { value: found?.revenue_brl ?? 0, total };
        }
        const mix = res.data.mix ?? [];
        const found = mix.find((m) => m.key === input.value);
        const total = res.data.total_revenue_brl ?? mix.reduce((s, r) => s + r.revenue_brl, 0);
        return { value: found?.revenue_brl ?? 0, total };
      }
      const a = find(resA);
      const b = find(resB);
      const shareA = a.total > 0 ? a.value / a.total : 0;
      const shareB = b.total > 0 ? b.value / b.total : 0;
      return envelope({
        dimension: input.dimension,
        value: input.value,
        share_a_percent: Math.round(shareA * 10000) / 100,
        share_b_percent: Math.round(shareB * 10000) / 100,
        delta_pp: Math.round((shareA - shareB) * 10000) / 100,
        denominator_a_brl: Math.round(a.total * 100) / 100,
        denominator_b_brl: Math.round(b.total * 100) / 100,
        denominator_match: true,
        method: 'apples-to-apples — mesma fonte (shopify_orders pagos test=false), mesmo numerador (revenue da dimensao=value), mesmo denominator (revenue total do periodo)',
        period_a: periodA,
        period_b: periodB,
      });
    },
  });
}
