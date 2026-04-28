import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  segment: z.string().optional(),
});

export function register(): void {
  registerTool({
    name: 'get_aov',
    area: 'performance',
    description:
      'Average Order Value (ticket medio em BRL) para periodo. Considera orders pagos test=false. Param segment opcional filtra por rfm_segment do customer (ex: Champions, Em Risco, Hibernando, Loyal Customers).',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      let query = sb
        .from('shopify_orders')
        .select('total_price, customer_id, shopify_customers!inner(rfm_segment)')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (input.segment) {
        query = sb
          .from('shopify_orders')
          .select('total_price, customer_id, shopify_customers!inner(rfm_segment)')
          .gte('created_at', period.from)
          .lte('created_at', period.to + 'T23:59:59')
          .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
          .eq('test', false)
          .eq('shopify_customers.rfm_segment', input.segment);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const orders = data ?? [];
      const total = orders.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
      const aov = orders.length > 0 ? total / orders.length : 0;
      return envelope(
        {
          aov_brl: Math.round(aov * 100) / 100,
          aov_cents: Math.round(aov * 100),
          orders_count: orders.length,
          revenue_brl: Math.round(total * 100) / 100,
          segment: input.segment ?? 'all',
        },
        { period, metric_definitions: ['aov'] },
      );
    },
  });
}
