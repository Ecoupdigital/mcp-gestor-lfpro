import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  top_n_pairs: z.number().int().positive().max(50).optional().default(10),
  max_basket_size: z.number().int().positive().max(20).optional().default(10),
});

export function register(): void {
  registerTool({
    name: 'get_basket_analysis',
    area: 'products',
    description:
      'Frequent itemset analysis (pares) — produtos que aparecem juntos no mesmo pedido. Limit basket_size <= 10 (default) pra performance. Output: top_pairs com co_occurrence_count + lift simples.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
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
        return envelope({ pairs: [], total_orders: 0 }, { period });
      }
      // Build basket -> products array per order
      type Basket = { ids: string[]; titles: Map<string, string> };
      const baskets = new Map<number, Basket>();
      for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        const { data: items, error } = await sb
          .from('shopify_line_items')
          .select('order_id, shopify_product_id, product_title')
          .in('order_id', chunk);
        if (error) throw new Error(error.message);
        for (const it of items ?? []) {
          if (!it.order_id || !it.shopify_product_id) continue;
          const cur: Basket = baskets.get(it.order_id) ?? { ids: [], titles: new Map<string, string>() };
          if (cur.ids.length < input.max_basket_size) {
            cur.ids.push(it.shopify_product_id);
            cur.titles.set(it.shopify_product_id, it.product_title ?? '(unknown)');
          }
          baskets.set(it.order_id, cur);
        }
      }
      const productCount = new Map<string, number>();
      const pairCount = new Map<string, number>();
      const titles = new Map<string, string>();
      let totalBaskets = 0;
      for (const basket of baskets.values()) {
        totalBaskets++;
        const ids = Array.from(new Set(basket.ids));
        for (const id of ids) {
          productCount.set(id, (productCount.get(id) ?? 0) + 1);
          if (basket.titles.has(id)) titles.set(id, basket.titles.get(id)!);
        }
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i]!;
            const b = ids[j]!;
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
          }
        }
      }
      const pairs = Array.from(pairCount.entries())
        .map(([key, count]) => {
          const [a, b] = key.split('|');
          const supportA = (productCount.get(a!) ?? 0) / totalBaskets;
          const supportB = (productCount.get(b!) ?? 0) / totalBaskets;
          const supportAB = count / totalBaskets;
          const lift = supportA > 0 && supportB > 0 ? supportAB / (supportA * supportB) : 0;
          return {
            product_a: a,
            title_a: titles.get(a!) ?? '(unknown)',
            product_b: b,
            title_b: titles.get(b!) ?? '(unknown)',
            co_occurrence: count,
            support: Math.round(supportAB * 10000) / 10000,
            lift: Math.round(lift * 100) / 100,
          };
        })
        .sort((x, y) => y.co_occurrence - x.co_occurrence)
        .slice(0, input.top_n_pairs);
      return envelope(
        { pairs, total_baskets: totalBaskets, distinct_products: productCount.size },
        { period, metric_definitions: ['basket_size'] },
      );
    },
  });
}
