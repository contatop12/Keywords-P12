# 📄 PRD — Estrutura de Campanha Google Ads (Análise + Criador + Painéis)

> Documento para execução pelo **Claude Code** dentro do repositório `Keywords-P12`.
> Siga a arquitetura de 3 camadas do `AGENTS.md` (Diretivas → Orquestração → Execução):
> lógica determinística em serviços/execução, IA só no julgamento, SOPs em `directives/`.

---

## 🎯 Objetivo

Adicionar à Keywords-P12 duas etapas novas e **desacopladas**, mais uma superfície de
gestão conectada ao Google Ads:

1. **Agente de Análise** — classifica as palavras-chave do estudo em 4 níveis (pintando
   o fundo da linha na tabela). Roda sozinho e seu resultado já é entregável (quem quiser
   monta a campanha na mão).
2. **Agente Criador de Estrutura** — opcional; analisa o estudo + a classificação e monta
   uma estrutura de campanha completa no modelo selecionado (**Search primeiro**).
3. **Painéis + Dashboard** — cada estrutura vira um painel próprio, editável, sincronizável
   com o Google Ads; um dashboard guarda todos os painéis.

Os dois agentes são independentes de propósito: o usuário pode parar na Análise.

---

## 👤 Usuário-alvo

Gestor de tráfego da agência P12 (uso interno). Sem login/multi-tenant no MVP.

---

## 🧱 Contexto técnico (estado atual do repo)

- **Backend:** FastAPI (`backend/`). Serviços relevantes: `multi_study_service` (Estudo
  Multi-Aba), `google_service` (Google Ads Keyword Planner — **somente leitura**, via
  `KeywordPlanIdeaService`), `ai_service` (LLM via OpenRouter, JSON), `relevance_agent`
  (determinístico), `keyword_planner_agent` / `agebri_service` (geram seeds de briefing),
  `study_service`, `export_service`, `sheets_export_service`.
- **Frontend:** Next.js (deploy Cloudflare Workers via open-next). Páginas: `/` (estudo
  single), `/multi` (Estudo Multi-Aba — resultado em `result.tabs[].items[]`), `/history`.
  Persistência atual via `frontend/lib/storage.ts` + rotas `app/api/studies`.
- **LLM:** OpenRouter (`settings.openrouter_model`, default `google/gemini-flash-1.5`).
- **Google Ads:** OAuth com refresh token (`settings.google_ads_*`), hoje só leitura.
- **Modelo de dados das keywords:** `InterestItem` (`backend/schemas/meta.py`) já traz
  `media_pesquisas`, `grau_concorrencia`, `concorrencia`, `menor_lance_topo`,
  `maior_lance_topo`, `mudanca_tres_meses`, `mudanca_ano_anterior`, `searches_mensais`.

---

## 🔁 Visão geral do fluxo

```
Briefing/AGEBRI → seeds → Estudo Multi-Aba (métricas)
   → [Agente de Análise]  ──→ estudo classificado (entregável por si só)
        └─ (opcional) [Agente Criador] → Estrutura (Rascunho)
              → Painel (editável)  ──Subir──→  Google Ads  ──sync↔──  Painel (Ativo)
   Dashboard guarda todos os painéis.
```

---

## 🎨 Modelo de classificação (TRAVADO)

4 níveis, do melhor para o pior. A cor pinta o **fundo da linha** da palavra na tabela.

| Tier (machine)            | Rótulo (UI)            | Cor   | Significado |
|---------------------------|------------------------|-------|-------------|
| `oportunidade_excelente`  | Oportunidade Excelente | 🟦 azul    | Relevante, com algum alcance e **barata/ganhável** (concorrência baixa, CPC baixo ou tendência em alta). A oportunidade que se destaca. |
| `otimo`                   | Ótimo                  | 🟩 verde   | Núcleo sólido (volume alto, ou volume médio sem concorrência alta). Vale rodar mesmo disputada. |
| `talvez`                  | Talvez                 | 🟨 amarelo | Relevante porém incerta (sinal fraco/baixo volume, ou cara e disputada sem alcance). Testar depois. |
| `negativar`               | Negativar              | 🟥 vermelho| Sem intenção comercial ligada ao nicho (informacional, produto errado, fora do tema, marca irrelevante). |

Hierarquia: **Oportunidade Excelente > Ótimo > Talvez > Negativar**. O usuário pode
**reclassificar manualmente** qualquer palavra (a classificação automática é ponto de partida).

---

## 🔗 Modelo de sincronização (TRAVADO)

