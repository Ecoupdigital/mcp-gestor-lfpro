import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({
  period_atual: PeriodPresetSchema,
  period_baseline: PeriodPresetSchema,
});

async function fetchPeriod(sb: ReturnType<typeof import('../../supabase.js').getSupabase>, from: string, to: string): Promise<{ revenue: number; orders: number; sessions: number | null }> {
  const { data: orders, error } = await sb
    .from('shopify_orders')
    .select('total_price')
    .gte('created_at', from)
    .lte('created_at', to + 'T23:59:59')
    .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
    .eq('test', false);
  if (error) throw new Error(error.message);
  const revenue = (orders ?? []).reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const ordersCount = (orders ?? []).length;
  // sessions: opcional via sessions_by_region — se nao disponivel, decomposition vira null
  let sessions: number | null = null;
  const { data: sess, error: sErr } = await sb
    .from('sessions_by_region')
    .select('sessions')
    .gte('date', from)
    .lte('date', to);
  if (!sErr) {
    sessions = (sess ?? []).reduce((s: number, r: { sessions?: number | null }) => s + (r.sessions ?? 0), 0);
  }
  return { revenue, orders: ordersCount, sessions };
}

export function register(): void {
  registerTool({
    name: 'get_growth_decomposition',
    area: 'growth',
    description:
      'Decompoe mudanca de receita entre 2 periodos em 3 fatores: traffic, conversao, AOV. revenue = traffic * conv * AOV. Calculo log-based delta. Se sessions_by_region indisponivel, retorna apenas mudanca de orders e AOV (sem traffic component).',
    inputSchema: Input,
    handler: async (input) => {
      const periodA = resolvePeriod(input.period_atual);
      const periodB = resolvePeriod(input.period_baseline);
      const sb = getSupabase();
      const a = await fetchPeriod(sb, periodA.from, periodA.to);
      const b = await fetchPeriod(sb, periodB.from, periodB.to);
      const revPctChange = b.revenue > 0 ? (a.revenue - b.revenue) / b.revenue : 0;
      const ordersPctChange = b.orders > 0 ? (a.orders - b.orders) / b.orders : 0;
      const aovA = a.orders > 0 ? a.revenue / a.orders : 0;
      const aovB = b.orders > 0 ? b.revenue / b.orders : 0;
      const aovPctChange = aovB > 0 ? (aovA - aovB) / aovB : 0;
      if (a.sessions == null || b.sessions == null) {
        return envelope(
          notAvailable(
            'sessions_by_region indisponivel — retornando apenas orders + AOV decomposition (sem traffic). Use get_orders_count + get_aov para detalhe.',
          ),
          { period: periodA },
        );
      }
      const convA = a.sessions > 0 ? a.orders / a.sessions : 0;
      const convB = b.sessions > 0 ? b.orders / b.sessions : 0;
      const trafficPctChange = b.sessions > 0 ? (a.sessions - b.sessions) / b.sessions : 0;
      const convPctChange = convB > 0 ? (convA - convB) / convB : 0;
      // Log decomposition: ln(rev_a / rev_b) = ln(traf_a/traf_b) + ln(conv_a/conv_b) + ln(aov_a/aov_b)
      const lnRev = a.revenue > 0 && b.revenue > 0 ? Math.log(a.revenue / b.revenue) : 0;
      const lnTraf = a.sessions > 0 && b.sessions > 0 ? Math.log(a.sessions / b.sessions) : 0;
      const lnConv = convA > 0 && convB > 0 ? Math.log(convA / convB) : 0;
      const lnAov = aovA > 0 && aovB > 0 ? Math.log(aovA / aovB) : 0;
      const trafficContrib = lnRev !== 0 ? (lnTraf / lnRev) * 100 : 0;
      const convContrib = lnRev !== 0 ? (lnConv / lnRev) * 100 : 0;
      const aovContrib = lnRev !== 0 ? (lnAov / lnRev) * 100 : 0;
      return envelope(
        {
          revenue_change_percent: Math.round(revPctChange * 10000) / 100,
          orders_change_percent: Math.round(ordersPctChange * 10000) / 100,
          aov_change_percent: Math.round(aovPctChange * 10000) / 100,
          traffic_change_percent: Math.round(trafficPctChange * 10000) / 100,
          conv_change_percent: Math.round(convPctChange * 10000) / 100,
          decomposition: {
            traffic_contribution_pp: Math.round(trafficContrib * 100) / 100,
            conv_contribution_pp: Math.round(convContrib * 100) / 100,
            aov_contribution_pp: Math.round(aovContrib * 100) / 100,
          },
          period_atual: { revenue_brl: Math.round(a.revenue * 100) / 100, orders: a.orders, sessions: a.sessions },
          period_baseline: { revenue_brl: Math.round(b.revenue * 100) / 100, orders: b.orders, sessions: b.sessions },
        },
        { period: periodA },
      );
    },
  });
}
