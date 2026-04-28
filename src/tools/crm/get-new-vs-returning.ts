import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_new_vs_returning',
    area: 'crm',
    description:
      'Compara clientes novos (primeiro pedido no periodo) vs returning (pedido anterior ao periodo). Usa shopify_orders.customer_order_index quando disponivel; fallback para shopify_customers.created_at.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_orders')
        .select('customer_id, total_price, customer_order_index, created_at')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false)
        .not('customer_id', 'is', null);
      if (error) throw new Error(error.message);
      let newCustomers = new Set<number>();
      let returning = new Set<number>();
      let newRevenue = 0;
      let returningRevenue = 0;
      let unknownIdx = 0;
      for (const r of data ?? []) {
        if (r.customer_id == null) continue;
        const isFirst = r.customer_order_index === 1;
        const idx = r.customer_order_index;
        if (idx == null) {
          unknownIdx++;
          continue;
        }
        if (isFirst) {
          newCustomers.add(r.customer_id);
          newRevenue += Number(r.total_price ?? 0);
        } else {
          returning.add(r.customer_id);
          returningRevenue += Number(r.total_price ?? 0);
        }
      }
      const total = newRevenue + returningRevenue;
      return envelope(
        {
          new_customers: newCustomers.size,
          returning_customers: returning.size,
          new_revenue_brl: Math.round(newRevenue * 100) / 100,
          returning_revenue_brl: Math.round(returningRevenue * 100) / 100,
          new_share_percent: total > 0 ? Math.round((newRevenue / total) * 10000) / 100 : 0,
          orders_with_unknown_index: unknownIdx,
        },
        { period },
      );
    },
  });
}
