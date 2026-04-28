import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n: z.number().int().positive().max(50).optional().default(10),
});

export function register(): void {
  registerTool({
    name: 'get_landing_page_performance',
    area: 'cro',
    description:
      'Performance das top N landing pages. Lê shopify_orders.landing_site (URL inicial da sessao) + sessions_by_region se houver coluna landing. Fallback usa landing_site distribution dos pedidos pagos.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      // Fallback factual: distribuicao de pedidos por landing_site
      const { data, error } = await sb
        .from('shopify_orders')
        .select('landing_site, total_price')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false)
        .not('landing_site', 'is', null);
      if (error) {
        return envelope(notAvailable(error.message), { period });
      }
      const byPage = new Map<string, { orders: number; revenue: number }>();
      for (const r of data ?? []) {
        const key = r.landing_site ?? '(none)';
        const cur = byPage.get(key) ?? { orders: 0, revenue: 0 };
        cur.orders += 1;
        cur.revenue += Number(r.total_price ?? 0);
        byPage.set(key, cur);
      }
      const pages = Array.from(byPage.entries())
        .map(([path, v]) => ({
          path,
          orders: v.orders,
          revenue_brl: Math.round(v.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenue_brl - a.revenue_brl)
        .slice(0, input.top_n);
      return envelope(
        {
          pages,
          source: 'shopify_orders.landing_site (fallback — sem sessions_by_region.landing)',
          note: 'sessions/conversion_rate por pagina nao disponivel sem session tracking by URL',
        },
        { period },
      );
    },
  });
}
