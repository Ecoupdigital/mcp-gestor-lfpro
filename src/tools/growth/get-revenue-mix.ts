import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  dimension: z.enum(['channel', 'utm_source', 'utm_medium', 'utm_campaign', 'segment']),
});

export function register(): void {
  registerTool({
    name: 'get_revenue_mix',
    area: 'growth',
    description:
      "Mix de receita por dimensao. dimension='channel' usa shopify_orders.source_name. utm_* usa colunas utm_*. segment requer JOIN com shopify_customers.rfm_segment. Output ordenado por revenue DESC.",
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      let selectCols = 'total_price';
      let groupKey: string;
      if (input.dimension === 'channel') {
        selectCols = 'total_price, source_name, channel_name';
        groupKey = 'source_name';
      } else if (input.dimension === 'utm_source') {
        selectCols = 'total_price, utm_source';
        groupKey = 'utm_source';
      } else if (input.dimension === 'utm_medium') {
        selectCols = 'total_price, utm_medium';
        groupKey = 'utm_medium';
      } else if (input.dimension === 'utm_campaign') {
        selectCols = 'total_price, utm_campaign';
        groupKey = 'utm_campaign';
      } else {
        selectCols = 'total_price, customer_id, shopify_customers!inner(rfm_segment)';
        groupKey = 'rfm_segment';
      }
      const query = sb
        .from('shopify_orders')
        .select(selectCols)
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const counts = new Map<string, { revenue: number; orders: number }>();
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        let key: string;
        if (groupKey === 'rfm_segment') {
          const rel = row['shopify_customers'] as { rfm_segment?: string } | undefined;
          key = rel?.rfm_segment ?? '(none)';
        } else {
          key = (row[groupKey] as string | null) ?? '(none)';
        }
        const cur = counts.get(key) ?? { revenue: 0, orders: 0 };
        cur.revenue += Number((row.total_price as number | null) ?? 0);
        cur.orders += 1;
        counts.set(key, cur);
      }
      const total = Array.from(counts.values()).reduce((s, v) => s + v.revenue, 0);
      const mix = Array.from(counts.entries())
        .map(([key, v]) => ({
          key,
          revenue_brl: Math.round(v.revenue * 100) / 100,
          orders: v.orders,
          share_percent: total > 0 ? Math.round((v.revenue / total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.revenue_brl - a.revenue_brl);
      return envelope(
        {
          dimension: input.dimension,
          mix,
          total_revenue_brl: Math.round(total * 100) / 100,
          total_orders: (data ?? []).length,
        },
        { period },
      );
    },
  });
}
