import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_attribution_summary',
    area: 'traffic',
    description:
      'Resumo de atribuicao Meta vs Google. Compara conversions vs all_conversions e view_through_conversions (Google). Para Meta, usa actions jsonb se houver. Output: simples, sem multi-touch attribution complexa.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const { data: googleRows } = await sb
        .from('google_ads_metrics_daily')
        .select('conversions, all_conversions, view_through_conversions')
        .gte('date', period.from)
        .lte('date', period.to);
      const { data: metaRows } = await sb
        .from('meta_ads_insights_daily')
        .select('conversions')
        .gte('date', period.from)
        .lte('date', period.to);
      let gConv = 0;
      let gAll = 0;
      let gView = 0;
      for (const r of googleRows ?? []) {
        gConv += Number(r.conversions ?? 0);
        gAll += Number(r.all_conversions ?? 0);
        gView += Number(r.view_through_conversions ?? 0);
      }
      let mConv = 0;
      for (const r of metaRows ?? []) {
        mConv += Number(r.conversions ?? 0);
      }
      const googleAssistRatio = gAll > 0 ? Math.round(((gAll - gConv) / gAll) * 10000) / 100 : 0;
      return envelope(
        {
          meta: { conversions: mConv },
          google: {
            conversions: gConv,
            all_conversions: gAll,
            view_through_conversions: gView,
            assist_ratio_percent: googleAssistRatio,
          },
          total_last_click: gConv + mConv,
          note: 'attribution_assist_ratio em metrics.yaml so disponivel para Google. Meta requer parsing de actions jsonb (TODO Fase futura).',
        },
        { period, metric_definitions: ['attribution_assist_ratio'] },
      );
    },
  });
}