- Sync é **bidirecional**: painel ↔ Google Ads.
- **Painel → Google Ads:** instantâneo, via `mutate` na hora da edição.
- **Google Ads → painel:** por **verificação periódica/reconciliação** — o Google Ads
  **não tem webhook**; o histórico de mudanças cobre ~30 dias e nem todo tipo de alteração.
  Logo, é "quase em tempo real", não push instantâneo dos dois lados. (Documentar essa
  limitação na UI.)
- **Ao subir, criar tudo PAUSADO** no Google Ads. "Ativo" no painel = *sincronizado/ligado
  à conta*, não necessariamente *veiculando* — veicular é um controle separado.
- Controles do painel: **Sincronizar · Dessincronizar · Pausar · Ativar**.

---

## ✅ FASE 1 — Inteligência + tela de estrutura (sem tocar no Google Ads)

Zero risco/custo. No fim da fase: briefing → estudo → avaliar → (opcional) montar →
estrutura Search completa e editável dentro do app.

### 1.1 Agente de Análise — backend — ✅ JÁ IMPLEMENTADO

Aplicado pelo patch `agente-analise-fase1.patch`. **Não reconstruir; apenas integrar.**

Arquivos:
- `backend/services/keyword_evaluator_agent.py` — lógica híbrida (determinístico + gate
  de intenção via IA). Funções: `evaluate_items`, `evaluate_tabs`, `summarize`, constantes
  `TIER_*` e `TIER_LABELS`.
- `backend/routes/evaluate.py` — `POST /api/google/evaluate`.
- `directives/keyword_evaluation.md` — diretiva (régua + edge cases).
- `backend/core/config.py` — knobs `EVALUATOR_*`.
- `backend/main.py` — registro do router.

Contrato do endpoint:
```
POST /api/google/evaluate
Request:  { "tabs": <result do /multi-study>, "seeds": ["..."], "niche": "..." }
      ou: { "items": [<InterestItem>...], "seeds": ["..."], "niche": "..." }
Response (tabs): {
  "tabs": [ { "name": "...", "items": [ { ...InterestItem,
      "classificacao": { "tier": "...", "rotulo": "...", "motivo": "...",
                         "score_value": 0.0, "score_eficiencia": 0.0 } } ] } ],
  "resumo": { "oportunidade_excelente": N, "otimo": N, "talvez": N, "negativar": N },
  "labels": { ...tier→rótulo }
}
```
Knobs `.env`: `EVALUATOR_ENABLED`, `EVALUATOR_INTENT_FILTER_ENABLED`, `EVALUATOR_SCOPE`
(`per_tab`|`global`), `EVALUATOR_MIN_VOLUME`, `EVALUATOR_P_EXCELENTE`, `EVALUATOR_P_OTIMO`,
`EVALUATOR_COMP_BAIXA_MAX`, `EVALUATOR_COMP_ALTA_MIN`.

### 1.2 Agente de Análise — frontend — 🔨 A CONSTRUIR

Tela alvo: `frontend/app/multi/page.tsx`.

- Botão **"Avaliar palavras-chave"** na área de ações do resultado (junto de exportar
  XLSX/Sheets). Chama `/api/google/evaluate` com `result.tabs` + as seeds do estudo.
- Ao retornar, **pintar o fundo de cada linha** da tabela conforme `classificacao.tier`
  (🟦/🟩/🟨/🟥). Mostrar o `rotulo` e o `motivo` (tooltip ou coluna).
- Permitir **reclassificar manualmente** uma linha (dropdown com os 4 níveis); a mudança
  sobrescreve o tier daquele item no estado.
- **Saída independente (caminho manual):** botão para **re-exportar o estudo classificado**
  — XLSX/Sheets com as linhas coloridas e uma aba/coluna com a **lista de negativas** pronta
  pra colar no Google Ads. (Estender `export_service`/`sheets_export_service`.)
- Arquivos: `frontend/lib/api.ts` (função `evaluateKeywords`), `frontend/lib/types.ts`
  (tipo `Classificacao` + união de tiers + cores), constante de cores por tier.

Critérios de aceitação:
- [ ] Clicar "Avaliar" classifica todas as palavras e colore as linhas.
- [ ] As 4 cores aparecem corretas e o motivo é visível.
- [ ] Reclassificação manual persiste no estado da sessão.
- [ ] Exportar estudo classificado gera arquivo com cores + lista de negativas.

### 1.3 Perfil do Cliente — 🔨 A CONSTRUIR

Entidade/formulário com os dados que a estrutura de campanha precisa (o template Vita
exige). Reaproveitado pelo Criador e pelo push (Fase 2).

Campos: nome da empresa, URL(s) final(is), telefone (com DDD), endereço, horário de
funcionamento, locais/geo, idioma, marcas trabalhadas, serviços, faixas de preço/produtos,
promoção (tipo + %), orçamento diário, estratégia de lance, ações de conversão.

