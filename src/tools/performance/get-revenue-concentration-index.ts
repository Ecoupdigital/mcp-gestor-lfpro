import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n: z.number().int().positive().max(1000).optional().default(10),
});

function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    cumulative += (2 * (i + 1) - n - 1) * sorted[i]!;
  }
  return Math.round((cumulative / (n * sum)) * 1000) / 1000;
}

export function register(): void {
  registerTool({
    name: 'get_revenue_concentration_index',
    area: 'performance',
    description:
      'Mede concentracao de receita por cliente: top_n_share + Gini coefficient. Top_n_share=% que os N maiores clientes representam. Gini=0 (igual) a 1 (concentrado). top_n default 10.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_orders')
        .select('customer_id, total_price')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false)
        .not('customer_id', 'is', null);
      if (error) throw new Error(error.message);
      const byCustomer = new Map<number, number>();
      for (const r of data ?? []) {
        if (r.customer_id == null) continue;
        byCustomer.set(
          r.customer_id,
          (byCustomer.get(r.customer_id) ?? 0) + Number(r.total_price ?? 0),
        );
      }
      const revenues = Array.from(byCustomer.values()).sort((a, b) => b - a);
      const total = revenues.reduce((s, v) => s + v, 0);
      const topN = revenues.slice(0, input.top_n).reduce((s, v) => s + v, 0);
      const share = total > 0 ? topN / total : 0;
      return envelope(
        {
          top_n_share_percent: Math.round(share * 10000) / 100,
          top_n_count: Math.min(input.top_n, revenues.length),
          total_customers: revenues.length,
          total_revenue_brl: Math.round(total * 100) / 100,
          top_n_revenue_brl: Math.round(topN * 100) / 100,
          gini: gini(revenues),
        },
        { period, metric_definitions: ['revenue_concentration_index'] },
      );
    },
  });
}
