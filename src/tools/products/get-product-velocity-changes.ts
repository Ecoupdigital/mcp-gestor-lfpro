import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period_atual: PeriodPresetSchema,
  period_baseline: PeriodPresetSchema,
  top_n: z.number().int().positive().max(20).optional().default(10),
});

async function aggregateProducts(
  sb: ReturnType<typeof import('../../supabase.js').getSupabase>,
  from: string,
  to: string,
): Promise<{ velocity: Map<string, { title: string; days: number; volume: number }>; days: number }> {
  const { data: orders, error: oErr } = await sb
    .from('shopify_orders')
    .select('id')
    .gte('created_at', from)
    .lte('created_at', to + 'T23:59:59')
    .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
    .eq('test', false);
  if (oErr) throw new Error(oErr.message);
  const orderIds = (orders ?? []).map((o: { id: number }) => o.id);
  const days = Math.max(
    1,
    Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400_000) + 1,
  );
  const agg = new Map<string, { title: string; days: number; volume: number }>();
  for (let i = 0; i < orderIds.length; i += 500) {
    const chunk = orderIds.slice(i, i + 500);
    const { data: items, error } = await sb
      .from('shopify_line_items')
      .select('shopify_product_id, product_title, quantity')
      .in('order_id', chunk);
    if (error) throw new Error(error.message);
    for (const it of items ?? []) {
      const key = it.shopify_product_id ?? '(none)';
      const cur = agg.get(key) ?? { title: it.product_title ?? '(unknown)', days, volume: 0 };
      cur.volume += it.quantity ?? 0;
      agg.set(key, cur);
    }
  }
  return { velocity: agg, days };
}

export function register(): void {
  registerTool({
    name: 'get_product_velocity_changes',
    area: 'products',
    description:
      'Compara velocity (volume/dia) de produtos entre 2 periodos. Output: top accelerating + top decelerating ordenados por delta_velocity.',
    inputSchema: Input,
    handler: async (input) => {
      const periodA = resolvePeriod(input.period_atual);
      const periodB = resolvePeriod(input.period_baseline);
      const sb = getSupabase();
      const [a, b] = await Promise.all([
        aggregateProducts(sb, periodA.from, periodA.to),
        aggregateProducts(sb, periodB.from, periodB.to),
      ]);
      const allProducts = new Set<string>([...a.velocity.keys(), ...b.velocity.keys()]);
      const changes: Array<{
        shopify_product_id: string;
        title: string;
        velocity_atual: number;
        velocity_baseline: number;
        delta: number;
        delta_percent: number;
      }> = [];
      for (const p of allProducts) {
        const va = a.velocity.get(p);
        const vb = b.velocity.get(p);
        const velA = va ? va.volume / a.days : 0;
        const velB = vb ? vb.volume / b.days : 0;
        const delta = velA - velB;
        const deltaPct = velB > 0 ? (delta / velB) * 100 : velA > 0 ? 100 : 0;
        changes.push({
          shopify_product_id: p,
          title: va?.title ?? vb?.title ?? '(unknown)',
          velocity_atual: Math.round(velA * 100) / 100,
          velocity_baseline: Math.round(velB * 100) / 100,
          delta: Math.round(delta * 100) / 100,
          delta_percent: Math.round(deltaPct * 100) / 100,
        });
      }
      const accelerating = [...changes].sort((a, b) => b.delta - a.delta).slice(0, input.top_n);
      const decelerating = [...changes].sort((a, b) => a.delta - b.delta).slice(0, input.top_n);
      return envelope(
        { accelerating, decelerating, period_atual_days: a.days, period_baseline_days: b.days },
        { period: periodA, metric_definitions: ['product_velocity'] },
      );
    },
  });
}