- Persistência (estender `storage.ts` / rotas `app/api/...`; ou tabela `clients`).
- Formulário com criar/editar/listar; reutilizável no Criador.

Critérios de aceitação:
- [ ] Criar/editar/listar perfis; um perfil é selecionável ao montar estrutura.
- [ ] Campos suficientes para preencher todos os recursos do modelo Search.

### 1.4 Agente Criador de Estrutura (Search) — 🔨 A CONSTRUIR

- `backend/services/campaign_builder_agent.py` + `directives/campaign_structure.md` +
  `POST /api/google/build-campaign`.
- **Entrada:** keywords aprovadas (tiers ≠ `negativar`) agrupadas por aba (**1 aba = 1 grupo
  de anúncios**) + `client_profile` + `campaign_objective` (`search` no MVP).
- **Saída:** objeto `Structure` completo (ver schema abaixo). A IA escreve a copy; o código
  determinístico **valida os limites de caractere** e a estrutura.
- Seguir o modelo do template Vita (resumido em "Modelo de estrutura Search").

Critérios de aceitação:
- [ ] Gera campanha + grupos (1 por aba) + RSA + keywords + negativas globais + recursos.
- [ ] Nenhum texto excede os limites de caractere (validação automática).
- [ ] Reaproveita `client_profile` para nome, URL, telefone, marcas, preços, promoção etc.

### 1.5 Painel + Dashboard — 🔨 A CONSTRUIR

- `frontend/app/structures/page.tsx` (Dashboard) — lista todos os painéis com status,
  cliente, objetivo, data; visão de análise rápida (ex.: contagem por tier do estudo de
  origem, nº de grupos/keywords). **Aqui pode mostrar o estudo de cada painel.**
- `frontend/app/structures/[id]/page.tsx` (Painel) — **só dados da estrutura, sem métricas**.
  Ver/editar todos os campos (campanha, grupos, anúncios, keywords, negativas, recursos).
- Status inicial **Rascunho**. Botões **Sincronizar/Dessincronizar/Pausar/Ativar** presentes
  porém **inativos** nesta fase (ativados na Fase 2).
- Persistência das estruturas (estender storage / rotas `app/api/structures`).

Critérios de aceitação:
- [ ] Cada estrutura criada gera um painel próprio salvo e listado no dashboard.
- [ ] Todos os campos da estrutura são editáveis no painel; sem métricas.
- [ ] Botões de sync visíveis e desabilitados, com tooltip "disponível na Fase 2".

---

## ✅ FASE 2 — Subir e sincronizar com o Google Ads

> ⚠️ **Dependência externa (resolver em paralelo):** para subir em **conta de produção**, o
> developer token precisa de acesso **Basic/Standard** (conta de teste funciona com qualquer
> token). Pedir esse acesso ao Google já durante a Fase 1 — a aprovação demora.

### 2.1 OAuth de escrita + seleção de conta
- Estender o OAuth atual para o escopo de escrita (`adwords`); selecionar `customer_id`
  (MCC → cliente). Validar acesso antes de permitir push.

### 2.2 Mapeador `Structure` → operações `mutate`
- Tradução determinística do objeto `Structure` para operações da Google Ads API:
  `CampaignBudget`, `Campaign` (status **PAUSED**, rede Search), `CampaignCriterion`
  (geo, idioma, **negativas**), `AdGroup`, `AdGroupCriterion` (keywords + correspondência),
  `AdGroupAd` (Responsive Search Ad), `Asset`/`AssetSet` + vínculos (sitelinks, callouts,
  structured snippets, imagens, ligação, lead form, promoção, preço). Parte mais delicada;
  construir incrementalmente e testar em **conta de teste**.

### 2.3 Botão "Subir pro Google Ads"
- `POST /api/google/structures/{id}/push` → executa o `mutate`, grava os `resource_name`
  retornados de volta na `Structure` (mapa ID local ↔ recurso Google Ads), status → **Ativo**.
  Tudo criado **PAUSADO**.

### 2.4 Sincronização bidirecional + controles
- Painel → Ads: editar campo em estrutura Ativa dispara `mutate` (update) do recurso.
- Ads → painel: job de reconciliação periódico (limites do §"Modelo de sincronização").
- Controles **Pausar/Ativar** (status de veiculação da campanha, separado do status do
  painel) e **Dessincronizar** (desliga o espelho).

### 2.5 Segurança
- Preview/dry-run antes de subir (mostrar exatamente o que será criado), idempotência,
  tratamento de erro/rollback, validação de limites e política do Google Ads.

