import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_spend_efficiency',
    area: 'traffic',
    description:
      'CPM, CPC, CPA per channel (meta + google) no periodo. Lê meta_ads_insights_daily + google_ads_metrics_daily.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data: metaRows } = await sb
        .from('meta_ads_insights_daily')
        .select('spend_cents, impressions, clicks, conversions')
        .gte('date', period.from)
        .lte('date', period.to);
      const { data: googleRows } = await sb
        .from('google_ads_metrics_daily')
        .select('cost_cents, impressions, clicks, conversions')
        .gte('date', period.from)
        .lte('date', period.to);
      function aggregate(
        rows: Array<{
          spend_cents?: number | null;
          cost_cents?: number | null;
          impressions?: number | null;
          clicks?: number | null;
          conversions?: number | null;
        }>,
        spendField: 'spend_cents' | 'cost_cents',
      ): { spend: number; impr: number; clicks: number; conversions: number } {
        let spend = 0;
        let impr = 0;
        let clicks = 0;
        let conv = 0;
        for (const r of rows) {
          spend += Number(r[spendField] ?? 0);
          impr += Number(r.impressions ?? 0);
          clicks += Number(r.clicks ?? 0);
          conv += Number(r.conversions ?? 0);
        }
        return { spend, impr, clicks, conversions: conv };
      }
      const meta = aggregate(metaRows ?? [], 'spend_cents');
      const google = aggregate(googleRows ?? [], 'cost_cents');
      function metrics(a: { spend: number; impr: number; clicks: number; conversions: number }): {
        spend_brl: number;
        cpm_brl: number;
        cpc_brl: number;
        cpa_brl: number;
      } {
        return {
          spend_brl: Math.round(a.spend) / 100,
          cpm_brl: a.impr > 0 ? Math.round((a.spend / a.impr) * 1000) / 100 : 0,
          cpc_brl: a.clicks > 0 ? Math.round(a.spend / a.clicks) / 100 : 0,
          cpa_brl: a.conversions > 0 ? Math.round(a.spend / a.conversions) / 100 : 0,
        };
      }
      return envelope(
        {
          meta: metrics(meta),
          google: metrics(google),
          unified: metrics({
            spend: meta.spend + google.spend,
            impr: meta.impr + google.impr,
            clicks: meta.clicks + google.clicks,
            conversions: meta.conversions + google.conversions,
          }),
        },
        { period, metric_definitions: ['cpm', 'cpc', 'cpa'] },
      );
    },
  });
}
