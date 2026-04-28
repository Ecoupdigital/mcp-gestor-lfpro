# mcp-gestor-lfpro

MCP server expondo **40 tools de e-commerce certificadas** ancoradas em
semantic layer (`config/metrics.yaml`). Usado pelo agente cognitivo do
gestor-lfpro (cron + Claude Code interativo).

Plano: `gestor-lfpro/.plano/fases/30-agente-cognitivo-de-e-commerce-com-mcp-server-7-skills-40-tools-certificadas/30-01-PLAN.md`

## Quickstart

```bash
cd /home/projects/mcp-gestor-lfpro
npm install
cp .env.example .env  # preencher SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
npm run build
```

## Modos de execucao

### 1. Stdio (Claude Code local)

```bash
claude mcp add gestor-lfpro --scope user -- node /home/projects/mcp-gestor-lfpro/dist/index.js
claude mcp list
# deve mostrar gestor-lfpro: connected
```

Apos reiniciar o Claude Code, as 40 tools ficam disponiveis. Exemplos
de prompts interativos:

- "Lista todas as tools do MCP server gestor-lfpro"
- "Chama get_revenue com period last_7d"
- "Como tah o RS hoje? get_state_performance state=RS period=last_7d"
- "Quem virou At Risk semana passada? get_at_risk_customers ltv_threshold=500"
- "ROAS Meta vs Google last_30d? get_roas_by_channel"

### 2. HTTP (edge function Deno do agente cognitivo)

```bash
node dist/index.js --http :3030
# Health: curl http://127.0.0.1:3030/health
# MCP endpoint: POST http://127.0.0.1:3030/mcp (Streamable HTTP transport)
```

### 3. Docker (Coolify VPS prod — config final em uso)

Coolify auto-deploy a partir de `https://github.com/Ecoupdigital/mcp-gestor-lfpro` (branch `main`).

**Setup one-time:**
```bash
# 1. Gerar token de auth
openssl rand -hex 32

# 2. Coolify dashboard → criar app:
#    - Project: gestor-lfpro
#    - Source: Public Repository
#    - Repo: https://github.com/Ecoupdigital/mcp-gestor-lfpro
#    - Branch: main
#    - Build pack: Dockerfile
#    - Ports exposed: 3030
#    - Domain: https://mcp-gestor-lfpro.ecoup.digital

# 3. Env vars no Coolify (NAO build-time, runtime only):
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MCP_AUTH_TOKEN,
#    MCP_HTTP_BIND=0.0.0.0, MCP_HTTP_PORT=3030, NODE_ENV=production

# 4. Healthcheck: path=/health, port=3030, return_code=200
#    (Dockerfile instala curl no runtime stage pra healthcheck shell)

# 5. Cloudflare DNS: A record mcp-gestor-lfpro.ecoup.digital → 178.104.117.59
#    (proxied=false pra Let's Encrypt issuar)

# 6. Deploy via API ou painel
```

**Local Docker (debug only):**
```bash
docker build -t mcp-gestor-lfpro:local .
docker run -d --name mcp-debug -p 3030:3030 \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e MCP_AUTH_TOKEN="$MCP_AUTH_TOKEN" \
  -e MCP_HTTP_BIND=0.0.0.0 \
  mcp-gestor-lfpro:local
```

## Hosting (final)

**Producao:** Coolify app na VPS prod `178.104.117.59`, expondo
`https://mcp-gestor-lfpro.ecoup.digital/mcp` via Traefik + Let's Encrypt.
Auto-deploy on push pra `main` no GitHub. Auth via header `X-MCP-Auth: <token>`
protege `/mcp`; `/health` publico.

**MCP_HTTP_URL final:** `https://mcp-gestor-lfpro.ecoup.digital/mcp`

**Por que VPS prod (Coolify) — atualizacao pos Fase 30-05:**
- HTTPS gratis via Traefik + Let's Encrypt (vs HTTP IP:porta da iteracao
  inicial)
- Subdominio dedicado (vs IP exposto)
- Auto-redeploy on git push (vs `docker build` + `docker run` manual)
- Logs centralizados via Coolify dashboard
- Mesma infra dos outros apps customer-facing (consistencia operacional)
- Iteracao inicial (VPS dev `91.98.164.71:3030`) descartada apos validacao
  do plano 30-05 (decisao revisada pelo Jonathan)

**Auth obrigatorio em prod:**
- `MCP_AUTH_TOKEN` setado no Coolify env e no Supabase Vault
- Sem token, requests pra /mcp retornam 401
- Proteje contra acesso publico direto via subdomain scan

