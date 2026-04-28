import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_conversion_rate',
    area: 'performance',
    description:
      'Taxa de conversao de sessoes para pedidos no periodo. Requer tabela sessions_by_region (Fase 06) — se nao disponivel, retorna not_available com reason.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data: sess, error: sErr } = await sb
        .from('sessions_by_region')
        .select('sessions')
        .gte('date', period.from)
        .lte('date', period.to);
      if (sErr) {
        return envelope(
          notAvailable(`tabela sessions_by_region indisponivel: ${sErr.message}`),
          { period, metric_definitions: ['conversion_rate'] },
        );
      }
      const totalSessions = (sess ?? []).reduce(
        (s: number, r: { sessions?: number | null }) => s + (r.sessions ?? 0),
        0,
      );
      const { count: ordersCount, error: oErr } = await sb
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (oErr) throw new Error(oErr.message);
      const orders = ordersCount ?? 0;
      const rate = totalSessions > 0 ? orders / totalSessions : 0;
      return envelope(
        {
          orders,
          sessions: totalSessions,
          rate_percent: Math.round(rate * 10000) / 100,
        },
        { period, metric_definitions: ['conversion_rate'] },
      );
    },
  });
}
