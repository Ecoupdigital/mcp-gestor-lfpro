import { z } from 'zod';
import { registerTool } from '../registry.js';
import { envelope, notAvailable } from '../util.js';

const Input = z.object({
  days_back: z.number().int().positive().max(365).optional().default(14),
});

export function register(): void {
  registerTool({
    name: 'get_rfm_shifts',
    area: 'crm',
    description:
      'Clientes que mudaram de rfm_segment entre snapshot atual e snapshot N dias atras. Requer customer_rfm_history com snapshots diarios — nao implementada nesta fase. Retorna not_available com fallback recomendado.',
    inputSchema: Input,
    handler: async (input) => {
      // customer_rfm_history nao existe em prod — Fase 30-03 pode adicionar.
      return envelope(
        notAvailable(
          `customer_rfm_history nao implementado. shopify_customers tem so snapshot atual de rfm_segment. Para detectar shifts, esperar Fase 30-03 criar tabela de snapshots ou usar Fase 29 customer detector como proxy. days_back=${input.days_back} ignorado.`,
        ),
        { metric_definitions: ['rfm_shifts'] },
      );
    },
  });
}
