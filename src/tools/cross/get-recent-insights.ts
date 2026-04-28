import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({
  category: z
    .enum(['anomaly', 'customer', 'time', 'performance', 'cro', 'crm', 'growth', 'regional', 'products', 'traffic'])
    .optional(),
  limit: z.number().int().positive().max(50).optional().default(10),
  days_back: z.number().int().positive().max(90).optional().default(7),
});

export function register(): void {
  registerTool({
    name: 'get_recent_insights',
    area: 'cross',
    description:
      'Lista insights gerados recentemente (memoria curta cross-runs). Util para o agente nao spammar mesmo finding. Param category filtra; days_back default 7 (max 90); limit default 10. Inclui categorias antigas (Fase 29: anomaly/customer/time) e novas (Fase 30: performance/cro/crm/growth/regional/products/traffic).',
    inputSchema: Input,
    handler: async (input) => {
      const sb = getSupabase();
      const cutoff = new Date(Date.now() - input.days_back * 86400_000).toISOString();
      let q = sb
        .from('insights')
        .select('id, category, title, severity, generated_at, hash_dedup, run_id')
        .gte('generated_at', cutoff)
        .order('generated_at', { ascending: false })
        .limit(input.limit);
      if (input.category) {
        q = q.eq('category', input.category);
      }
      const { data, error } = await q;
      if (error) {
        // tabela pode nao ter rows ainda em desenvolvimento — apenas retorna lista vazia
        return envelope({ insights: [], count: 0, error: error.message });
      }
      return envelope({
        insights: data ?? [],
        count: (data ?? []).length,
        days_back: input.days_back,
        category: input.category ?? 'all',
      });
    },
  });
}
