import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

const Input = z.object({});

export function register(): void {
  registerTool({
    name: 'get_rfm_distribution',
    area: 'crm',
    description:
      'Distribuicao atual de clientes por rfm_segment. Le shopify_customers (Fase 04 RFM populou rfm_segment direto na tabela). Retorna contagem por segmento + percentage + total.',
    inputSchema: Input,
    handler: async () => {
      const sb = getSupabase();
      // Fetch all rfm_segment values; pode ser muitos clientes mas Supabase suporta
      const { data, error } = await sb
        .from('shopify_customers')
        .select('rfm_segment')
        .not('rfm_segment', 'is', null);
      if (error) throw new Error(error.message);
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const seg = r.rfm_segment ?? 'unknown';
        counts.set(seg, (counts.get(seg) ?? 0) + 1);
      }
      const total = (data ?? []).length;
      const segments: Record<string, { count: number; percent: number }> = {};
      for (const [seg, count] of counts) {
        segments[seg] = {
          count,
          percent: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
        };
      }
      return envelope({ segments, total }, { metric_definitions: ['rfm_distribution'] });
    },
  });
}
