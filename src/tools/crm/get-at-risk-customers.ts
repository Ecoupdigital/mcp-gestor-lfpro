import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({
  ltv_threshold_brl: z.number().positive().optional().default(500),
  limit: z.number().int().positive().max(200).optional().default(50),
});

export function register(): void {
  registerTool({
    name: 'get_at_risk_customers',
    area: 'crm',
    description:
      "Clientes em rfm_segment 'Em Risco' com LTV historico (total_spent) acima do threshold em BRL. Default threshold R$ 500. Retorna ate `limit` clientes com email_hash, total_spent, last_order_date, recency_days.",
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_customers')
        .select('id, shopify_customer_id, rfm_segment, total_spent, orders_count, recency_days, last_order_date, churn_risk_score')
        .eq('rfm_segment', 'Em Risco')
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
        churn_risk_score: c.churn_risk_score,
      }));
      return envelope({
        customers,
        count: customers.length,
        threshold_brl: input.ltv_threshold_brl,
      });
    },
  });
}
