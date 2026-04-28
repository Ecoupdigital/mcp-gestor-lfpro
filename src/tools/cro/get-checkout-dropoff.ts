import { z } from 'zod';
import { registerTool } from '../registry.js';
import { envelope, notAvailable, PeriodPresetSchema, resolvePeriod } from '../util.js';

const Input = z.object({ period: PeriodPresetSchema });

export function register(): void {
  registerTool({
    name: 'get_checkout_dropoff',
    area: 'cro',
    description:
      'Dropoff entre etapas do checkout (cart -> address -> shipping -> payment -> placed). Requer event tracking detalhado, ainda nao implementado nesta fase.',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      return envelope(
        notAvailable(
          'event tracking de etapas de checkout nao implementado nesta fase — esperado em fase posterior (CRO instrumentation)',
        ),
        { period },
      );
    },
  });
}
