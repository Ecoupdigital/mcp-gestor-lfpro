import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  status: z
    .enum(['PAID', 'PENDING', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'all'])
    .optional()
    .default('PAID'),
});

export function register(): void {
  registerTool({
    name: 'get_orders_count',
    area: 'performance',
    description:
      'Volume de pedidos no periodo. Default status=PAID (inclui PARTIALLY_PAID). status=all retorna todos. Sempre exclui test=true.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      let q = sb
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .eq('test', false);
      if (input.status === 'PAID') {
        q = q.in('financial_status', ['PAID', 'PARTIALLY_PAID']);
      } else if (input.status !== 'all') {
        q = q.eq('financial_status', input.status);
      }
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return envelope(
        { count: count ?? 0, status: input.status ?? 'PAID' },
        { period, metric_definitions: ['orders_count'] },
      );
    },
  });
}