Critérios de aceitação:
- [ ] Subir uma estrutura Search cria tudo PAUSADO e linka os `resource_name`.
- [ ] Editar no painel (Ativo) reflete no Google Ads.
- [ ] Mudança no Google Ads reflete no painel após reconciliação.
- [ ] Pausar/Ativar/Dessincronizar funcionam.

---

## ✅ FASE 3 — Escala
- Demais objetivos em ordem de uso (provável: Performance Max → Demand Gen → Display →
  Vídeo), cada um com seu builder + mapeador + painel adaptado.
- Multi-cliente/contas, permissões, log de auditoria do que foi enviado.
- (Opcional) Sync Ads→painel mais robusto.

---

## 📦 Contrato de dados — objeto `Structure` (Search MVP)

Modelar como Pydantic (backend) + tipo TS (frontend). Esqueleto:

```jsonc
{
  "id": "uuid",
  "client_profile_id": "uuid",
  "objetivo": "search",
  "status": "rascunho",            // rascunho | ativo  (sync)
  "veiculacao": "pausada",         // pausada | ativa   (serving no Google Ads)
  "google_ads": { "customer_id": null, "campaign_resource_name": null },
  "campanha": {
    "nome": "string",
    "orcamento_diario": 0.0,
    "estrategia_lance": "maximizar_conversoes",
    "locais": ["string"],
    "idiomas": ["pt"],
    "rede": "search",
    "agendamento": "todos os dias",
    "conversoes": ["string"]
  },
  "grupos": [{
    "nome": "string",
    "url_final": "string",
    "keywords": [{ "texto": "string", "correspondencia": "ampla|frase|exata" }],
    "anuncio_rsa": {
      "titulos": ["≤30 chars (até 15)"],
      "descricoes": ["≤90 chars (até 4)"],
      "caminhos": ["≤15 chars (até 2)"]
    }
  }],
  "negativas_campanha": ["string"],
  "recursos": {
    "sitelinks": [{ "texto": "≤25", "desc1": "≤35", "desc2": "≤35", "url": "string" }],
    "frases_destaque": ["≤25"],
    "snippets_estruturados": [{ "tipo": "Serviços|Marcas|Tipos", "valores": ["≤25"] }],
    "imagens": ["referência"],
    "ligacao": { "telefone": "string", "horario": "string" },
    "lead_form": { "headline": "≤30", "empresa": "≤25", "...": "..." },
    "promocao": { "tipo": "desconto_percentual", "valor": 0, "texto": "≤20" },
    "precos": [{ "item": "string", "a_partir_de": 0.0, "moeda": "BRL", "url": "string" }]
  }
}
```

---

## 📐 Modelo de estrutura Search (resumo do template de referência)

A estrutura segue o padrão de uma campanha de Search por grupos lado a lado (referência: a
planilha "Vita Audio — Estrutura Google Ads"). Cada grupo tem: URL final, **15 títulos
(≤30)**, **4 descrições (≤90)**, caminho de exibição (≤15), suas keywords. A campanha tem
negativas globais e um conjunto de recursos compartilhado (sitelinks, frases de destaque,
3 snippets estruturados por tipo, imagens, ligação, lead form, promoção, preços). Padrão de
copy: existe um bloco-base de copy reutilizado entre grupos, com variações por tema do grupo.

---

## 🔒 Restrições técnicas / limites

- **Limites de caractere (RSA e recursos):** títulos ≤30 · descrições ≤90 · caminhos ≤15 ·
  sitelink texto ≤25 e descrições ≤35 · frases de destaque ≤25 · snippets estruturados ≤25 ·
  nome da empresa ≤25 · texto de promoção ≤20. Validar no Criador.
- **Stack:** não introduzir banco novo na Fase 1 (usar o padrão de persistência atual);
  reservar Postgres/durável para a Fase 2 (mapeamento de `resource_name` precisa ser durável).
- **DOE:** toda lógica nova de IA num serviço + diretiva em `directives/`; manter o
  determinístico fora da IA.
- **OpenRouter:** reutilizar `ai_service._chat` (JSON, protocolo por ID) para chamadas de IA.

---

## ❌ Fora do escopo (por enquanto)
- Objetivos além de Search (Fase 3).
- Métricas/relatórios dentro do painel (o painel é só estrutura).
- Login/multi-tenant completo.
- Sync Ads→painel em tempo real instantâneo (é por reconciliação).

---

## ⚠️ Riscos e decisões em aberto
- Acesso de escrita do Google Ads (developer token Basic/Standard) — **bloqueia a Fase 2**.
- Termos de marca/concorrente são de baixo volume por natureza e podem cair em "Talvez"
  mesmo com escopo `per_tab` — mitigado pela reclassificação manual.
- Persistência das estruturas: definir destino (storage atual vs banco) antes da Fase 1.5.
```