**Cliente local (Claude Code stdio):**
- NAO usa HTTP, usa stdio direto via `node dist/index.js`
- Nao precisa de auth token (filesystem-level isolation)

## Arquitetura

```
src/
  index.ts                 entrypoint, detecta --http :PORT
  server.ts                builds @modelcontextprotocol/sdk Server
  supabase.ts              client singleton com SERVICE_ROLE
  semantic/
    types.ts               MetricDef, SegmentDef, SemanticLayer
    loader.ts              loader + cache do metrics.yaml
  transport/
    stdio.ts               StdioServerTransport para Claude Code
    http.ts                StreamableHTTPServerTransport para edge function Deno
  tools/
    registry.ts            registry central + Zod safeParse + zodToJsonSchema
    util.ts                PeriodSchema, resolvePeriod, envelope, notAvailable
    index.ts               registerAllTools() — chama todos register()
    performance/*.ts       7 tools
    cro/*.ts               5 tools
    crm/*.ts               6 tools
    growth/*.ts            4 tools
    regional/*.ts          3 tools
    products/*.ts          5 tools
    traffic/*.ts           4 tools
    cross/*.ts             6 tools
config/
  metrics.yaml             22 metricas + 5 segments certificados
tests/
  semantic.test.ts
  tools.test.ts
```

## Adicionar nova tool

1. Criar `src/tools/<area>/<nome>.ts` exportando `register(): void`
2. Definir Zod input + handler com `getSupabase()` + retorno `envelope(...)`
3. Importar e chamar `register()` em `src/tools/index.ts`
4. Se a tool computa metrica nova, adicionar em `config/metrics.yaml`
5. `npm run build && npm test`

## Tools por area

### Performance (7)
- `get_revenue` — receita liquida BRL no periodo (orders pagos test=false)
- `get_aov` — ticket medio por periodo (opcional segment filter)
- `get_orders_count` — volume de pedidos
- `get_conversion_rate` — sessoes -> orders (requer `sessions_by_region`)
- `get_ltv_by_cohort` — LTV por mes de aquisicao
- `get_repeat_purchase_rate` — % clientes 2+ pedidos no periodo
- `get_revenue_concentration_index` — top_n_share + Gini

### CRO (5)
- `get_funnel_metrics` — landing/page/orders (cart/checkout = null sem tracking)
- `get_cart_abandonment` — proxy: pages>=3 sem order
- `get_checkout_dropoff` — not_available (event tracking nao implementado)
- `get_session_quality` — bounce_rate, pages_per_session
- `get_landing_page_performance` — top landing_site por revenue

### CRM (6)
- `get_rfm_distribution` — segments atuais (Champions, Em Risco, etc)
- `get_rfm_shifts` — not_available (customer_rfm_history nao existe)
- `get_at_risk_customers` — segment=Em Risco com LTV >= threshold
- `get_reactivation_candidates` — segment=Hibernando com LTV >= threshold
- `get_new_vs_returning` — primeiro pedido vs returning, share %
- `get_customer_concentration` — top_n share + curva (top_1, top_5, top_10, top_50, rest)

### Growth (4)
- `get_revenue_mix` — share por dimension (channel, utm_*, segment)
- `get_growth_decomposition` — log decomposition revenue = traffic*conv*AOV
- `get_acquisition_by_source` — top utm_source com share + new customers
- `compare_periods` — compara qualquer metrica certificada (delegada via callTool)

### Regional (3)
- `get_orders_by_state` — agrupa por province_code (BR estado)
- `get_region_share_shifts` — apples-to-apples entre 2 periodos
- `get_state_performance` — drill-down 1 estado + top products

### Produtos (5)
- `get_top_products` — top by revenue ou volume
- `get_product_velocity_changes` — accelerating + decelerating
- `get_dead_inventory` — produtos sem vendas nos ultimos N dias
- `get_product_seasonality` — by_month + by_dow + peak (requer 90+ dias)
- `get_basket_analysis` — pares de produtos co-occurrence + lift

### Trafego (4)
- `get_roas_by_channel` — Meta + Google unified ROAS, CTR, CPA
- `get_spend_efficiency` — CPM, CPC, CPA per channel
- `get_attribution_summary` — last-click vs all_conversions Google
- `get_creative_top_performers` — top ads por ROAS (apenas sinaliza, nao recomenda)

