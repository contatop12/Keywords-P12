# Score Ponderado para Classificação de Palavras-chave

**Data:** 2026-06-02
**Escopo:** Fase A (lógica de avaliação). Fase B (travar botão + auto-cadastro de cliente) fica para spec separado.

## Problema

A classificação atual marca palavras demais como "Oportunidade Excelente".

A causa está em [keywordEvaluator.ts:181](../../../frontend/lib/server/keywordEvaluator.ts#L181):

```ts
if (temAlcance && (compBaixa || cpcBaixo || trendUp) && scoreEficiencia >= knobs.pExcelente)
```

O gate usa **OU** (`compBaixa || cpcBaixo || trendUp`): basta **um** sinal fraco para liberar o nível mais alto. `cpcBaixo` (CPC abaixo da mediana) sozinho já passa — e por definição metade das palavras está abaixo da mediana. Resultado: enxurrada de "excelente".

## Solução

Trocar o gate booleano (OU) por um **score aditivo com pesos** e **faixas (tiers) por nota**. Cada palavra acumula pontos conforme atende a filtros objetivos; quanto mais pontos (e mais pesados), maior a chance de subir de nível.

### 1. Os 7 filtros (pesos e limiares são padrão, ajustáveis por env)

| # | Filtro | Campo (`InterestItem`) | Passa quando | Peso |
|---|--------|------------------------|--------------|------|
| 1 | Volume forte | `media_pesquisas` | ≥ 2500 | 3 |
| 2 | Volume base | `media_pesquisas` | ≥ 500 | 1 |
| 3 | Crescimento 3 meses | `mudanca_tres_meses` | ≥ +10% | 3 |
| 4 | Não declina (ano a ano) | `mudanca_ano_anterior` | ≥ 0% | 1 |
| 5 | Concorrência baixa | `grau_concorrencia` | ≤ 33 | 2 |
| 6 | CPC eficiente | `maior_lance_topo` | ≤ mediana do escopo | 1 |
| 7 | Leilão estável | `(maior_lance_topo − menor_lance_topo) / maior_lance_topo` | ≤ 0.5 | 1 |

- Peso total possível = **12**.
- Filtros 1+2 dão volume **graduado**: palavra grande soma 4, média soma 1, minúscula soma 0.
- Crescimento (filtro 3) tem o peso mais alto, alinhado à prioridade do negócio.
- Filtro 6 é **relativo** (mediana do escopo); os demais são limiares **absolutos**.

### 2. Cálculo do score

```
score_total = Σ(peso dos filtros aprovados) / Σ(peso dos filtros COM dado disponível)
```

- Filtro sem dado (ex.: palavra sem CPC ou sem tendência) é **excluído do denominador** — não conta como falha. Evita punir palavra só por dado faltante.
- `score_total` fica no intervalo 0..1.

### 3. Faixas (tiers) por nota — limiares ajustáveis por env

| Condição | Tier |
|----------|------|
| Gate de intenção falhou | `negativar` (sobrepõe a nota) |
| `score_total ≥ 0.70` | `oportunidade_excelente` |
| `score_total ≥ 0.45` | `otimo` |
| `score_total ≥ 0.20` | `talvez` |
| `score_total < 0.20` | `negativar` |

O **gate de intenção** (sem intenção comercial → `negativar`) continua como hoje e **sobrepõe** o score: palavra de alto volume mas irrelevante não vira "excelente".

Efeito: "excelente" agora exige empilhar ~3+ sinais fortes (ex.: volume forte + crescendo + concorrência baixa), não mais um único CPC barato.

### 4. Mudanças de schema

Estender `Classificacao` em [types.ts](../../../frontend/lib/types.ts#L19) e [keywordEvaluator.ts](../../../frontend/lib/server/keywordEvaluator.ts#L14):

```ts
export type FiltroResultado = { nome: string; peso: number; ok: boolean };

export type Classificacao = {
  tier: Tier;
  rotulo: string;
  motivo: string;
  score_value: number;       // mantido (percentil de volume) — usado por xlsx/tabela
  score_eficiencia: number;  // mantido (eficiência antiga) — usado por xlsx/tabela
  score_total: number;       // NOVO: nota ponderada 0..1
  filtros: FiltroResultado[];// NOVO: quais filtros passaram, para transparência
};
```

`score_value` e `score_eficiencia` continuam sendo calculados como hoje, para não quebrar [classifiedXlsx.ts](../../../frontend/lib/server/classifiedXlsx.ts) nem a tabela em [multi/page.tsx](../../../frontend/app/multi/page.tsx). Os campos novos são aditivos.

### 5. Texto do motivo

`motivo` reescrito a partir dos filtros aprovados, mostrando **por que** caiu naquele nível:

> "Score 0.75 — volume forte (3.1k/mês), crescendo +18% (3m), concorrência baixa."

Para `negativar` por intenção, mantém a mensagem atual do gate.

### 6. Configuração (segue o padrão `readKnobs` por env)

Novos knobs com defaults, lidos em [keywordEvaluator.ts:48](../../../frontend/lib/server/keywordEvaluator.ts#L48):

| Env var | Default | Usa |
|---------|---------|-----|
| `EVALUATOR_W_VOL_FORTE` | 3 | peso filtro 1 |
| `EVALUATOR_W_VOL_BASE` | 1 | peso filtro 2 |
| `EVALUATOR_W_CRESC_3M` | 3 | peso filtro 3 |
| `EVALUATOR_W_CRESC_ANO` | 1 | peso filtro 4 |
| `EVALUATOR_W_CONC_BAIXA` | 2 | peso filtro 5 |
| `EVALUATOR_W_CPC` | 1 | peso filtro 6 |
| `EVALUATOR_W_LEILAO` | 1 | peso filtro 7 |
| `EVALUATOR_T_VOL_FORTE` | 2500 | limiar filtro 1 |
| `EVALUATOR_T_VOL_BASE` | 500 | limiar filtro 2 |
| `EVALUATOR_T_CRESC_3M` | 10 | limiar filtro 3 (%) |
| `EVALUATOR_T_CONC_BAIXA` | 33 | limiar filtro 5 |
| `EVALUATOR_T_LEILAO_SPREAD` | 0.5 | limiar filtro 7 |
| `EVALUATOR_TIER_EXCELENTE` | 0.70 | corte excelente |
| `EVALUATOR_TIER_OTIMO` | 0.45 | corte ótimo |
| `EVALUATOR_TIER_TALVEZ` | 0.20 | corte talvez |

Knobs antigos que deixam de ser usados pela nova lógica (`pExcelente`, `pOtimo`, `compAltaMin`): manter a leitura por enquanto para não quebrar, marcar como deprecados em comentário.

## Fora de escopo (Fase B, depois)

- Travar o botão "Avaliar palavras-chave" até o briefing do cliente estar preenchido.
- Auto-cadastrar `ClientProfile` a partir do briefing ("agente IA · keyword clusters").

## Arquivos afetados

- `frontend/lib/server/keywordEvaluator.ts` — nova função de score, novos knobs, novo `classifyScope`.
- `frontend/lib/types.ts` — `FiltroResultado`, campos novos em `Classificacao`.

## Testes

- Palavra com volume forte + crescimento + concorrência baixa → `oportunidade_excelente`.
- Palavra só com CPC abaixo da mediana (1 sinal fraco) → **não** sobe para excelente (regressão do bug atual).
- Palavra sem CPC e sem tendência → score calculado só sobre filtros com dado, sem punição.
- Palavra sinalizada pelo gate de intenção → `negativar` mesmo com volume alto.
- Limiares/pesos via env sobrescrevem os defaults.
