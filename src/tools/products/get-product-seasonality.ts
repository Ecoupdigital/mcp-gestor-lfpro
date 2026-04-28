import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope, notAvailable } from '../util.js';

const Input = z.object({
  shopify_product_id: z.string().min(1),
});

export function register(): void {
  registerTool({
    name: 'get_product_seasonality',
    area: 'products',
    description:
      'Sazonalidade de 1 produto: distribuicao de pedidos por mes do ano e dia da semana, ultimos 365d. Se historico < 90d, retorna not_available.',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const cutoff = new Date(Date.now() - 365 * 86400_000).toISOString();
      const { data: items, error } = await sb
        .from('shopify_line_items')
        .select('order_id, quantity, created_at')
        .eq('shopify_product_id', input.shopify_product_id)
        .gte('created_at', cutoff)
        .limit(50000);
      if (error) throw new Error(error.message);
      const records = items ?? [];
      if (records.length < 30) {
        return envelope(
          notAvailable(`historico insuficiente — ${records.length} line_items (minimo 30)`),
          { metric_definitions: ['product_velocity'] },
        );
      }
      const earliest = records.reduce(
        (m, r) => (m && new Date(r.created_at!) < m ? new Date(r.created_at!) : m ?? new Date(r.created_at!)),
        null as Date | null,
      );
      const daysOfHistory = earliest
        ? Math.ceil((Date.now() - earliest.getTime()) / 86400_000)
        : 0;
      if (daysOfHistory < 90) {
        return envelope(
          notAvailable(`historico insuficiente — ${daysOfHistory} dias (minimo 90)`),
          { metric_definitions: ['product_velocity'] },
        );
      }
      const byMonth = new Array(12).fill(0);
      const byDow = new Array(7).fill(0);
      for (const r of records) {
        if (!r.created_at) continue;
        const d = new Date(r.created_at);
        byMonth[d.getMonth()] += r.quantity ?? 0;
        byDow[d.getDay()] += r.quantity ?? 0;
      }
      const peakMonth = byMonth.indexOf(Math.max(...byMonth));
      const peakDow = byDow.indexOf(Math.max(...byDow));
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const dowNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
      return envelope(
        {
          shopify_product_id: input.shopify_product_id,
          days_of_history: daysOfHistory,
          line_items_analyzed: records.length,
          by_month: monthNames.map((m, i) => ({ month: m, volume: byMonth[i] })),
          by_dow: dowNames.map((d, i) => ({ dow: d, volume: byDow[i] })),
          peak_month: monthNames[peakMonth],
          peak_dow: dowNames[peakDow],
        },
        { metric_definitions: ['product_velocity'] },
      );
    },
  });
}
