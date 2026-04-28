import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  by: z.enum(['revenue', 'volume']).optional().default('revenue'),
  top_n: z.number().int().positive().max(50).optional().default(10),
});

export function register(): void {
  registerTool({
    name: 'get_top_products',
    area: 'products',
    description:
      'Top produtos por revenue ou volume no periodo. Le shopify_line_items JOIN orders pagos test=false. Output: products com title, sku, revenue_brl, volume.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      // 1. order_ids no periodo
      const { data: orders, error: oErr } = await sb
        .from('shopify_orders')
        .select('id')
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false);
      if (oErr) throw new Error(oErr.message);
      const orderIds = (orders ?? []).map((o: { id: number }) => o.id);
      if (orderIds.length === 0) {
        return envelope({ products: [], total_orders: 0 }, { period });
      }
      const productAgg = new Map<string, { title: string; sku: string; volume: number; revenue: number }>();
      for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        const { data: items, error } = await sb
          .from('shopify_line_items')
          .select('shopify_product_id, product_title, sku, quantity, price')
          .in('order_id', chunk);
        if (error) throw new Error(error.message);
        for (const it of items ?? []) {
          const key = it.shopify_product_id ?? '(none)';
          const cur = productAgg.get(key) ?? {
            title: it.product_title ?? '(unknown)',
            sku: it.sku ?? '',
            volume: 0,
            revenue: 0,
          };
          const qty = it.quantity ?? 0;
          cur.volume += qty;
          cur.revenue += Number(it.price ?? 0) * qty;
          productAgg.set(key, cur);
        }
      }
      const products = Array.from(productAgg.entries()).map(([id, v]) => ({
        shopify_product_id: id,
        title: v.title,
        sku: v.sku,
        volume: v.volume,
        revenue_brl: Math.round(v.revenue * 100) / 100,
      }));
      products.sort((a, b) =>
        input.by === 'volume' ? b.volume - a.volume : b.revenue_brl - a.revenue_brl,
      );
      return envelope(
        {
          products: products.slice(0, input.top_n),
          total_orders: orderIds.length,
          total_distinct_products: products.length,
          ordered_by: input.by,
        },
        { period, metric_definitions: ['product_velocity'] },
      );
    },
  });
}
