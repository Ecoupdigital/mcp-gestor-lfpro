import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n: z.number().int().positive().max(1000).optional().default(10),
});

export function register(): void {
  registerTool({
    name: 'get_customer_concentration',
    area: 'crm',
    description:
      'Concentracao de receita pelos top N clientes no periodo. Output: top_n_share_percent, distribution_curve com 5 buckets (top1, top5, top10, top50, rest).',
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
        byCustomer.set(r.customer_id, (byCustomer.get(r.customer_id) ?? 0) + Number(r.total_price ?? 0));
      }
      const sorted = Array.from(byCustomer.values()).sort((a, b) => b - a);
      const total = sorted.reduce((s, v) => s + v, 0);
      const sumTopN = (n: number) => sorted.slice(0, n).reduce((s, v) => s + v, 0);
      const buckets = [
        { name: 'top_1', share_percent: total > 0 ? Math.round((sumTopN(1) / total) * 10000) / 100 : 0 },
        { name: 'top_5', share_percent: total > 0 ? Math.round((sumTopN(5) / total) * 10000) / 100 : 0 },
        { name: 'top_10', share_percent: total > 0 ? Math.round((sumTopN(10) / total) * 10000) / 100 : 0 },
        { name: 'top_50', share_percent: total > 0 ? Math.round((sumTopN(50) / total) * 10000) / 100 : 0 },
        { name: 'rest', share_percent: total > 0 ? Math.round(((total - sumTopN(50)) / total) * 10000) / 100 : 0 },
      ];
      return envelope(
        {
          top_n: input.top_n,
          top_n_count: Math.min(input.top_n, sorted.length),
          top_n_revenue_brl: Math.round(sumTopN(input.top_n) * 100) / 100,
          total_revenue_brl: Math.round(total * 100) / 100,
          top_n_share_percent: total > 0 ? Math.round((sumTopN(input.top_n) / total) * 10000) / 100 : 0,
          distribution_curve: buckets,
          total_customers: sorted.length,
        },
        { period, metric_definitions: ['customer_concentration'] },
      );
    },
  });
}
