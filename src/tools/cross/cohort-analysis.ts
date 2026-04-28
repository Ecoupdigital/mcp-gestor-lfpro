import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope, notAvailable } from '../util.js';

const Input = z.object({
  cohort_dim: z.enum(['acquisition_month']),
  metric: z.enum(['ltv', 'orders']),
  cohorts: z.number().int().positive().max(12).optional().default(6),
  periods: z.number().int().positive().max(12).optional().default(6),
});

export function register(): void {
  registerTool({
    name: 'cohort_analysis',
    area: 'cross',
    description:
      'Cohort analysis. cohort_dim=acquisition_month agrupa clientes pelo mes do primeiro pedido pago. metric=ltv mostra revenue acumulado por mes desde aquisicao; metric=orders mostra qty pedidos. Default 6 cohorts x 6 periodos.',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const today = new Date();
      const cohortStart = new Date(today.getFullYear(), today.getMonth() - input.cohorts, 1);
      const cohortStartStr = cohortStart.toISOString().slice(0, 10);
      // Get customers with first paid order between cohortStart and today
      const { data: customers, error } = await sb
        .from('shopify_customers')
        .select('id, last_order_date, created_at')
        .gte('created_at', cohortStartStr)
        .limit(50000);
      if (error) throw new Error(error.message);
      const cohortMap = new Map<string, number[]>(); // cohort_key -> customer_ids
      for (const c of customers ?? []) {
        if (!c.created_at) continue;
        const key = c.created_at.slice(0, 7); // YYYY-MM
        if (!cohortMap.has(key)) cohortMap.set(key, []);
        cohortMap.get(key)!.push(c.id);
      }
      if (cohortMap.size === 0) {
        return envelope(notAvailable('nenhum customer no range de cohorts'), {});
      }
      const cohorts: Array<{
        cohort_key: string;
        size: number;
        periods: Array<{ period: number; value: number }>;
      }> = [];
      for (const [cohortKey, ids] of Array.from(cohortMap.entries()).sort()) {
        const [yr, mo] = cohortKey.split('-').map(Number);
        const periodValues: Array<{ period: number; value: number }> = [];
        for (let p = 0; p < input.periods; p++) {
          const periodStart = new Date(yr!, mo! - 1 + p, 1);
          const periodEnd = new Date(yr!, mo! + p, 0, 23, 59, 59);
          if (periodStart > today) break;
          let acc = 0;
          // chunk customer ids
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const { data } = await sb
              .from('shopify_orders')
              .select('total_price')
              .in('customer_id', chunk)
              .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
              .eq('test', false)
              .gte('created_at', periodStart.toISOString())
              .lte('created_at', periodEnd.toISOString());
            for (const o of data ?? []) {
              if (input.metric === 'ltv') acc += Number(o.total_price ?? 0);
              else acc += 1;
            }
          }
          periodValues.push({
            period: p,
            value: input.metric === 'ltv' ? Math.round(acc * 100) / 100 : acc,
          });
        }
        cohorts.push({ cohort_key: cohortKey, size: ids.length, periods: periodValues });
      }
      return envelope({
        cohort_dim: input.cohort_dim,
        metric: input.metric,
        cohorts,
        note: 'cohort_key = mes de criacao do customer (YYYY-MM). period 0 = primeiro mes apos aquisicao.',
      });
    },
  });
}
