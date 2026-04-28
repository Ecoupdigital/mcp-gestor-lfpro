# Casos de uso — Claude Code interativo (mcp-gestor-lfpro)

Apos registrar o MCP server:

```bash
claude mcp add gestor-lfpro --scope user -- node /home/projects/mcp-gestor-lfpro/dist/index.js
claude mcp list   # gestor-lfpro: connected
```

Reinicia Claude Code (saia da sessao, abra nova). Esses casos sao perguntas
ad-hoc que o agente Claude vai responder usando **as 40 tools** do MCP server.
Todos foram validados em prod (smoke ZERO drift, ver SUMMARY 30-01).

> Tempo medio: 8-15 segundos por pergunta (3-5 tool calls).

---

## 1. "Como tah o RS hoje?"

**Workflow esperado do agente:**

1. `get_orders_by_state(period={preset:"last_7d"})` — pega numeros de RS
2. `get_state_performance(state="RS", period={preset:"last_7d"})` — drill orders, revenue, AOV
3. `get_region_share_shifts(period_atual={preset:"last_7d"}, period_baseline={preset:"last_30d"})` — share esta caindo?
4. Se share caiu: `get_roas_by_channel(period={preset:"last_7d"})` — gasto Meta caiu por la?

**Output esperado:**

```
RS últimos 7d:
- Pedidos: 234
- Receita: R$ 18.450 (10.5% do total nacional)
- AOV: R$ 78.84
- Share atual: 10.5% (era 12.3% nos 30d anteriores → -1.8pp)

Possivel causa: gasto Meta na regiao caiu 28% no mesmo periodo.
Sugestao: revisar campanhas Meta de RS antes da reuniao de quinta.
```

---

## 2. "Investiga taxa de conversao ultimos 30d"

**Tools chamadas (sequencia tipica):**

- `compare_periods(metric="conversion_rate", period_a={preset:"last_30d"}, period_b={preset:"last_60d"})`
- `get_funnel_metrics(period={preset:"last_30d"})`
- `get_session_quality(period={preset:"last_30d"}, by="device")`
- `get_landing_page_performance(period={preset:"last_30d"}, top_n=10)`

**Resposta esperada:**

- Numero atual + delta vs baseline
- Se delta absoluto > 5%: drill em qual passo do funnel perdeu
- Se device-specific: apontar mobile vs desktop

> Nota: alguns sub-tools (`get_session_quality`, `get_funnel_metrics`)
> podem retornar `not_available:true` enquanto a Fase 06 (sessions) nao
> rodar. Agente vai pivotar e usar so o que esta disponivel.

---

## 3. "Quem virou At Risk semana passada?"

**Tools:**

- `get_at_risk_customers(ltv_threshold_cents=50000, period={preset:"last_7d"})`
- `get_rfm_distribution()` — confirma counts dos segments

**Output:**

- Lista top 10 At Risk por LTV (email_hash, LTV em R$, dias desde ultimo pedido)
- Total LTV em jogo (R$ X em risco)
- Sugestao de campanha de reativacao

> RFM shifts (delta vs semana passada) ainda usa snapshot live —
> `customer_rfm_history` daily nao existe (issue adiado, ver
> Plano 30-01 SUMMARY).

---

## 4. "Top 5 produtos com queda de velocidade"

**Tools:**

- `get_product_velocity_changes(period_atual={preset:"last_14d"}, period_baseline={preset:"last_30d"})`
- Pra cada top decel: `get_product_seasonality(product_id="<gid>")` —
  confirma se eh sazonal antes de marcar warning

**Resposta:**

- Tabela com 5 produtos: titulo, velocity atual, baseline, delta_pct, is_seasonal (sim/nao)
- Recomendacao apenas se nao-seasonal: revisar estoque OU promo OU descatalogar

---

## 5. "Cruza ROAS Meta vs receita Shopify ultimos 14d"

**Tools:**

- `get_roas_by_channel(period={preset:"last_14d"})`
- `get_revenue(period={preset:"last_14d"})` — total Shopify
- `get_revenue_mix(period={preset:"last_14d"}, dimension="channel")` —
  share por canal
- `get_correlation(metric_a="roas", metric_b="revenue", period={preset:"last_14d"})`
  — opcional, se quiser numero formal

**Resposta esperada:**

- Tabela: gasto Meta + ROAS Meta + receita atribuida (last-click) + receita total Shopify
- Calculo: % da receita Shopify atribuivel a Meta last-click
- Comparacao com Google Ads (paralelo)

---

## 6. "Tah caro ou barato adquirir cliente em SP vs RS?"

**Tools:**

- `get_state_performance(state="SP", period={preset:"last_30d"})` +
  `get_state_performance(state="RS", period={preset:"last_30d"})`
- `compare_shares(dimension="region", period_a={preset:"last_30d"}, period_b={preset:"last_60d"})`
- `get_acquisition_by_source(period={preset:"last_30d"})` — opcional, se
  quer cruzar com UTM source

**Resposta:**

- Compara new customers por estado, AOV, repeat purchase rate
- Se UTM tracking estiver disponivel: CAC estimado por canal x estado
- Conclusao: SP e RS comparativos por vatia em receita

---

## 7. "Roda a skill `customer-health` agora"

**Tool:** A skill nao executa via MCP tool — ela e orquestrada pela edge
function `agente-cognitivo` no servidor. Mas o Claude Code pode pedir as
mesmas tools que a skill faria, sequenciais:

1. `get_recent_insights(category="crm", days_back=2)` — anti-spam
2. `get_rfm_distribution()`
3. `get_at_risk_customers(ltv_threshold_cents=30000)`
4. `get_reactivation_candidates(ltv_threshold_cents=30000)`

**Resposta:**

- Sumario do estado de saude da base (% por segmento)
- Top contas em risco / hibernando com LTV alto
- Sugestao: rodar campanha de reativacao para top N

---

## Tips finais

- **Pergunta vaga ("como tao as vendas?"):** o agente provavelmente vai
  chamar `daily-performance-review` workflow (revenue + delta + top desvios).
  Pra resposta mais focada, especifique periodo e metrica.

- **Tempo de resposta:** 8-15s para queries simples (1-3 tool calls),
  20-30s para investigacoes cross-domain (5+ tool calls).

- **`not_available:true`:** quando uma tool retorna isso, significa que a
  tabela base nao existe em prod (sessions, customer_rfm_history,
  shopify_products). NAO eh erro — o agente deve pivotar para alternativas.

- **Apples-to-apples:** quando comparar 2 periodos, sempre cite o
  denominador. As tools `get_region_share_shifts` e `compare_shares` ja
  validam que o denominador bate (`denominator_match: true`) — se voce
  ver `false`, NAO confie no delta.

- **Tools nao decidem acao:** elas SO sinalizam dados. O agente Claude
  vai sugerir acoes mas isso eh humano-friendly, nao automacao
  (decisao 30-CONTEXT 11: "IA NUNCA decide").

---

## Reset cache de skill

Se voce editar `dashboard/lib/insights/agent/skills/<name>.md`, o agente
cognitivo edge function tem cache O(1). Para forçar reload:

```bash
# Re-mirror em _shared/ + re-bundle SKILLS_EMBEDDED + redeploy
cp dashboard/lib/insights/agent/skills/<name>.md \
   supabase/functions/agente-cognitivo/_shared/skills/<name>.md
bash /tmp/build-skills-embedded.sh
SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy agente-cognitivo \
  --no-verify-jwt --project-ref ueskvgvakuyzkkhhalof
```
