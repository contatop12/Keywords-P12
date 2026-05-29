# SOP: Avaliação / Classificação de Palavras-Chave (Agente de Análise)

## Objetivo
Classificar cada palavra-chave de um estudo em 4 níveis, do melhor para o pior, para pintar
o fundo da linha na tabela e gerar a lista de negativas. A classificação automática é ponto de
partida — o gestor pode reclassificar qualquer palavra manualmente.

## Modelo de classificação (TRAVADO)
| Tier (machine)            | Rótulo (UI)            | Cor      | Significado |
|---------------------------|------------------------|----------|-------------|
| `oportunidade_excelente`  | Oportunidade Excelente | azul     | Relevante, com algum alcance e barata/ganhável (concorrência baixa, CPC baixo ou tendência em alta). |
| `otimo`                   | Ótimo                  | verde    | Núcleo sólido (volume alto, ou volume médio sem concorrência alta). Vale rodar mesmo disputada. |
| `talvez`                  | Talvez                 | amarelo  | Relevante porém incerta (sinal fraco/baixo volume, ou cara e disputada sem alcance). |
| `negativar`               | Negativar              | vermelho | Sem intenção comercial ligada ao nicho (informacional, produto errado, fora do tema, marca irrelevante). |

Hierarquia: **Oportunidade Excelente > Ótimo > Talvez > Negativar**.

## Entradas
- `tabs` (resultado do `/api/google/multi-study`) **ou** `items` (lista de `InterestItem`).
- `seeds` (palavras-base do estudo) — contexto.
- `niche` (nicho/especialidade) — contexto para o gate de intenção.

Campos relevantes por item: `name`, `media_pesquisas` (volume), `concorrencia`
(Baixo/Médio/Alto), `grau_concorrencia` (0–100), `menor_lance_topo`/`maior_lance_topo` (CPC R$),
`mudanca_tres_meses`, `mudanca_ano_anterior` (strings ex. `+12%`).

## Arquitetura (3 camadas / DOE)
- **Diretiva:** este arquivo.
- **Execução determinística:** `frontend/lib/server/keywordEvaluator.ts` — pontuação e régua.
- **IA (só no julgamento):** gate de intenção em `frontend/lib/server/openRouter.ts`
  (`classifyKeywordIntent`) — decide apenas se a palavra deve ser `negativar` por falta de
  intenção comercial / fora do nicho. Nunca decide os outros tiers.
- **Rota:** `frontend/app/api/google/evaluate/route.ts` (`POST /api/google/evaluate`).

## Régua determinística (defaults, ajustáveis por env `EVALUATOR_*`)
Escopo de cálculo: `per_tab` (default) ou `global` (`EVALUATOR_SCOPE`).

1. **Gate de intenção (IA, se `EVALUATOR_INTENT_FILTER_ENABLED`):** itens sem intenção comercial
   ligada ao nicho → `negativar`. Edge: termos de marca/concorrente relevantes ao nicho NÃO são
   negativados só por serem marca.
2. **Pontuações** (0–1, relativas ao escopo):
   - `score_value` = posição percentil do `media_pesquisas` no escopo (volume).
   - `score_eficiencia` = média de: `(1 - grau_concorrencia/100)`, baixo CPC (percentil invertido
     de `maior_lance_topo`), bônus de tendência (`mudanca_*` positiva).
3. **Classificação** (após excluir `negativar`):
   - `oportunidade_excelente`: `media_pesquisas ≥ EVALUATOR_MIN_VOLUME` **e**
     (`grau_concorrencia ≤ EVALUATOR_COMP_BAIXA_MAX` **ou** CPC abaixo da mediana do escopo
     **ou** tendência em alta) **e** `score_eficiencia ≥ EVALUATOR_P_EXCELENTE`.
   - `otimo`: `score_value ≥ EVALUATOR_P_OTIMO` **ou**
     (volume ≥ MIN_VOLUME **e** `grau_concorrencia < EVALUATOR_COMP_ALTA_MIN`).
   - `talvez`: todo o resto relevante.

## Saída esperada
```jsonc
{
  "tabs": [ { "name": "...", "items": [ { ...InterestItem,
     "classificacao": { "tier": "...", "rotulo": "...", "motivo": "...",
                        "score_value": 0.0, "score_eficiencia": 0.0 } } ] } ],
  "resumo": { "oportunidade_excelente": N, "otimo": N, "talvez": N, "negativar": N },
  "labels": { "oportunidade_excelente": "Oportunidade Excelente", "...": "..." }
}
```
(Para entrada `items`, retorna `{ "items": [...], "resumo": {...}, "labels": {...} }`.)

## Knobs `.env`
- `EVALUATOR_ENABLED` (default `true`)
- `EVALUATOR_INTENT_FILTER_ENABLED` (default `true`)
- `EVALUATOR_SCOPE` = `per_tab` | `global` (default `per_tab`)
- `EVALUATOR_MIN_VOLUME` (default `30`)
- `EVALUATOR_P_EXCELENTE` (default `0.60`)
- `EVALUATOR_P_OTIMO` (default `0.55`)
- `EVALUATOR_COMP_BAIXA_MAX` (default `33`)
- `EVALUATOR_COMP_ALTA_MIN` (default `66`)

## Edge cases
- Sem `OPENROUTER_API_KEY`: pular o gate de intenção (não derruba a avaliação); registrar aviso.
  A régua determinística roda mesmo assim.
- `media_pesquisas`/`grau_concorrencia` ausentes: tratar como 0 / desconhecido; tende a `talvez`.
- Termos de marca/concorrente de baixo volume podem cair em `talvez` — mitigado pela
  reclassificação manual.
- IA retorna JSON inválido: ignorar o gate naquele lote (sem negativar por intenção), seguir régua.

## Self-anneal
Em falha: registrar causa, corrigir `keywordEvaluator.ts`/gate, testar com estudo real,
atualizar esta diretiva.