### Cross-cutting (6)
- `query_anomalies` — z-score sobre serie temporal (sensitivity low/medium/high)
- `get_correlation` — Pearson entre 2 metricas alinhadas por dia
- `cohort_analysis` — acquisition_month -> ltv|orders por periodo
- `forecast_simple` — linear regression sobre 30d, max 30d ahead
- `compare_shares` — apples-to-apples share de region|utm_source entre 2 periodos
- `get_recent_insights` — memoria curta da tabela `insights`

**Total: 7+5+6+4+3+5+4+6 = 40 tools**

## Semantic layer (`config/metrics.yaml`)

22 metricas certificadas com formula + sources + unit:

- **Receita:** revenue, aov, orders_count, repeat_purchase_rate
- **CRO:** conversion_rate, cart_abandonment_rate, bounce_rate, pages_per_session
- **CRM:** ltv_by_cohort, revenue_concentration_index, customer_concentration,
  rfm_distribution, rfm_shifts
- **Trafego:** roas, cpm, cpc, cpa, ctr, attribution_assist_ratio
- **Outros:** region_share, product_velocity, basket_size

5 segments RFM: champions, loyal, at_risk, hibernating, new_customer.

Convencoes: timezone America/Sao_Paulo, money em cents, paid_statuses
[PAID, PARTIALLY_PAID], test_orders_excluded sempre.

## Decisoes arquiteturais (extraidas do plano)

1. **Service role key direta nas tabelas** — RPCs SECURITY DEFINER do dashboard
   tem `auth.uid()` guard que rejeita service_role. MCP usa upsert/select direto
   espelhando padrao das Fases 27-01/28-01.
2. **Schema mismatch tratado** — plano original assumiu `total_price_cents`,
   schema real tem `total_price` (numeric BRL). Tools convertem real->cents
   nos campos de output relevantes.
3. **Tabelas indisponiveis -> not_available** — `sessions_by_region`,
   `customer_rfm_history`, `shopify_products` nao existem em prod (Fase 04
   populou rfm_segment direto em shopify_customers; sessions sao dependencia
   futura). Tools afetadas retornam `{not_available: true, reason: '...'}`
   sem throw, permitindo agente cognitivo pivotar.
4. **Apples-to-apples explicito** — `get_region_share_shifts` e `compare_shares`
   normalizam denominator entre periodos (mesma fonte, mesmo numerador, mesmo
   denominador). Licao da Fase 29 incorporada.
5. **Tools so sinalizam, nao recomendam acao** — `get_creative_top_performers`,
   `get_at_risk_customers`, etc apenas retornam dados. Decisao de acao fica
   com humano (Plano 30-02 skills + agent loop).

## Variaveis de ambiente

| Var | Required | Default | Descricao |
|-----|----------|---------|-----------|
| `SUPABASE_URL` | sim | — | `https://ueskvgvakuyzkkhhalof.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | — | full access; bypassa RLS |
| `MCP_HTTP_PORT` | nao | `3030` | porta HTTP transport |
| `MCP_HTTP_BIND` | nao | `127.0.0.1` | bind address (use `0.0.0.0` em Docker) |
| `MCP_AUTH_TOKEN` | sim em prod HTTP | — | token 32+ bytes hex; obriga `X-MCP-Auth` em /mcp |

## Testes

```bash
npm test
# 2 test files, 12 tests:
# - tests/semantic.test.ts (6 tests)
# - tests/tools.test.ts (6 tests, valida 40 tools registradas + Zod safeParse)
```

## Smoke real validado

`get_revenue last_7d` retornou `{revenue_brl: 155536.76, orders_considered: 780}`
— ZERO drift cross-checked vs query SQL paginated direta no Supabase prod
(2026-04-21 → 2026-04-28, 780 orders pagos test=false).

`get_orders_by_state last_7d`: SP 262 orders R$ 50.917 (32.71%), RS 112 orders
R$ 22.415 (14.4%), MG 75 orders R$ 14.271 (9.17%).

`get_roas_by_channel last_7d`: meta R$ 15k spend ROAS 3.03, google R$ 2.5k
spend ROAS 8.72, total ROAS 3.84.

`get_rfm_distribution`: 89.805 customers, top 3 segments Perdidos 62k (69.36%),
Hibernando 10k (11.71%), Novos 5k (5.54%).

## Next steps (Plano 30-02 e alem)

- Plano 30-02: 7 skills + agent loop com tool-calling
- Plano 30-03: schema migration insights v2 + cron orquestrador
- Plano 30-04: painel `/insights` reformulado com 7 tabs
- Plano 30-05: Claude Code integration + runbook + smoke production
