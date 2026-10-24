import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { envelope } from '../util.js';

// Série mês a mês (ou semana a semana) do Tráfego ADS lida do MESMO snapshot
// que a aba "Evolução Mensal" do gestor (RPC get_trafego_series). Existe pra o
// relatório semanal e a tela mostrarem o mesmo MER, % ADS e CAC: horário de
// Brasília, pedido pago = PAID/PARTIALLY_PAID/PARTIALLY_REFUNDED (este pelo valor liquido), sem test.
// Fórmulas iguais a dashboard/lib/trafego-historico.ts (repo gestor-lfpro).

// Antes disso parte do gasto Meta está em contas que o token não enxerga.
const META_COMPLETE_SINCE = '2025-03-01';

const Input = z
  .object({
    grain: z.enum(['month', 'week']).default('month'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  })
  .refine((p) => !p.from || !p.to || p.from <= p.to, { message: 'from must be <= to' });

type Num = number | string | null;
interface RpcRow {
  period_start: string;
  period_end: string;
  days_covered: number;
  is_partial: boolean;
  meta_spend: Num;
  google_spend: Num;
  meta_purchases: Num;
  meta_purchase_value: Num;
  google_conversions: Num;
  google_conversion_value: Num;
  revenue: Num;
  orders: Num;
  new_customers: Num;
  first_order_revenue: Num;
  sessions: Num;
  sessions_days: number;
  unique_customers: Num;
  recurring_customers: Num;
  channels: Record<string, { orders?: Num; revenue?: Num; first_orders?: Num }>;
  meta_temp: Record<string, { spend?: Num; purchase_value?: Num }>;
}

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function register(): void {
  registerTool({
    name: 'get_trafego_serie',
    area: 'traffic',
    description:
      'Série histórica do Tráfego ADS (fonte oficial do relatório): por mês ou semana ISO, do snapshot do gestor (mesmos números da aba Evolução Mensal). ' +
      'Por período: faturamento Shopify, pedidos, ticket, gasto Meta/Google/total, MER (faturamento ÷ gasto), % ADS/fat, CAC, clientes novos/recorrentes, ' +
      'ROAS 1ª compra, CPA/ROAS de plataforma (diagnóstico), receita por canal pela UTM e gasto/ROAS por temperatura de público Meta. ' +
      'Marca is_partial (período em curso) e meta_coverage=parcial antes de mar/2025. Default: mês desde 2025-01-01, ou últimas 12 semanas.',
    inputSchema: Input,
    handler: async (input) => {
      const to = input.to ?? isoToday();
      const from = input.from ?? (input.grain === 'week' ? shiftDays(to, -7 * 12) : '2025-01-01');
      const sb = getSupabase();
      const { data, error } = await sb.rpc('get_trafego_series', { p_grain: input.grain, p_from: from, p_to: to });
      if (error) throw new Error(`get_trafego_series: ${error.message}`);
      const { data: run } = await sb
        .from('trafego_snapshot_runs')
        .select('status, finished_at, date_to')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const rows = ((data as RpcRow[] | null) ?? []).map((r) => {
        const metaSpend = n(r.meta_spend);
        const googleSpend = n(r.google_spend);
        const spend = metaSpend + googleSpend;
        const revenue = n(r.revenue);
        const orders = n(r.orders);
        const newCustomers = n(r.new_customers);
        const recurring = r.recurring_customers === null ? null : n(r.recurring_customers);
        const channels = Object.fromEntries(
          Object.entries(r.channels ?? {}).map(([k, v]) => [k, { orders: n(v.orders), revenue: r2(n(v.revenue)), first_orders: n(v.first_orders) }]),
        );
        const temps = Object.fromEntries(
          Object.entries(r.meta_temp ?? {}).map(([k, v]) => [k, { spend: r2(n(v.spend)), roas: r2(div(n(v.purchase_value), n(v.spend))) }]),
        );
        const metaRevenueUtm = n(r.channels?.meta?.revenue);
        return {
          period_start: r.period_start,
          period_end: r.period_end,
          is_partial: r.is_partial,
          days_covered: r.days_covered,
          meta_coverage: r.period_start < META_COMPLETE_SINCE ? 'parcial' : 'completa',
          revenue_brl: r2(revenue),
          orders,
          ticket_brl: r2(div(revenue, orders)),
          spend_meta_brl: r2(metaSpend),
          spend_google_brl: r2(googleSpend),
          spend_total_brl: r2(spend),
          mer: r2(div(revenue, spend)),
          pct_ads_revenue: r2((div(spend, revenue) ?? 0) * 100),
          cac_brl: r2(div(spend, newCustomers)),
          new_customers: newCustomers,
          recurring_customers: recurring,
          pct_recurring: recurring === null ? null : r2((div(recurring, newCustomers + recurring) ?? 0) * 100),
          first_order_revenue_brl: r2(n(r.first_order_revenue)),
          roas_first_order: r2(div(n(r.first_order_revenue), spend)),
          cpa_platform_brl: r2(div(spend, n(r.meta_purchases) + n(r.google_conversions))),
          roas_platform: r2(div(n(r.meta_purchase_value) + n(r.google_conversion_value), spend)),
          roas_meta_shopify_utm: r2(div(metaRevenueUtm, metaSpend)),
          sessions: r.sessions_days > 0 ? n(r.sessions) : null,
          channels_utm: channels,
          meta_audience: temps,
        };
      });

      return envelope(
        {
          grain: input.grain,
          from,
          to,
          snapshot: run ?? null,
          rows,
          notes: [
            'MER = faturamento Shopify ÷ gasto Meta+Google (régua oficial desde 24/09/2026).',
            'ROAS/CPA de plataforma e meta_audience.roas são diagnóstico (atribuição da própria rede).',
            'channels_utm vem da UTM do pedido e é piso: pedido sem UTM fica em sem_origem.',
            'Período is_partial: não compare totais com período cheio; compare razões.',
          ],
        },
        { period: { from, to }, metric_definitions: ['mer', 'cac', 'roas', 'cpa'] },
      );
    },
  });
}
