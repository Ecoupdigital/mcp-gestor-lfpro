import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope, notAvailable } from '../util.js';

const Input = z.object({
  metric: z.enum(['revenue', 'orders']),
  days_ahead: z.number().int().positive().max(30).optional().default(7),
});

export function register(): void {
  registerTool({
    name: 'forecast_simple',
    area: 'cross',
    description:
      'Linear regression sobre ultimos 30 dias para projetar metric os proximos N dias. Anti-hallucination: retorna confidence=low se days_ahead>14 ou serie<14 pontos. Apenas indicativo, nao precisao real.',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const today = new Date();
      const from = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);
      const { data, error } = await sb
        .from('shopify_orders')
        .select('created_at, total_price')
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (error) throw new Error(error.message);
      const series = new Map<string, number>();
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        if (!r.created_at) continue;
        const d = r.created_at.slice(0, 10);
        series.set(d, (series.get(d) ?? 0) + Number(r.total_price ?? 0));
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      const days = Array.from(series.keys()).sort();
      if (days.length < 14) {
        return envelope(
          notAvailable(`historico insuficiente: ${days.length} dias (minimo 14)`),
        );
      }
      const xs: number[] = [];
      const ys: number[] = [];
      days.forEach((d, i) => {
        xs.push(i);
        ys.push(input.metric === 'revenue' ? series.get(d) ?? 0 : counts.get(d) ?? 0);
      });
      const n = xs.length;
      const meanX = xs.reduce((s, v) => s + v, 0) / n;
      const meanY = ys.reduce((s, v) => s + v, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i]! - meanX) * (ys[i]! - meanY);
        den += (xs[i]! - meanX) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      const intercept = meanY - slope * meanX;
      const forecast: Array<{ date: string; value: number }> = [];
      for (let i = 0; i < input.days_ahead; i++) {
        const futureX = n + i;
        const fy = slope * futureX + intercept;
        const futureDate = new Date(today.getTime() + (i + 1) * 86400_000)
          .toISOString()
          .slice(0, 10);
        forecast.push({
          date: futureDate,
          value: input.metric === 'revenue' ? Math.round(fy * 100) / 100 : Math.round(fy),
        });
      }
      let confidence: 'low' | 'medium' | 'high' = 'medium';
      if (input.days_ahead > 14) confidence = 'low';
      if (n < 14) confidence = 'low';
      // Compute R^2 simples para subir confidence se modelo bom
      let ssRes = 0;
      let ssTot = 0;
      for (let i = 0; i < n; i++) {
        const pred = slope * xs[i]! + intercept;
        ssRes += (ys[i]! - pred) ** 2;
        ssTot += (ys[i]! - meanY) ** 2;
      }
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      if (r2 > 0.7 && input.days_ahead <= 7) confidence = 'high';
      return envelope({
        metric: input.metric,
        method: 'linear_regression',
        baseline_days: n,
        slope: Math.round(slope * 100) / 100,
        r_squared: Math.round(r2 * 1000) / 1000,
        confidence,
        forecast,
      });
    },
  });
}
