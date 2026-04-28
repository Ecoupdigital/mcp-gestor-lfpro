import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  breakdown: z.enum(['channel', 'region', 'product', 'segment', 'none']).optional(),
});

export function register(): void {
  registerTool({
    name: 'get_revenue',
    area: 'performance',
    description:
      'Receita liquida em BRL (orders pagos PAID/PARTIALLY_PAID, exclui test) para o periodo. Aceita period como preset (last_7d, last_30d, etc) OR {from, to} YYYY-MM-DD. Sem breakdown retorna total. Schema: shopify_orders.total_price ja em BRL (numeric).',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data, error } = await sb
        .from('shopify_orders')
        .select('total_price')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (error) throw new Error(error.message);
      const orders = data ?? [];
      const totalBrl = orders.reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);
      return envelope(
        {
          revenue_brl: Math.round(totalBrl * 100) / 100,
          revenue_cents: Math.round(totalBrl * 100),
          orders_considered: orders.length,
          breakdown: input.breakdown ?? 'none',
        },
        { period, metric_definitions: ['revenue'] },
      );
    },
  });
}
