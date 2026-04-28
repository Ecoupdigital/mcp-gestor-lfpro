import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_funnel_metrics',
    area: 'cro',
    description:
      'Funil de conversao no periodo. Tenta sessions_by_region (sessoes, pages_viewed, bounces) + shopify_orders. Se falta event tracking detalhado de checkout/cart, retorna fields como null.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data: sess, error: sErr } = await sb
        .from('sessions_by_region')
        .select('sessions, pages_viewed, bounces')
        .gte('date', period.from)
        .lte('date', period.to);
      if (sErr) {
        return envelope(notAvailable(`sessions_by_region: ${sErr.message}`), {
          period,
        });
      }
      const totalSessions = (sess ?? []).reduce(
        (s: number, r: { sessions?: number | null }) => s + (r.sessions ?? 0),
        0,
      );
      const totalPages = (sess ?? []).reduce(
        (s: number, r: { pages_viewed?: number | null }) => s + (r.pages_viewed ?? 0),
        0,
      );
      const totalBounces = (sess ?? []).reduce(
        (s: number, r: { bounces?: number | null }) => s + (r.bounces ?? 0),
        0,
      );
      const { count: ordersPaid, error: oErr } = await sb
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (oErr) throw new Error(oErr.message);
      return envelope(
        {
          landing_views: totalSessions,
          pages_viewed: totalPages,
          bounces: totalBounces,
          // event tracking ainda nao implementado; retornar null sinaliza ao agente
          product_views: null,
          add_to_cart: null,
          checkout_started: null,
          orders_paid: ordersPaid ?? 0,
          dropoff_per_step: null,
          note: 'Cart/checkout events nao tracked nesta fase — apenas landing + orders.',
        },
        { period, metric_definitions: ['cart_abandonment_rate'] },
      );
    },
  });
}
