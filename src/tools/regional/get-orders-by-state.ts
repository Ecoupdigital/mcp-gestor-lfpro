import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_orders_by_state',
    area: 'regional',
    description:
      'Pedidos pagos no periodo agrupados por province_code (BR estado, ex: SP, RS, RJ). JOIN shopify_orders -> shopify_shipping_addresses (shipping_address_id). Output ordenado por revenue DESC.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_orders')
        .select('total_price, shipping_address:shopify_shipping_addresses!shipping_address_id(province_code, province)')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (error) throw new Error(error.message);
      const counts = new Map<string, { orders: number; revenue: number; province_name: string }>();
      for (const row of (data ?? []) as unknown as Array<{
        total_price: number | null;
        shipping_address?: { province_code?: string | null; province?: string | null } | null;
      }>) {
        const code = row.shipping_address?.province_code ?? '(unknown)';
        const name = row.shipping_address?.province ?? '(unknown)';
        const cur = counts.get(code) ?? { orders: 0, revenue: 0, province_name: name };
        cur.orders += 1;
        cur.revenue += Number(row.total_price ?? 0);
        cur.province_name = name;
        counts.set(code, cur);
      }
      const totalRevenue = Array.from(counts.values()).reduce((s, v) => s + v.revenue, 0);
      const states = Array.from(counts.entries())
        .map(([province_code, v]) => ({
          province_code,
          province_name: v.province_name,
          orders: v.orders,
          revenue_brl: Math.round(v.revenue * 100) / 100,
          share_percent: totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.revenue_brl - a.revenue_brl);
      return envelope(
        {
          states,
          total_orders: states.reduce((s, v) => s + v.orders, 0),
          total_revenue_brl: Math.round(totalRevenue * 100) / 100,
        },
        { period, metric_definitions: ['region_share'] },
      );
    },
  });
}
