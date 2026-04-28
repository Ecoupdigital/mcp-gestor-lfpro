import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({
  metric: z.enum(['revenue', 'orders_count', 'aov', 'spend_meta', 'spend_google', 'roas_unified']),
  period: PeriodPresetSchema.optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

const SENSITIVITY = { low: 3, medium: 2, high: 1.5 };

export function register(): void {
  registerTool({
    name: 'query_anomalies',
    area: 'cross',
    description:
      'Deteccao de anomalias z-score sobre serie temporal diaria de uma metrica. metric in (revenue, orders_count, aov, spend_meta, spend_google, roas_unified). sensitivity: low=3sigma, medium=2sigma, high=1.5sigma. Default sensitivity=medium. Periodo default ultimos 60d.',
    inputSchema: Input,
    handler: async (input) => {
      const period = input.period
        ? resolvePeriod(input.period)
        : resolvePeriod({ preset: 'last_60d' });
      const sb = getSupabase();
      const series = new Map<string, number>();
      if (input.metric === 'revenue' || input.metric === 'orders_count' || input.metric === 'aov') {
        const { data, error } = await sb
          .from('shopify_orders')
          .select('created_at, total_price')
          .gte('created_at', period.from)
          .lte('created_at', period.to + 'T23:59:59')
          .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
          .eq('test', false);
        if (error) throw new Error(error.message);
        const dailyRev = new Map<string, number>();
        const dailyCount = new Map<string, number>();
        for (const r of data ?? []) {
          if (!r.created_at) continue;
          const day = r.created_at.slice(0, 10);
          dailyRev.set(day, (dailyRev.get(day) ?? 0) + Number(r.total_price ?? 0));
          dailyCount.set(day, (dailyCount.get(day) ?? 0) + 1);
        }
        for (const [day, rev] of dailyRev) {
          if (input.metric === 'revenue') series.set(day, rev);
          else if (input.metric === 'orders_count') series.set(day, dailyCount.get(day) ?? 0);
          else if (input.metric === 'aov') {
            const c = dailyCount.get(day) ?? 0;
            series.set(day, c > 0 ? rev / c : 0);
          }
        }
      } else if (input.metric === 'spend_meta' || input.metric === 'spend_google' || input.metric === 'roas_unified') {
        if (input.metric === 'spend_meta' || input.metric === 'roas_unified') {
          const { data: m } = await sb
            .from('meta_ads_insights_daily')
            .select('date, spend_cents, conversion_value_cents')
            .gte('date', period.from)
            .lte('date', period.to);
          for (const r of m ?? []) {
            const day = r.date as string;
            const cur = series.get(day) ?? 0;
            const v = input.metric === 'spend_meta' ? Number(r.spend_cents ?? 0) / 100 : Number(r.spend_cents ?? 0);
            series.set(day, cur + v);
          }
        }
        if (input.metric === 'spend_google' || input.metric === 'roas_unified') {
          const { data: g } = await sb
            .from('google_ads_metrics_daily')
            .select('date, cost_cents, conversion_value_cents')
            .gte('date', period.from)
            .lte('date', period.to);
          if (input.metric === 'roas_unified') {
            // Series = total_value / total_spend per day
            const valueByDay = new Map<string, number>();
            // re-iterate meta to also track value
            const { data: m2 } = await sb
              .from('meta_ads_insights_daily')
              .select('date, conversion_value_cents')
              .gte('date', period.from)
              .lte('date', period.to);
            for (const r of m2 ?? []) {
              const d = r.date as string;
              valueByDay.set(d, (valueByDay.get(d) ?? 0) + Number(r.conversion_value_cents ?? 0));
            }
            for (const r of g ?? []) {
              const d = r.date as string;
              series.set(d, (series.get(d) ?? 0) + Number(r.cost_cents ?? 0));
              valueByDay.set(d, (valueByDay.get(d) ?? 0) + Number(r.conversion_value_cents ?? 0));
            }
            const newSeries = new Map<string, number>();
            for (const [d, spend] of series) {
              const v = valueByDay.get(d) ?? 0;
              newSeries.set(d, spend > 0 ? v / spend : 0);
            }
            series.clear();
            for (const [k, v] of newSeries) series.set(k, v);
          } else {
            for (const r of g ?? []) {
              const day = r.date as string;
              series.set(day, (series.get(day) ?? 0) + Number(r.cost_cents ?? 0) / 100);
            }
          }
        }
      } else {
        return envelope(notAvailable(`metric ${input.metric} not implemented`), { period });
      }

      const values = Array.from(series.values());
      if (values.length < 7) {
        return envelope(notAvailable(`historico insuficiente: ${values.length} dias (minimo 7)`), { period });
      }
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const threshold = SENSITIVITY[input.sensitivity];
      const anomalies: Array<{ date: string; value: number; z_score: number; direction: 'high' | 'low' }> = [];
      for (const [date, value] of series) {
        const z = std > 0 ? (value - mean) / std : 0;
        if (Math.abs(z) >= threshold) {
          anomalies.push({
            date,
            value: Math.round(value * 100) / 100,
            z_score: Math.round(z * 100) / 100,
            direction: z > 0 ? 'high' : 'low',
          });
        }
      }
      anomalies.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
      return envelope(
        {
          metric: input.metric,
          sensitivity: input.sensitivity,
          threshold_sigma: threshold,
          baseline_mean: Math.round(mean * 100) / 100,
          baseline_std: Math.round(std * 100) / 100,
          n_days: values.length,
          anomalies,
        },
        { period },
      );
    },
  });
}
