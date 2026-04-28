import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({
  ltv_threshold_brl: z.number().positive().optional().default(1000),
  limit: z.number().int().positive().max(200).optional().default(50),
});

export function register(): void {
  registerTool({
    name: 'get_reactivation_candidates',
    area: 'crm',
    description:
      "Clientes em rfm_segment 'Hibernando' com LTV historico (total_spent) acima do threshold. Default R$ 1000. Output ordenado por total_spent DESC.",
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_customers')
        .select('id, shopify_customer_id, rfm_segment, total_spent, orders_count, recency_days, last_order_date')
        .eq('rfm_segment', 'Hibernando')
        .gte('total_spent', input.ltv_threshold_brl)
        .order('total_spent', { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      const customers = (data ?? []).map((c) => ({
        id: c.id,
        shopify_customer_id: c.shopify_customer_id,
        segment: c.rfm_segment,
        total_spent_brl: Number(c.total_spent ?? 0),
        orders_count: c.orders_count,
        recency_days: c.recency_days,
        last_order_date: c.last_order_date,
      }));
      return envelope({
        customers,
        count: customers.length,
        threshold_brl: input.ltv_threshold_brl,
      });
    },
  });
}
