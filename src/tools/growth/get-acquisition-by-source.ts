import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n: z.number().int().positive().max(50).optional().default(10),
});

export function register(): void {
  registerTool({
    name: 'get_acquisition_by_source',
    area: 'growth',
    description:
      'Aquisicao de pedidos por utm_source (e medium/campaign quando disponivel). Lê shopify_orders.utm_source. Output: top N sources ordenados por revenue + share_percent.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_orders')
        .select('total_price, utm_source, utm_medium, utm_campaign, customer_order_index')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (error) throw new Error(error.message);
      const counts = new Map<string, { revenue: number; orders: number; new_customers: number }>();
      for (const row of data ?? []) {
        const key = row.utm_source ?? '(none)';
        const cur = counts.get(key) ?? { revenue: 0, orders: 0, new_customers: 0 };
        cur.revenue += Number(row.total_price ?? 0);
        cur.orders += 1;
        if (row.customer_order_index === 1) cur.new_customers += 1;
        counts.set(key, cur);
      }
      const total = Array.from(counts.values()).reduce((s, v) => s + v.revenue, 0);
      const sources = Array.from(counts.entries())
        .map(([utm_source, v]) => ({
          utm_source,
          revenue_brl: Math.round(v.revenue * 100) / 100,
          orders: v.orders,
          new_customers: v.new_customers,
          share_percent: total > 0 ? Math.round((v.revenue / total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.revenue_brl - a.revenue_brl)
        .slice(0, input.top_n);
      return envelope(
        {
          sources,
          total_revenue_brl: Math.round(total * 100) / 100,
          note: 'CAC nao computado — exige join com gastos Meta+Google atribuidos por utm_source',
        },
        { period },
      );
    },
  });
}
