import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

interface ChannelAgg {
  spend_cents: number;
  conversions: number;
  conversion_value_cents: number;
  impressions: number;
  clicks: number;
}

export function register(): void {
  registerTool({
    name: 'get_roas_by_channel',
    area: 'traffic',
    description:
      'ROAS unificado Meta + Google no periodo. Lê meta_ads_insights_daily + google_ads_metrics_daily direto (service_role). Output: meta, google, total com spend_brl, conversions, conversion_value_brl, roas, ctr, cpa.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();

      const { data: metaRows, error: mErr } = await sb
        .from('meta_ads_insights_daily')
        .select('spend_cents, conversions, conversion_value_cents, impressions, clicks')
        .gte('date', period.from)
        .lte('date', period.to);
      if (mErr) throw new Error(mErr.message);

      const { data: googleRows, error: gErr } = await sb
        .from('google_ads_metrics_daily')
        .select('cost_cents, conversions, conversion_value_cents, impressions, clicks')
        .gte('date', period.from)
        .lte('date', period.to);
      if (gErr) throw new Error(gErr.message);

      const meta: ChannelAgg = {
        spend_cents: 0,
        conversions: 0,
        conversion_value_cents: 0,
        impressions: 0,
        clicks: 0,
      };
      for (const r of metaRows ?? []) {
        meta.spend_cents += Number(r.spend_cents ?? 0);
        meta.conversions += Number(r.conversions ?? 0);
        meta.conversion_value_cents += Number(r.conversion_value_cents ?? 0);
        meta.impressions += Number(r.impressions ?? 0);
        meta.clicks += Number(r.clicks ?? 0);
      }
      const google: ChannelAgg = {
        spend_cents: 0,
        conversions: 0,
        conversion_value_cents: 0,
        impressions: 0,
        clicks: 0,
      };
      for (const r of googleRows ?? []) {
        google.spend_cents += Number(r.cost_cents ?? 0);
        google.conversions += Number(r.conversions ?? 0);
        google.conversion_value_cents += Number(r.conversion_value_cents ?? 0);
        google.impressions += Number(r.impressions ?? 0);
        google.clicks += Number(r.clicks ?? 0);
      }

      function metrics(c: ChannelAgg): {
        spend_brl: number;
        conversions: number;
        conversion_value_brl: number;
        roas: number;
        ctr_percent: number;
        cpa_brl: number;
      } {
        return {
          spend_brl: Math.round(c.spend_cents) / 100,
          conversions: c.conversions,
          conversion_value_brl: Math.round(c.conversion_value_cents) / 100,
          roas: c.spend_cents > 0 ? Math.round((c.conversion_value_cents / c.spend_cents) * 100) / 100 : 0,
          ctr_percent: c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
          cpa_brl: c.conversions > 0 ? Math.round(c.spend_cents / c.conversions) / 100 : 0,
        };
      }

      const total: ChannelAgg = {
        spend_cents: meta.spend_cents + google.spend_cents,
        conversions: meta.conversions + google.conversions,
        conversion_value_cents: meta.conversion_value_cents + google.conversion_value_cents,
        impressions: meta.impressions + google.impressions,
        clicks: meta.clicks + google.clicks,
      };

      return envelope(
        {
          meta: metrics(meta),
          google: metrics(google),
          total: metrics(total),
        },
        { period, metric_definitions: ['roas', 'ctr', 'cpa'] },
      );
    },
  });
}
