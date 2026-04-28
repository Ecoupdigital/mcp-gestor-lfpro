import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({
  days_threshold: z.number().int().positive().max(365).optional().default(30),
  limit: z.number().int().positive().max(100).optional().default(30),
});

export function register(): void {
  registerTool({
    name: 'get_dead_inventory',
    area: 'products',
    description:
      'Produtos sem vendas nos ultimos N dias (default 30). Compara catalogo de produtos com aparece em line_items recentes. Como nao temos shopify_products separada, considera todos shopify_product_id que apareceram em algum order > 30 dias atras mas nao apareceram nos ultimos N dias.',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const cutoff = new Date(Date.now() - input.days_threshold * 86400_000).toISOString();
      // 1. Recent orders > cutoff
      const { data: recentOrders } = await sb
        .from('shopify_orders')
        .select('id')
        .gte('created_at', cutoff);
      const recentIds = (recentOrders ?? []).map((o: { id: number }) => o.id);
      const recentProducts = new Set<string>();
      for (let i = 0; i < recentIds.length; i += 500) {
        const chunk = recentIds.slice(i, i + 500);
        const { data: items } = await sb
          .from('shopify_line_items')
          .select('shopify_product_id')
          .in('order_id', chunk);
        for (const it of items ?? []) {
          if (it.shopify_product_id) recentProducts.add(it.shopify_product_id);
        }
      }
      // 2. Historic products: produtos que apareceram em line_items >= 365 dias atras
      // mas que sao excluidos da lista atual.
      // Optimizacao: limit do query historico — pega os ultimos 5000 line_items > cutoff_old ate cutoff
      const oldCutoff = new Date(
        Date.now() - 365 * 86400_000,
      ).toISOString();
      const { data: histItems } = await sb
        .from('shopify_line_items')
        .select('shopify_product_id, product_title')
        .gte('created_at', oldCutoff)
        .lte('created_at', cutoff)
        .limit(20000);
      const historicMap = new Map<string, string>();
      for (const it of histItems ?? []) {
        if (it.shopify_product_id && !historicMap.has(it.shopify_product_id)) {
          historicMap.set(it.shopify_product_id, it.product_title ?? '(unknown)');
        }
      }
      const dead: Array<{ shopify_product_id: string; title: string }> = [];
      for (const [id, title] of historicMap) {
        if (!recentProducts.has(id)) {
          dead.push({ shopify_product_id: id, title });
        }
      }
      return envelope({
        days_threshold: input.days_threshold,
        dead_products: dead.slice(0, input.limit),
        count_total_dead: dead.length,
        count_active_last_n_days: recentProducts.size,
        method: 'product_id presente em historico mas ausente nos ultimos N dias',
      });
    },
  });
}
