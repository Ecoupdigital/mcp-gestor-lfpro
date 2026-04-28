import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({
  cohort_month: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM'),
});

export function register(): void {
  registerTool({
    name: 'get_ltv_by_cohort',
    area: 'performance',
    description:
      'Lifetime Value medio por cohort mensal de aquisicao. cohort_month=YYYY-MM, calcula LTV ate hoje dos clientes adquiridos nesse mes (primeiro pedido pago no mes).',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      // Cohort = customers cujo created_at cai no mes
      const cohortStart = `${input.cohort_month}-01`;
      const [year, month] = input.cohort_month.split('-').map(Number);
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const { data: cohortCustomers, error: cErr } = await sb
        .from('shopify_customers')
        .select('id')
        .gte('created_at', cohortStart)
        .lt('created_at', nextMonth);
      if (cErr) throw new Error(cErr.message);
      const ids = (cohortCustomers ?? []).map((c: { id: number }) => c.id);
      if (ids.length === 0) {
        return envelope(
          {
            cohort: input.cohort_month,
            customers: 0,
            total_revenue_brl: 0,
            ltv_brl: 0,
          },
          { metric_definitions: ['ltv_by_cohort'] },
        );
      }
      // Sum revenue de TODOS os pedidos pagos desses customers
      // Chunk pra evitar PostgREST URL limit
      let totalRevenue = 0;
      const chunkSize = 1000;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await sb
          .from('shopify_orders')
          .select('total_price')
          .in('customer_id', chunk)
          .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
          .eq('test', false);
        if (error) throw new Error(error.message);
        for (const o of data ?? []) totalRevenue += Number(o.total_price ?? 0);
      }
      const ltv = ids.length > 0 ? totalRevenue / ids.length : 0;
      return envelope(
        {
          cohort: input.cohort_month,
          customers: ids.length,
          total_revenue_brl: Math.round(totalRevenue * 100) / 100,
          ltv_brl: Math.round(ltv * 100) / 100,
          ltv_cents: Math.round(ltv * 100),
        },
        { metric_definitions: ['ltv_by_cohort'] },
      );
    },
  });
}
