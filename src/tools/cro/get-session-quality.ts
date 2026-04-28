import { z } from 'zod';
import { registerTool } from '../registry.js';
import { getSupabase } from '../../supabase.js';
import { PeriodPresetSchema, resolvePeriod, envelope, notAvailable } from '../util.js';

const Input = z.object({
  period: PeriodPresetSchema,
  by: z.enum(['device', 'region', 'none']).optional().default('none'),
});

export function register(): void {
  registerTool({
    name: 'get_session_quality',
    area: 'cro',
    description:
      'Qualidade de sessoes: bounce_rate, pages_per_session. Param by=region agrupa por estado. Requer sessions_by_region (Fase 06).',
    inputSchema: Input,
    handler: async (input) => {
      const period = resolvePeriod(input.period);
      const sb = getSupabase();
      const cols = input.by === 'region' ? 'province, sessions, pages_viewed, bounces' : 'sessions, pages_viewed, bounces';
      const { data, error } = await sb
        .from('sessions_by_region')
        .select(cols)
        .gte('date', period.from)
        .lte('date', period.to);
      if (error) {
        return envelope(notAvailable(`sessions_by_region: ${error.message}`), {
          period,
          metric_definitions: ['bounce_rate', 'pages_per_session'],
        });
      }
      const rows = (data ?? []) as Array<{
        province?: string | null;
        sessions?: number | null;
        pages_viewed?: number | null;
        bounces?: number | null;
      }>;
      if (input.by === 'region') {
        const byProv = new Map<string, { sessions: number; pages: number; bounces: number }>();
        for (const r of rows) {
          const key = r.province ?? 'unknown';
          const cur = byProv.get(key) ?? { sessions: 0, pages: 0, bounces: 0 };
          cur.sessions += r.sessions ?? 0;
          cur.pages += r.pages_viewed ?? 0;
          cur.bounces += r.bounces ?? 0;
          byProv.set(key, cur);
        }
        const breakdown = Array.from(byProv.entries()).map(([province, v]) => ({
          province,
          sessions: v.sessions,
          bounce_rate_percent: v.sessions > 0 ? Math.round((v.bounces / v.sessions) * 10000) / 100 : 0,
          pages_per_session: v.sessions > 0 ? Math.round((v.pages / v.sessions) * 100) / 100 : 0,
        }));
        return envelope({ breakdown_by: 'region', breakdown }, { period });
      }
      const totalSessions = rows.reduce((s, r) => s + (r.sessions ?? 0), 0);
      const totalPages = rows.reduce((s, r) => s + (r.pages_viewed ?? 0), 0);
      const totalBounces = rows.reduce((s, r) => s + (r.bounces ?? 0), 0);
      return envelope(
        {
          sessions: totalSessions,
          bounce_rate_percent: totalSessions > 0 ? Math.round((totalBounces / totalSessions) * 10000) / 100 : 0,
          pages_per_session: totalSessions > 0 ? Math.round((totalPages / totalSessions) * 100) / 100 : 0,
        },
        { period, metric_definitions: ['bounce_rate', 'pages_per_session'] },
      );
    },
  });
}
