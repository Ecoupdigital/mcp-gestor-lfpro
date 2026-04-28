import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period_atual: PeriodPresetSchema,
  period_baseline: PeriodPresetSchema,
});

async function aggregateByState(
  sb: ReturnType<typeof import('../../supabase.js').getSupabase>,
  from: string,
  to: string,
): Promise<{ shares: Map<string, number>; totalOrders: number; totalRevenue: number }> {
  const { data, error } = await sb
    .from('shopify_orders')
    .select('total_price, shipping_address:shopify_shipping_addresses!shipping_address_id(province_code)')
    .gte('created_at', from)
    .lte('created_at', to + 'T23:59:59')
    .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
    .eq('test', false);
  if (error) throw new Error(error.message);
  const revenueByState = new Map<string, number>();
  let totalRevenue = 0;
  let totalOrders = 0;
  for (const row of (data ?? []) as unknown as Array<{
    total_price: number | null;
    shipping_address?: { province_code?: string | null } | null;
  }>) {
    const code = row.shipping_address?.province_code ?? '(unknown)';
    const v = Number(row.total_price ?? 0);
    revenueByState.set(code, (revenueByState.get(code) ?? 0) + v);
    totalRevenue += v;
    totalOrders += 1;
  }
  const shares = new Map<string, number>();
  for (const [k, v] of revenueByState) {
    shares.set(k, totalRevenue > 0 ? v / totalRevenue : 0);
  }
  return { shares, totalOrders, totalRevenue };
}

export function register(): void {
  registerTool({
    name: 'get_region_share_shifts',
    area: 'regional',
    description:
      "Compara share por estado entre 2 periodos com normalizacao apples-to-apples (mesma fonte: shopify_orders pagos test=false, mesmo denominator: revenue total do proprio periodo). Output: shifts ordenados por |delta_pp| DESC + biggest_drop + biggest_gain.",
    inputSchema: Input,
    handler: async (input) => {
      const periodA = resolvePeriod(input.period_atual);
      const periodB = resolvePeriod(input.period_baseline);
      const sb = getSupabase();
      const [a, b] = await Promise.all([
        aggregateByState(sb, periodA.from, periodA.to),
        aggregateByState(sb, periodB.from, periodB.to),
      ]);
      const allStates = new Set<string>([...a.shares.keys(), ...b.shares.keys()]);
      const shifts = Array.from(allStates).map((province_code) => {
        const shareA = a.shares.get(province_code) ?? 0;
        const shareB = b.shares.get(province_code) ?? 0;
        return {
          province_code,
          share_atual_percent: Math.round(shareA * 10000) / 100,
          share_baseline_percent: Math.round(shareB * 10000) / 100,
          delta_pp: Math.round((shareA - shareB) * 10000) / 100,
        };
      });
      shifts.sort((a, b) => Math.abs(b.delta_pp) - Math.abs(a.delta_pp));
      const sortedDesc = [...shifts].sort((a, b) => b.delta_pp - a.delta_pp);
      const biggestGain = sortedDesc[0] ?? null;
      const biggestDrop = sortedDesc[sortedDesc.length - 1] ?? null;
      return envelope(
        {
          shifts,
          biggest_gain: biggestGain,
          biggest_drop: biggestDrop,
          period_atual: { ...periodA, total_orders: a.totalOrders, total_revenue_brl: Math.round(a.totalRevenue * 100) / 100 },
          period_baseline: { ...periodB, total_orders: b.totalOrders, total_revenue_brl: Math.round(b.totalRevenue * 100) / 100 },
          method: 'apples-to-apples — share = revenue_state / revenue_total_periodo (mesmo numerador e denominator entre os 2 periodos)',
        },
        { period: periodA, metric_definitions: ['region_share'] },
      );
    },
  });
}
