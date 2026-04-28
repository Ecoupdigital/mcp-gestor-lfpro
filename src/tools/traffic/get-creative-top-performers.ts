import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n: z.number().int().positive().max(20).optional().default(5),
  channel: z.enum(['meta', 'google', 'all']).optional().default('all'),
});

export function register(): void {
  registerTool({
    name: 'get_creative_top_performers',
    area: 'traffic',
    description:
      'Top N ads (creatives) por ROAS no periodo. Lê meta_ads_insights_daily + google_ads_metrics_daily. APENAS sinaliza, nao recomenda acao (lição traffic-auditor: so investiga). Output: ad_id, ad_name, channel, roas, spend_brl, conversions.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const items: Array<{
        ad_id: string;
        ad_name: string;
        channel: 'meta' | 'google';
        spend_cents: number;
        conversion_value_cents: number;
        conversions: number;
      }> = [];

      if (input.channel === 'meta' || input.channel === 'all') {
        const { data: metaInsights, error } = await sb
          .from('meta_ads_insights_daily')
          .select('ad_id, spend_cents, conversion_value_cents, conversions')
          .gte('date', period.from)
          .lte('date', period.to);
        if (error) throw new Error(error.message);
        const agg = new Map<string, { spend: number; value: number; conv: number }>();
        for (const r of metaInsights ?? []) {
          const cur = agg.get(r.ad_id ?? '') ?? { spend: 0, value: 0, conv: 0 };
          cur.spend += Number(r.spend_cents ?? 0);
          cur.value += Number(r.conversion_value_cents ?? 0);
          cur.conv += Number(r.conversions ?? 0);
          agg.set(r.ad_id ?? '', cur);
        }
        const adIds = Array.from(agg.keys()).filter((k) => k);
        const namesMap = new Map<string, string>();
        for (let i = 0; i < adIds.length; i += 500) {
          const chunk = adIds.slice(i, i + 500);
          const { data: ads } = await sb.from('meta_ads').select('meta_id, name').in('meta_id', chunk);
          for (const a of ads ?? []) {
            namesMap.set(a.meta_id ?? '', a.name ?? '(unknown)');
          }
        }
        for (const [ad_id, v] of agg) {
          if (!ad_id) continue;
          items.push({
            ad_id,
            ad_name: namesMap.get(ad_id) ?? '(unknown)',
            channel: 'meta',
            spend_cents: v.spend,
            conversion_value_cents: v.value,
            conversions: v.conv,
          });
        }
      }
      if (input.channel === 'google' || input.channel === 'all') {
        const { data: googleMetrics, error } = await sb
          .from('google_ads_metrics_daily')
          .select('ad_id, cost_cents, conversion_value_cents, conversions')
          .gte('date', period.from)
          .lte('date', period.to);
        if (error) throw new Error(error.message);
        const agg = new Map<string, { spend: number; value: number; conv: number }>();
        for (const r of googleMetrics ?? []) {
          const cur = agg.get(r.ad_id ?? '') ?? { spend: 0, value: 0, conv: 0 };
          cur.spend += Number(r.cost_cents ?? 0);
          cur.value += Number(r.conversion_value_cents ?? 0);
          cur.conv += Number(r.conversions ?? 0);
          agg.set(r.ad_id ?? '', cur);
        }
        const adIds = Array.from(agg.keys()).filter((k) => k);
        const namesMap = new Map<string, string>();
        for (let i = 0; i < adIds.length; i += 500) {
          const chunk = adIds.slice(i, i + 500);
          const { data: ads } = await sb
            .from('google_ads_entities')
            .select('meta_id, name')
            .in('meta_id', chunk);
          for (const a of ads ?? []) {
            namesMap.set(a.meta_id ?? '', a.name ?? '(unknown)');
          }
        }
        for (const [ad_id, v] of agg) {
          if (!ad_id) continue;
          items.push({
            ad_id,
            ad_name: namesMap.get(ad_id) ?? '(unknown)',
            channel: 'google',
            spend_cents: v.spend,
            conversion_value_cents: v.value,
            conversions: v.conv,
          });
        }
      }

      const ranked = items
        .filter((it) => it.spend_cents > 0)
        .map((it) => ({
          ad_id: it.ad_id,
          ad_name: it.ad_name,
          channel: it.channel,
          spend_brl: Math.round(it.spend_cents) / 100,
          conversion_value_brl: Math.round(it.conversion_value_cents) / 100,
          conversions: it.conversions,
          roas: Math.round((it.conversion_value_cents / it.spend_cents) * 100) / 100,
        }))
        .sort((a, b) => b.roas - a.roas)
        .slice(0, input.top_n);

      return envelope(
        { ads: ranked, channel: input.channel },
        { period, metric_definitions: ['roas'] },
      );
    },
  });
}
