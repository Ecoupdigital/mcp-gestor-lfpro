import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  state: z.string().regex(/^[A-Z]{2}$/, 'province_code 2 letters uppercase ex: RS, SP, RJ'),
  period: PeriodPresetSchema,
  top_products_n: z.number().int().positive().max(20).optional().default(5),
});

export function register(): void {
  registerTool({
    name: 'get_state_performance',
    area: 'regional',
    description:
      'Drill-down de performance de 1 estado especifico no periodo. Output: orders, revenue, aov, top_products. Usa JOIN inline shopify_orders + shipping_address (otimizado para nao lookup gigante de address ids).',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      // JOIN inline filtrado: shopify_orders -> shipping_addresses WHERE province_code=X
      // PostgREST: !inner forca INNER JOIN; .eq filtra na tabela embed
      const { data, error } = await sb
        .from('shopify_orders')
        .select(
          'id, total_price, shipping_address:shopify_shipping_addresses!shipping_address_id!inner(province_code)',
        )
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59')
        .in('financial_status', ['PAID', 'PARTIALLY_PAID'])
        .eq('test', false)
        .eq('shipping_address.province_code', input.state);
      if (error) throw new Error(error.message);
      const orders = (data ?? []) as unknown as Array<{ id: number; total_price: number | null }>;
      const revenue = orders.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
      const aov = orders.length > 0 ? revenue / orders.length : 0;

      // Top products via line_items
      const orderIds = orders.map((o) => o.id);
      const productAgg = new Map<string, { title: string; qty: number; revenue: number }>();
      for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        if (chunk.length === 0) continue;
        const { data: items, error: liErr } = await sb
          .from('shopify_line_items')
          .select('shopify_product_id, product_title, quantity, price')
          .in('order_id', chunk);
        if (liErr) throw new Error(liErr.message);
        for (const it of items ?? []) {
          const key = it.shopify_product_id ?? '(none)';
          const cur = productAgg.get(key) ?? { title: it.product_title ?? '(unknown)', qty: 0, revenue: 0 };
          cur.qty += it.quantity ?? 0;
          cur.revenue += Number(it.price ?? 0) * (it.quantity ?? 0);
          productAgg.set(key, cur);
        }
      }
      const topProducts = Array.from(productAgg.entries())
        .map(([id, v]) => ({
          shopify_product_id: id,
          title: v.title,
          quantity: v.qty,
          revenue_brl: Math.round(v.revenue * 100) / 100,
        }))
        .sort((a, b) => b.revenue_brl - a.revenue_brl)
        .slice(0, input.top_products_n);

      return envelope(
        {
          state: input.state,
          orders: orders.length,
          revenue_brl: Math.round(revenue * 100) / 100,
          aov_brl: Math.round(aov * 100) / 100,
          top_products: topProducts,
        },
        { period, metric_definitions: ['region_share', 'aov'] },
      );
    },
  });
}
