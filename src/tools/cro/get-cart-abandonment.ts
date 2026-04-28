import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_cart_abandonment',
    area: 'cro',
    description:
      'Taxa de abandono de carrinho estimada (proxy). Sessoes com pages_viewed>=3 que nao viraram order. Requer sessions_by_region (Fase 06).',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data: sess, error: sErr } = await sb
        .from('sessions_by_region')
        .select('sessions, pages_viewed')
        .gte('date', period.from)
        .lte('date', period.to);
      if (sErr) {
        return envelope(notAvailable(`sessions_by_region: ${sErr.message}`), {
          period,
          metric_definitions: ['cart_abandonment_rate'],
        });
      }
      const totalSessions = (sess ?? []).reduce(
        (s: number, r: { sessions?: number | null }) => s + (r.sessions ?? 0),
        0,
      );
      const sessionsWithCart = (sess ?? []).reduce(
        (s: number, r: { sessions?: number | null; pages_viewed?: number | null }) =>
          s + ((r.pages_viewed ?? 0) >= 3 ? r.sessions ?? 0 : 0),
        0,
      );
      const { count: ordersPaid } = await sb
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      const orders = ordersPaid ?? 0;
      const rate = sessionsWithCart > 0 ? 1 - orders / sessionsWithCart : 0;
      return envelope(
        {
          rate_percent: Math.round(Math.max(0, rate) * 10000) / 100,
          sessions_with_cart: sessionsWithCart,
          orders_paid: orders,
          total_sessions: totalSessions,
          method: 'proxy: pages_viewed>=3 sessions vs orders paid',
        },
        { period, metric_definitions: ['cart_abandonment_rate'] },
      );
    },
  });
}
