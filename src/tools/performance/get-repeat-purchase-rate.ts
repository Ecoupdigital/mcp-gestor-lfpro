import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_repeat_purchase_rate',
    area: 'performance',
    description:
      'Percentual de clientes com 2+ pedidos pagos no periodo. Calcula via GROUP BY customer_id direto em shopify_orders.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      // Pegar todos os orders pagos no periodo, agrupar manualmente por customer_id
      const { data, error } = await sb
        .from('shopify_orders')
        .select('customer_id')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false)
        .not('customer_id', 'is', null);
      if (error) throw new Error(error.message);
      const counts = new Map<number, number>();
      for (const r of data ?? []) {
        if (r.customer_id == null) continue;
        counts.set(r.customer_id, (counts.get(r.customer_id) ?? 0) + 1);
      }
      const total = counts.size;
      let repeats = 0;
      for (const c of counts.values()) if (c >= 2) repeats++;
      const rate = total > 0 ? repeats / total : 0;
      return envelope(
        {
          repeat_customers: repeats,
          total_customers: total,
          rate_percent: Math.round(rate * 10000) / 100,
        },
        { period, metric_definitions: ['repeat_purchase_rate'] },
      );
    },
  });
}
