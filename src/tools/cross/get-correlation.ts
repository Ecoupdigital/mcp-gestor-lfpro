import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  metric_a: z.enum(['revenue', 'orders', 'spend_meta', 'spend_google']),
  metric_b: z.enum(['revenue', 'orders', 'spend_meta', 'spend_google']),
  period: PeriodPresetSchema,
});

async function dailySeries(
  sb: ReturnType<typeof import('../../supabase.js').getSupabase>,
  metric: 'revenue' | 'orders' | 'spend_meta' | 'spend_google',
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (metric === 'revenue' || metric === 'orders') {
    const { data } = await sb
      .from('shopify_orders')
      .select('created_at, total_price')
      .gte('created_at', from)
      .lte('created_at', to + 'T23:59:59')
      .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
      .eq('test', false);
    for (const r of data ?? []) {
      if (!r.created_at) continue;
      const d = r.created_at.slice(0, 10);
      const v = metric === 'revenue' ? Number(r.total_price ?? 0) : 1;
      out.set(d, (out.get(d) ?? 0) + v);
    }
  } else if (metric === 'spend_meta') {
    const { data } = await sb
      .from('meta_ads_insights_daily')
      .select('date, spend_cents')
      .gte('date', from)
      .lte('date', to);
    for (const r of data ?? []) {
      const d = r.date as string;
      out.set(d, (out.get(d) ?? 0) + Number(r.spend_cents ?? 0) / 100);
    }
  } else {
    const { data } = await sb
      .from('google_ads_metrics_daily')
      .select('date, cost_cents')
      .gte('date', from)
      .lte('date', to);
    for (const r of data ?? []) {
      const d = r.date as string;
      out.set(d, (out.get(d) ?? 0) + Number(r.cost_cents ?? 0) / 100);
    }
  }
  return out;
}

function pearson(xs: number[], ys: number[]): { r: number; n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { r: 0, n };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const r = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  return { r: Math.round(r * 1000) / 1000, n };
}

function interpret(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.7) return r > 0 ? 'strong_positive' : 'strong_negative';
  if (a >= 0.4) return r > 0 ? 'moderate_positive' : 'moderate_negative';
  if (a >= 0.2) return r > 0 ? 'weak_positive' : 'weak_negative';
  return 'no_correlation';
}

export function register(): void {
  registerTool({
    name: 'get_correlation',
    area: 'cross',
    description:
      'Pearson correlation entre 2 metricas no periodo (alinhadas por dia). metric_a + metric_b in (revenue, orders, spend_meta, spend_google). Output: r (-1..1), n_points, interpretation.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const [a, b] = await Promise.all([
        dailySeries(sb, input.metric_a, period.from, period.to),
        dailySeries(sb, input.metric_b, period.from, period.to),
      ]);
      const days = Array.from(new Set([...a.keys(), ...b.keys()])).sort();
      const xs: number[] = [];
      const ys: number[] = [];
      for (const d of days) {
        xs.push(a.get(d) ?? 0);
        ys.push(b.get(d) ?? 0);
      }
      const { r, n } = pearson(xs, ys);
      return envelope(
        {
          metric_a: input.metric_a,
          metric_b: input.metric_b,
          r,
          n_points: n,
          interpretation: interpret(r),
        },
        { period },
      );
    },
  });
}
